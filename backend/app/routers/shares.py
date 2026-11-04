"""위치공유 API (UC-05·06·07 / FR-10·11, SR-03, SIR-03)
POST   /shares                  공유 시작 → 추측하기 어려운 토큰이 든 링크 생성 (로그인 필요)
DELETE /shares/{id}             공유 종료 → 링크 즉시 무효화, 위치 삭제 (로그인 필요)
POST   /shares/{id}/locations   공유 중 내 위치 보내기, 5초마다 (로그인 필요)
GET    /shares/{token}          보호자가 링크로 위치 보기 (로그인 없음)
모든 요청에서 먼저 만료 여부를 확인함
"""
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import SHARE_EXPIRE_MIN
from ..db import get_db
from ..errors import ApiError
from ..models import Guardian, Share, User, now_utc, to_ms
from ..schemas import LastPos, LocationIn, PublicDest, PublicShareOut, ShareIn, ShareOut
from ..security import current_user, hash_share_token, new_share_token

router = APIRouter(prefix="/shares", tags=["위치공유"])


# ── 여러 API 에서 같이 쓰는 도우미 (sos.py 도 사용) ──
def share_status(s: Share) -> str:
    if s.ended_at is None:
        return "active"
    return "expired" if s.end_reason == "expired" else "ended"


def last_pos(s: Share):
    if s.last_lat is None:
        return None
    return LastPos(lat=s.last_lat, lng=s.last_lng, accuracy=s.last_accuracy, at=to_ms(s.last_at))


def share_out(s: Share, token: str | None = None) -> ShareOut:
    return ShareOut(id=s.id, token=token, type=s.kind, guardian_ids=[g.id for g in s.guardians],
                    started_at=to_ms(s.started_at), expires_at=to_ms(s.expires_at),
                    status=share_status(s), reason=s.end_reason, last=last_pos(s))


def active_shares(db: Session, user: User) -> list[Share]:
    """이 사용자의 진행 중인 공유 (만료된 건 이 자리에서 만료 처리)"""
    rows = db.scalars(select(Share).where(Share.user_id == user.id, Share.ended_at.is_(None))).all()
    return [s for s in rows if not s.expire_if_due()]


def open_share(db: Session, user: User, kind: str, guardians: list[Guardian], pos=None, dest=None, route=None):
    """새 공유 만들기. 한 사람당 진행 중인 공유는 하나만 → 이전 공유는 끝냄. (공유, 토큰 원문) 을 돌려줌"""
    for old in active_shares(db, user):
        old.close("replaced")
    token = new_share_token()
    now = now_utc()
    s = Share(user_id=user.id, kind=kind, token_hash=hash_share_token(token), started_at=now,
              expires_at=now + timedelta(minutes=SHARE_EXPIRE_MIN) if kind == "normal" else None,  # SOS 공유는 상황 종료 때까지
              guardians=list(guardians))
    if pos is not None:
        s.last_lat, s.last_lng, s.last_at = pos.lat, pos.lng, now
    if dest is not None:
        s.dest_name, s.dest_lat, s.dest_lng = dest.name, dest.lat, dest.lng
    if route:
        s.route = [[round(a, 6), round(b, 6)] for a, b in route]
    db.add(s)
    db.flush()  # id 를 받기 위해 DB에 먼저 반영 (저장 확정은 commit 에서)
    return s, token


def my_share(db: Session, user: User, share_id: int) -> Share:
    s = db.scalar(select(Share).where(Share.id == share_id, Share.user_id == user.id))
    if s is None:
        raise ApiError(404, "SHARE_NOT_FOUND", "공유를 찾지 못했어요.")
    return s


# ── API ──
@router.post("", response_model=ShareOut, status_code=201)
def create_share(body: ShareIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.type == "normal" and user.location_consent is not True:
        raise ApiError(403, "CONSENT_REQUIRED", "위치 수집에 동의해야 위치를 공유할 수 있어요. 내 정보에서 동의를 바꿀 수 있어요.")
    ids = set(body.guardian_ids)
    if not ids:
        raise ApiError(400, "NO_GUARDIAN", "공유할 보호자를 골라 주세요. 등록된 보호자가 없으면 먼저 등록해 주세요.")
    guardians = db.scalars(select(Guardian).where(Guardian.user_id == user.id, Guardian.id.in_(ids))).all()
    if len(guardians) != len(ids):  # 남의 보호자이거나 없는 번호
        raise ApiError(404, "GUARDIAN_NOT_FOUND", "보호자를 찾지 못했어요.")
    s, token = open_share(db, user, body.type, guardians, body.pos, body.dest, body.route)
    db.commit()
    return share_out(s, token)


@router.delete("/{share_id}", status_code=204)
def end_share(share_id: int, reason: Literal["user", "arrived", "sos"] = Query("user"),
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = my_share(db, user, share_id)
    if not s.expire_if_due():
        s.close(reason)  # 이미 끝난 공유면 아무것도 안 함
    db.commit()
    return Response(status_code=204)


@router.post("/{share_id}/locations", status_code=204)
def send_location(share_id: int, body: LocationIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = my_share(db, user, share_id)
    s.expire_if_due()
    if not s.is_active():
        db.commit()
        raise ApiError(410, "SHARE_CLOSED", "이미 끝난 공유예요.", status=share_status(s), reason=s.end_reason)
    s.last_lat, s.last_lng, s.last_accuracy, s.last_at = body.lat, body.lng, body.accuracy, now_utc()
    db.commit()
    return Response(status_code=204)


@router.get("/{token}", response_model=PublicShareOut)
def view_share(response: Response, token: str = Path(max_length=100), db: Session = Depends(get_db)):
    """보호자 조회: 링크 토큰만으로 확인 (로그인 없음). 끝났거나 만료된 링크는 위치 없이 이유만 알려줌"""
    response.headers["Cache-Control"] = "no-store"  # 브라우저·중간 서버가 위치를 저장해 두지 않게
    s = db.scalar(select(Share).where(Share.token_hash == hash_share_token(token)))
    if s is None:
        raise ApiError(404, "INVALID_LINK", "유효하지 않은 링크예요. 주소를 다시 확인해 주세요.")
    if s.expire_if_due():
        db.commit()
    name = s.user.name
    if not s.is_active():
        msg = {"expired": "공유 시간이 지나서 더 이상 위치를 볼 수 없어요.",
               "arrived": name + "님이 목적지에 도착해서 공유가 끝났어요."}.get(s.end_reason, name + "님이 공유를 끝냈어요.")
        raise ApiError(410, "LINK_CLOSED", msg, status=share_status(s), reason=s.end_reason)
    dest = PublicDest(name=s.dest_name, lat=s.dest_lat, lng=s.dest_lng) if s.dest_lat is not None else None
    return PublicShareOut(status="active", type=s.kind, name=name, started_at=to_ms(s.started_at),
                          expires_at=to_ms(s.expires_at), last=last_pos(s), dest=dest, route=s.route)

"""SOS API (UC-08 / FR-12, IDR-06)
POST /sos            SOS 실행 확정(취소 대기가 끝난 뒤) → 기록 저장 + 보호자 긴급 공유
POST /sos/{id}/end   상황 종료 → 긴급 공유도 끝냄
112 신고 문안은 앱에서 만들고 사용자가 직접 보냄. 서버는 실제 신고 접수를 다루지 않음
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import ApiError
from ..models import Guardian, SosEvent, User, now_utc
from ..schemas import SosIn, SosOut
from ..security import current_user
from .shares import active_shares, open_share, share_out

router = APIRouter(prefix="/sos", tags=["긴급"])


@router.post("", response_model=SosOut, status_code=201)
def start_sos(body: SosIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    now = now_utc()
    located_at = None
    if body.pos is not None:
        located_at = datetime.fromtimestamp(body.located_at / 1000, tz=timezone.utc) if body.located_at else now
    ev = SosEvent(user_id=user.id, started_at=now, location_stale=body.stale, report_ready=True,
                  lat=body.pos.lat if body.pos else None, lng=body.pos.lng if body.pos else None, located_at=located_at)

    guardians = db.scalars(select(Guardian).where(Guardian.user_id == user.id)).all()
    share, token = None, None
    if guardians:
        current = active_shares(db, user)
        if current:
            # 이미 일반 공유 중이면 그 링크를 그대로 긴급 공유로 바꿈 (보호자가 받은 링크가 계속 유효)
            share = current[0]
            share.kind, share.expires_at = "sos", None
            share.guardians = list(guardians)  # 긴급 공유는 등록된 보호자 모두에게
            if body.pos is not None:
                share.last_lat, share.last_lng, share.last_at = body.pos.lat, body.pos.lng, located_at
        else:
            share, token = open_share(db, user, "sos", guardians, body.pos)
        db.flush()
        ev.share_id = share.id
        ev.share_status = "shared"
    else:
        ev.share_status = "no_guardian"  # 보호자가 없어도 SOS·신고 문안은 진행 (규격서 3장 4절)
    db.add(ev)
    db.commit()
    return SosOut(id=ev.id, share_status=ev.share_status, share=share_out(share, token) if share else None)


@router.post("/{sos_id}/end", status_code=204)
def end_sos(sos_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ev = db.scalar(select(SosEvent).where(SosEvent.id == sos_id, SosEvent.user_id == user.id))
    if ev is None:
        raise ApiError(404, "SOS_NOT_FOUND", "SOS 기록을 찾지 못했어요.")
    if ev.ended_at is None:
        ev.ended_at = now_utc()
    if ev.share is not None and ev.share.is_active() and ev.share.kind == "sos":
        ev.share.close("sos")
    db.commit()
    return Response(status_code=204)

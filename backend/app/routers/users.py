"""내 정보·위치 동의 API (FR-02, SR-01)
GET /users/me            내 정보
PUT /users/me/consents   위치 수집 동의 저장. 동의를 거두면 진행 중인 위치공유도 끝냄
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Share, User, now_utc
from ..schemas import ConsentIn, UserOut
from ..security import current_user
from .auth import user_out

router = APIRouter(prefix="/users", tags=["내 정보"])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.put("/me/consents", response_model=UserOut)
def set_consents(body: ConsentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.location_consent = body.location
    user.consent_at = now_utc()
    if not body.location:
        # 위치 동의를 거두면 더 이상 위치를 보내지 않으므로 진행 중인 공유를 끝내고 위치를 지움
        for s in db.scalars(select(Share).where(Share.user_id == user.id, Share.ended_at.is_(None))):
            s.close("consent")
    db.commit()
    return user_out(user)

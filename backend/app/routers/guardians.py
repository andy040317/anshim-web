"""보호자 관리 API (UC-05 / FR-09, IDR-05)
자기 보호자만 보고 고칠 수 있음. 남의 보호자 번호로 요청하면 '없음(404)'으로 답함 → 있는지조차 알 수 없게 (SR-02)
"""
from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import ApiError
from ..models import Guardian, User
from ..schemas import GuardianIn, GuardianOut
from ..security import current_user

router = APIRouter(prefix="/guardians", tags=["보호자"])

MAX_GUARDIANS = 10


def out(g: Guardian) -> GuardianOut:
    return GuardianOut(id=g.id, name=g.name, phone=g.phone)


def my_guardian(db: Session, user: User, guardian_id: int) -> Guardian:
    g = db.scalar(select(Guardian).where(Guardian.id == guardian_id, Guardian.user_id == user.id))
    if g is None:
        raise ApiError(404, "GUARDIAN_NOT_FOUND", "보호자를 찾지 못했어요.")
    return g


@router.get("", response_model=list[GuardianOut])
def list_guardians(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Guardian).where(Guardian.user_id == user.id).order_by(Guardian.id))
    return [out(g) for g in rows]


@router.post("", response_model=GuardianOut, status_code=201)
def add_guardian(body: GuardianIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    count = len(db.scalars(select(Guardian.id).where(Guardian.user_id == user.id)).all())
    if count >= MAX_GUARDIANS:
        raise ApiError(400, "TOO_MANY_GUARDIANS", f"보호자는 {MAX_GUARDIANS}명까지 등록할 수 있어요.")
    g = Guardian(user_id=user.id, name=body.name, phone=body.phone)
    db.add(g)
    db.commit()
    return out(g)


@router.put("/{guardian_id}", response_model=GuardianOut)
def update_guardian(guardian_id: int, body: GuardianIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    g = my_guardian(db, user, guardian_id)
    g.name, g.phone = body.name, body.phone
    db.commit()
    return out(g)


@router.delete("/{guardian_id}", status_code=204)
def delete_guardian(guardian_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    g = my_guardian(db, user, guardian_id)
    db.delete(g)  # 삭제하면 이후 공유 대상에서도 빠짐 (규격서 5장)
    db.commit()
    return Response(status_code=204)

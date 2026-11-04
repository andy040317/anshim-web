"""인증 API (UC-01 / FR-01, SR-02)
GET  /auth/check-id   아이디 중복 확인
POST /auth/signup     회원가입 (비밀번호는 해시로 저장)
POST /auth/login      로그인 → 로그인 토큰 발급
POST /auth/logout     로그아웃
"""
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import ApiError
from ..models import User
from ..schemas import LoginIn, LoginOut, SignupIn, UserOut, check_login_id
from ..security import DUMMY_HASH, create_login_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["인증"])

RESERVED_IDS = {"admin"}  # 쓸 수 없는 아이디


def user_out(u: User) -> UserOut:
    return UserOut(id=u.login_id, name=u.name, location_consent=u.location_consent)


@router.get("/check-id")
def check_id(id: str = Query(max_length=50), db: Session = Depends(get_db)):
    try:
        login_id = check_login_id(id)
    except ValueError as e:
        raise ApiError(400, "INVALID_ID", str(e))
    taken = login_id in RESERVED_IDS or db.scalar(select(User.id).where(User.login_id == login_id)) is not None
    return {"available": not taken}


@router.post("/signup", status_code=201)
def signup(body: SignupIn, db: Session = Depends(get_db)):
    if body.id in RESERVED_IDS or db.scalar(select(User.id).where(User.login_id == body.id)) is not None:
        raise ApiError(409, "DUPLICATE_ID", "이미 사용 중인 아이디예요.")
    db.add(User(login_id=body.id, name=body.name, password_hash=hash_password(body.pw)))
    try:
        db.commit()
    except IntegrityError:  # 같은 아이디로 거의 동시에 가입한 경우
        db.rollback()
        raise ApiError(409, "DUPLICATE_ID", "이미 사용 중인 아이디예요.")
    return {"id": body.id, "name": body.name}


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.login_id == body.id.strip()))
    ok = verify_password(body.pw, user.password_hash if user else DUMMY_HASH)
    if not user or not ok:
        raise ApiError(401, "AUTH_FAILED", "아이디 또는 비밀번호가 맞지 않아요.")
    return LoginOut(token=create_login_token(user.id), user=user_out(user))


@router.post("/logout", status_code=204)
def logout():
    # 로그인 토큰은 서버에 저장하지 않는 방식(JWT)이라, 앱이 토큰을 버리면 로그아웃 끝
    return Response(status_code=204)

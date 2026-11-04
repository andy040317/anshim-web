"""비밀번호 해시, 로그인 토큰, 공유 링크 토큰 (SR-02, SR-03)"""
import hashlib
import secrets
from datetime import timedelta

import bcrypt
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import JWT_SECRET, TOKEN_EXPIRE_HOURS
from .db import get_db
from .errors import ApiError
from .models import User, now_utc

# ── 비밀번호: bcrypt 단방향 해시 (원문으로 되돌릴 수 없음) ──
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode())
    except ValueError:  # 72바이트 넘는 입력 등
        return False


# 없는 아이디로 로그인할 때도 비슷한 시간이 걸리게 하는 가짜 해시 (아이디 존재 여부를 시간으로 알 수 없게)
DUMMY_HASH = hash_password("dummy-password-1")


# ── 로그인 토큰 (JWT): 서버가 비밀키로 서명한 '로그인 증명서' ──
def create_login_token(user_id: int) -> str:
    now = now_utc()
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(hours=TOKEN_EXPIRE_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


_bearer = HTTPBearer(auto_error=False)  # 요청 머리말의 "Authorization: Bearer 토큰" 을 꺼냄


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)) -> User:
    """로그인이 필요한 API 에 붙여서 쓰는 검사기: 토큰을 확인하고 그 사용자를 돌려줌"""
    if cred is None:
        raise ApiError(401, "LOGIN_REQUIRED", "로그인이 필요해요.")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "TOKEN_EXPIRED", "로그인이 만료됐어요. 다시 로그인해 주세요.")
    except jwt.InvalidTokenError:
        raise ApiError(401, "LOGIN_REQUIRED", "로그인이 필요해요.")
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise ApiError(401, "LOGIN_REQUIRED", "로그인이 필요해요.")
    return user


# ── 공유 링크 토큰: 추측하기 어려운 임의 문자열 (SR-03) ──
def new_share_token() -> str:
    return secrets.token_urlsafe(24)  # 32글자, 경우의 수 2^192


def hash_share_token(token: str) -> str:
    """DB에는 토큰 원문 대신 이 해시만 저장"""
    return hashlib.sha256(token.encode()).hexdigest()

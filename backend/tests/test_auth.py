"""인증·동의 테스트 (FR-01, FR-02, SR-02)"""
from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select

from app.config import JWT_SECRET
from app.db import SessionLocal
from app.models import User

from .conftest import join


def test_가입과_로그인(client):
    assert client.get("/auth/check-id", params={"id": "demo"}).json() == {"available": True}
    r = client.post("/auth/signup", json={"id": "demo", "pw": "safe1234", "name": "김안심"})
    assert r.status_code == 201
    assert client.get("/auth/check-id", params={"id": "demo"}).json() == {"available": False}

    r = client.post("/auth/login", json={"id": "demo", "pw": "safe1234"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"] == {"id": "demo", "name": "김안심", "locationConsent": None}
    assert "safe1234" not in r.text  # 응답에 비밀번호 원문이 없어야 함


def test_비밀번호는_해시로만_저장(client):
    join(client)
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.login_id == "demo"))
    assert u.password_hash != "safe1234" and u.password_hash.startswith("$2")  # bcrypt 해시


def test_중복_아이디와_예약어(client):
    join(client)
    r = client.post("/auth/signup", json={"id": "demo", "pw": "safe1234", "name": "다른 사람"})
    assert r.status_code == 409 and r.json()["code"] == "DUPLICATE_ID"
    assert client.get("/auth/check-id", params={"id": "admin"}).json() == {"available": False}


def test_입력값_검사(client):
    r = client.get("/auth/check-id", params={"id": "AB"})
    assert r.status_code == 400 and r.json()["code"] == "INVALID_ID"
    r = client.post("/auth/signup", json={"id": "user1", "pw": "short", "name": "가"})
    assert r.status_code == 422
    assert r.json() == {"code": "INVALID_INPUT", "message": "8자 이상, 영문과 숫자를 함께 넣어 주세요."}
    r = client.post("/auth/signup", json={"id": "user1", "pw": "가" * 30 + "a1", "name": "가"})
    assert r.status_code == 422  # bcrypt 72바이트 제한


def test_로그인_실패(client):
    join(client)
    for body in ({"id": "demo", "pw": "wrong1234"}, {"id": "nobody", "pw": "safe1234"}):
        r = client.post("/auth/login", json=body)
        assert r.status_code == 401
        assert r.json() == {"code": "AUTH_FAILED", "message": "아이디 또는 비밀번호가 맞지 않아요."}


def test_로그인_토큰_검사(client):
    assert client.get("/users/me").json()["code"] == "LOGIN_REQUIRED"
    assert client.get("/users/me", headers={"Authorization": "Bearer not-a-real-token"}).status_code == 401
    join(client)
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    expired = jwt.encode({"sub": "1", "exp": past}, JWT_SECRET, algorithm="HS256")
    r = client.get("/users/me", headers={"Authorization": "Bearer " + expired})
    assert r.status_code == 401 and r.json()["code"] == "TOKEN_EXPIRED"


def test_위치_동의_저장(client):
    h = join(client, consent=None)
    assert client.get("/users/me", headers=h).json()["locationConsent"] is None
    assert client.put("/users/me/consents", json={"location": False}, headers=h).json()["locationConsent"] is False
    # 다시 로그인해도 저장한 동의가 그대로
    token = client.post("/auth/login", json={"id": "demo", "pw": "safe1234"}).json()
    assert token["user"]["locationConsent"] is False

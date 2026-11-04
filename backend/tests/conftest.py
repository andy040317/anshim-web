"""테스트 공통 준비
테스트용 DB: 환경변수 TEST_DATABASE_URL 이 있으면 그 PostgreSQL, 없으면 임시 SQLite 파일
(실제 DB를 건드리지 않도록, app 을 불러오기 전에 DATABASE_URL 을 테스트용으로 바꿈)
"""
import os
import tempfile

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL") or "sqlite:///" + os.path.join(tempfile.gettempdir(), "anshim-test.db")
os.environ["JWT_SECRET"] = "test-secret-for-pytest-only-0123456789abcdef"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client():
    # 테스트마다 빈 테이블로 시작
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


def join(client, login_id="demo", pw="safe1234", name="김안심", consent=True):
    """가입 → 로그인 → (위치 동의) 후, 로그인 토큰이 든 요청 머리말을 돌려줌"""
    assert client.post("/auth/signup", json={"id": login_id, "pw": pw, "name": name}).status_code == 201
    token = client.post("/auth/login", json={"id": login_id, "pw": pw}).json()["token"]
    headers = {"Authorization": "Bearer " + token}
    if consent is not None:
        client.put("/users/me/consents", json={"location": consent}, headers=headers)
    return headers


def add_guardian(client, headers, name="친구", phone="010-1234-5678"):
    r = client.post("/guardians", json={"name": name, "phone": phone}, headers=headers)
    assert r.status_code == 201
    return r.json()["id"]

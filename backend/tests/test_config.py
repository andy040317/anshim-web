"""DB 주소 처리 테스트: Neon 이 주는 주소 모양을 서버가 맞게 다루는지"""
from app.config import _db_url
from app.db import connect_args

POOLED = "postgresql://neondb_owner:pw@ep-odd-bird-a1b2c3-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DIRECT = "postgresql://neondb_owner:pw@ep-odd-bird-a1b2c3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"


def test_주소를_psycopg_드라이버용으로_바꿈():
    assert _db_url(POOLED).startswith("postgresql+psycopg://neondb_owner:pw@ep-odd-bird-a1b2c3-pooler.")
    assert _db_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert _db_url("").startswith("sqlite:///")  # 비어 있으면 개발용 SQLite


def test_연결_묶음_주소에서는_prepared_statement_를_끔():
    assert connect_args(_db_url(POOLED)) == {"prepare_threshold": None}
    assert connect_args(_db_url(DIRECT)) == {}
    assert connect_args("sqlite:///x.db") == {"check_same_thread": False}

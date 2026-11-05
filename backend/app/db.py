"""DB 연결
engine  : DB와의 연결 통로 (평소 요청용)
get_db  : API 하나가 실행되는 동안 쓸 DB 세션(작업 단위)을 빌려주고, 끝나면 돌려받음
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATABASE_URL, DATABASE_URL_UNPOOLED


def connect_args(url):
    """DB 종류에 따라 연결할 때 넘길 옵션"""
    if url.startswith("sqlite"):
        return {"check_same_thread": False}  # SQLite: 여러 요청이 같은 연결을 쓸 수 있게
    if "-pooler." in url:
        # Neon 연결 묶음(PgBouncer, transaction 모드)은 '미리 준비해 둔 SQL 문(prepared statement)'과 잘 안 맞음
        # → psycopg 가 그 기능을 쓰지 않게 함
        return {"prepare_threshold": None}
    return {}


engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args(DATABASE_URL))
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def schema_engine():
    """테이블 만들기용 연결: 직접 연결 주소가 따로 있으면 그걸 씀 (Neon 권장)"""
    if DATABASE_URL_UNPOOLED == DATABASE_URL:
        return engine
    return create_engine(DATABASE_URL_UNPOOLED, pool_pre_ping=True, connect_args=connect_args(DATABASE_URL_UNPOOLED))


class Base(DeclarativeBase):
    """모든 테이블 클래스의 부모"""


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

"""DB 연결
engine  : DB와의 연결 통로
get_db  : API 하나가 실행되는 동안 쓸 DB 세션(작업 단위)을 빌려주고, 끝나면 돌려받음
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATABASE_URL

# SQLite 는 여러 요청이 같은 연결을 쓸 수 있게 옵션이 하나 필요함
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """모든 테이블 클래스의 부모"""


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

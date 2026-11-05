"""안심귀갓길 API 서버 시작점
실행: (backend 폴더에서) uvicorn app.main:app --reload
API 문서: 서버를 켠 뒤 http://localhost:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import errors, models  # noqa: F401  (models 를 불러와야 테이블 정의가 등록됨)
from .config import CORS_ORIGINS
from .db import Base, engine, schema_engine
from .routers import auth, guardians, shares, sos, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 서버가 켜질 때 테이블이 없으면 만듦 (이미 있으면 그대로 둠). 직접 연결 주소가 있으면 그걸로 (db.schema_engine)
    # 나중에 테이블 구조를 바꿀 때는 마이그레이션 도구(Alembic)를 도입하는 게 좋음
    eng = schema_engine()
    Base.metadata.create_all(eng)
    if eng is not engine:
        eng.dispose()  # 테이블 만들기용 연결은 다 썼으니 닫음
    yield


app = FastAPI(title="안심귀갓길 API", version="0.1.0", lifespan=lifespan)

# CORS: 다른 주소(프론트)의 웹페이지가 이 서버를 부를 수 있게 허용할 주소 목록
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
errors.install(app)

for r in (auth, users, guardians, shares, sos):
    app.include_router(r.router)


@app.get("/health", tags=["상태"])
def health():
    """서버·DB가 살아 있는지 확인 (배포 서비스의 상태 점검용)"""
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"ok": True}

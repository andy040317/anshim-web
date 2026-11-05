"""서버 설정값
환경변수에서 읽고, backend/.env 파일이 있으면 그 내용도 환경변수로 씀.
DB 비밀번호·토큰 비밀키는 코드에 넣지 않음 (SR-04)
"""
import os
import secrets
import warnings
from pathlib import Path


def _load_env_file():
    """backend/.env 파일을 읽어 환경변수로 등록 (이미 있는 환경변수는 그대로 둠)"""
    path = Path(__file__).resolve().parent.parent / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        if value:  # 빈 값은 '설정 안 함'으로 봄 → 기본값 사용
            os.environ.setdefault(key.strip(), value)


def _db_url(url):
    """DB 주소 정리: 비어 있으면 개발용 SQLite, PostgreSQL 이면 psycopg(3) 드라이버를 쓰도록 바꿈"""
    if not url:
        return "sqlite:///" + str(Path(__file__).resolve().parent.parent / "anshim-dev.db")
    # 클라우드 DB가 주는 주소는 보통 postgres:// 또는 postgresql:// 로 시작함
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


_load_env_file()

DATABASE_URL = _db_url(os.getenv("DATABASE_URL", "").strip())
# Neon(`neon env pull`)은 주소를 두 개 줌: DATABASE_URL = 연결 묶음(pooled, 주소에 -pooler), DATABASE_URL_UNPOOLED = 직접 연결
# 평소 요청은 DATABASE_URL, 테이블 만들기(스키마 작업)는 직접 연결로 하라는 게 Neon 권장 → 없으면 DATABASE_URL 하나로 다 함
_unpooled = os.getenv("DATABASE_URL_UNPOOLED", "").strip()
DATABASE_URL_UNPOOLED = _db_url(_unpooled) if _unpooled else DATABASE_URL

JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
if not JWT_SECRET:
    JWT_SECRET = secrets.token_urlsafe(32)
    warnings.warn("JWT_SECRET 이 없어서 임시 키를 만들었어요. 서버를 다시 켜면 모두 다시 로그인해야 해요. "
                  "배포할 때는 꼭 JWT_SECRET 을 설정하세요.")

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

TOKEN_EXPIRE_HOURS = int(os.getenv("TOKEN_EXPIRE_HOURS") or 12)  # 로그인 유지 시간
SHARE_EXPIRE_MIN = int(os.getenv("SHARE_EXPIRE_MIN") or 60)       # 일반 위치공유 링크 유효시간 (프론트 config.js 와 같은 값)

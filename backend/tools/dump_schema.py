"""DB 테이블 정의를 PostgreSQL SQL 문으로 뽑아 docs/schema.sql 에 저장 (구조설계서의 DB 설계용)
실행: (backend 폴더에서) python tools/dump_schema.py
models.py 를 고친 뒤 다시 실행하면 문서도 최신으로 바뀜
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy.dialects import postgresql  # noqa: E402
from sqlalchemy.schema import CreateIndex, CreateTable  # noqa: E402

from app import models  # noqa: E402,F401
from app.db import Base  # noqa: E402

parts = ["-- 안심귀갓길 DB 테이블 정의 (backend/app/models.py 에서 자동 생성, 직접 고치지 마세요)\n"]
for table in Base.metadata.sorted_tables:  # 다른 테이블을 참조하는 순서대로
    parts.append(str(CreateTable(table).compile(dialect=postgresql.dialect())).strip() + ";\n")
    for index in sorted(table.indexes, key=lambda i: i.name):
        parts.append(str(CreateIndex(index).compile(dialect=postgresql.dialect())).strip() + ";\n")

out = ROOT / "docs" / "schema.sql"
out.parent.mkdir(exist_ok=True)
out.write_text("\n".join(parts), encoding="utf-8")
print("저장:", out)

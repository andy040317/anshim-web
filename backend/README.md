# 안심귀갓길 API 서버 (FastAPI + PostgreSQL)

로그인·위치 동의·보호자·위치공유·SOS를 처리하는 백엔드 서버예요.
프론트(프로젝트 최상위 폴더)는 `.env`에 서버 주소(`VITE_API_URL`)가 있으면 이 서버를 쓰고, 없으면 지금처럼 브라우저 안의 가짜 API로 동작해요.

> 경로 계산(`POST /routes`)과 안전시설(`GET /facilities`)은 아직 프론트가 `public/data` 파일로 직접 계산해요. 서버로 옮기는 건 다음 단계(위험도 DB + 경로 API)예요.

## 1. 내 PC에서 서버 켜기

준비: Python 3.10 이상 (터미널에서 `py --version` 으로 확인, 맥은 `python3 --version`)

VS Code에서 `터미널 > 새 터미널`을 열고 차례로 입력하세요.

```
cd backend
py -m venv .venv                  # 가상환경 만들기 (처음 한 번). 이 프로젝트 전용 파이썬 설치 공간
.venv\Scripts\activate            # 가상환경 켜기 (맥: source .venv/bin/activate). 앞에 (.venv) 가 보이면 성공
pip install -r requirements.txt   # 라이브러리 설치 (처음 한 번)
uvicorn app.main:app --reload     # 서버 켜기. --reload = 코드를 고치면 자동으로 다시 시작
```

- 브라우저에서 `http://localhost:8000/docs` 를 열면 API 목록이 나오고, 각 API를 직접 눌러 시험해 볼 수 있어요.
- 끄기: 터미널에서 `Ctrl + C`
- 다음부터는 `cd backend` → 가상환경 켜기 → `uvicorn app.main:app --reload` 만 하면 돼요.
- DB를 따로 설정하지 않으면 `backend/anshim-dev.db` 파일(SQLite)에 저장해요. PC에서 바로 시험해 보기용이고, 배포할 때는 PostgreSQL을 써요 (아래 3번).

**프론트와 연결하기**
1. 프로젝트 최상위 폴더의 `.env` 에 한 줄 추가: `VITE_API_URL=http://localhost:8000`
2. 프론트 터미널에서 `Ctrl + C` 로 끄고 `npm run dev` 다시 실행
3. 화면 오른쪽 `구조·시연 도구 > API 기록` 에 **진짜 서버** 라고 나오면 연결된 거예요. 회원가입부터 새로 해야 해요 (시연 계정 demo 는 가짜 API 전용).

**문제 해결**
- `.venv\Scripts\activate` 에서 "스크립트를 실행할 수 없습니다" 오류 (Windows PowerShell): `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 를 한 번 입력하고 `Y` 를 누른 뒤 다시 시도
- 프론트에서 "서버에 연결하지 못했어요": 서버 터미널이 켜져 있는지, `.env` 의 주소가 `http://localhost:8000` 인지 확인
- 프론트 주소가 `http://localhost:5173` 이 아니면: `backend/.env` 의 `CORS_ORIGINS` 에 그 주소를 넣고 서버 다시 시작

## 2. 설정 (backend/.env)

`.env.example` 을 복사해서 이름을 `.env` 로 바꾸고 필요한 값만 채우세요. `.env` 는 GitHub에 올라가지 않아요.

| 이름 | 뜻 | 기본값 |
|---|---|---|
| `DATABASE_URL` | DB 주소. PostgreSQL 예: `postgresql://사용자:비밀번호@호스트:5432/DB이름` | 개발용 SQLite 파일 |
| `DATABASE_URL_UNPOOLED` | (Neon) 직접 연결 주소. 있으면 테이블 만들기에 이 주소를 씀 | `DATABASE_URL` 과 같음 |
| `JWT_SECRET` | 로그인 토큰 서명용 비밀키 (배포 때 꼭 설정) | 켤 때마다 임시로 만듦 |
| `CORS_ORIGINS` | 이 서버를 불러도 되는 프론트 주소 (쉼표로 여러 개) | `http://localhost:5173` |
| `TOKEN_EXPIRE_HOURS` | 로그인 유지 시간(시간) | 12 |
| `SHARE_EXPIRE_MIN` | 일반 위치공유 링크 유효시간(분). 규격서 "설계 단계 확정" 항목이라 임시값 | 60 |

**Neon DB 주소 받기 (PC 터미널, 프로젝트 최상위 폴더에서)**

```
npm i -g neon@latest
neon login                        # 브라우저가 열리면 Neon 계정으로 로그인
neon env pull --project-id odd-bird-44231513 --branch production --services postgres --file backend/.env
```

`backend/.env` 에 `DATABASE_URL`(연결 묶음, 주소에 `-pooler`)과 `DATABASE_URL_UNPOOLED`(직접 연결)가 들어가요. 다른 줄은 그대로 둬요.
서버는 평소 요청에 `DATABASE_URL`, 테이블 만들기에 `DATABASE_URL_UNPOOLED` 를 써요 (Neon 권장 방식).
CLI 대신 Neon 화면의 **Connect** 에서 주소 하나만 복사해 `DATABASE_URL` 에 넣어도 돼요.

## 3. 테스트

```
pytest                 # 임시 SQLite 로 테스트 (25개)
```

PostgreSQL 로 테스트하려면 빈 테스트용 DB를 하나 만들고 `TEST_DATABASE_URL` 에 주소를 넣고 실행하세요. (테스트가 테이블을 지웠다 다시 만들어요. 실제 DB 주소를 넣지 마세요.)

규격서 6장 보안 확인 항목도 테스트에 들어 있어요: 다른 사용자의 보호자·공유 접근 차단, 공유 중·임의·만료·종료 토큰 각각 시험, 비밀번호 원문이 저장·응답에 없는지.

## 4. API 목록

| 방식 | 주소 | 로그인 | 하는 일 | 요구사항 |
|---|---|---|---|---|
| GET | `/auth/check-id?id=` | | 아이디 중복 확인 | FR-01 |
| POST | `/auth/signup` | | 회원가입 (비밀번호는 bcrypt 해시로 저장) | FR-01, SR-02 |
| POST | `/auth/login` | | 로그인 → 로그인 토큰(JWT) | FR-01 |
| POST | `/auth/logout` | | 로그아웃 (앱이 토큰을 버림) | |
| GET | `/users/me` | 필요 | 내 정보 | |
| PUT | `/users/me/consents` | 필요 | 위치 동의 저장. 동의를 거두면 진행 중인 공유도 종료 | FR-02, SR-01 |
| GET·POST | `/guardians` | 필요 | 내 보호자 목록·등록 (번호 형식 검사) | FR-09 |
| PUT·DELETE | `/guardians/{id}` | 필요 | 보호자 수정·삭제 (내 보호자만) | FR-09, SR-02 |
| POST | `/shares` | 필요 | 공유 시작 → 링크 토큰 (만들 때 한 번만 알려줌) | FR-10, SR-03 |
| DELETE | `/shares/{id}?reason=` | 필요 | 공유 종료 → 링크 즉시 차단, 위치 삭제 | FR-10 |
| POST | `/shares/{id}/locations` | 필요 | 공유 중 위치 보내기 (5초마다) | FR-11 |
| GET | `/shares/{token}` | **없음** | 보호자가 링크로 위치 보기. 끝난 링크는 410 + 이유 | FR-11, SIR-03 |
| POST | `/sos` | 필요 | SOS 기록 + 보호자 긴급 공유 (일반 공유 중이면 그 링크를 긴급으로 전환) | FR-12 |
| POST | `/sos/{id}/end` | 필요 | 상황 종료 → 긴급 공유 종료 | FR-12 |
| GET | `/health` | | 서버·DB 상태 확인 | |

오류는 모두 `{"code": "...", "message": "화면에 보여줄 문구"}` 모양이에요 (프론트 가짜 API와 같은 모양).

## 5. DB 테이블

정의: `app/models.py` · SQL 문: `docs/schema.sql` (구조설계서용. `python tools/dump_schema.py` 로 다시 만들 수 있음)

| 테이블 | 내용 | 요구사항 |
|---|---|---|
| `users` | 아이디, 이름, 비밀번호 해시, 위치 동의 | SR-02 |
| `guardians` | 사용자별 보호자 이름·번호 | IDR-05 |
| `shares` | 공유 종류(일반/긴급), 토큰 해시, 시작·만료·종료 시각, 최근 위치 1개, 목적지·경로 | IDR-03, IDR-07 |
| `share_guardians` | 공유 ↔ 받는 보호자 | |
| `sos_events` | SOS 시각, 사용한 위치와 확인 시각, 공유 처리 상태, 신고 문안 생성 여부 | IDR-06 |

## 6. 설계 메모 (구조설계서에 옮겨 쓸 수 있음)

- **공유 링크 토큰**: 32글자 임의 문자열. DB에는 원문 대신 SHA-256 해시만 저장해서 DB가 새도 링크를 만들 수 없어요.
- **매 요청 만료 확인**: 공유 관련 요청이 올 때마다 만료 시각을 먼저 확인해요 (SR-03).
- **위치정보 최소 보관**: 공유 중에는 최근 위치 1개만 두고, 공유가 끝나면(도착·종료·만료·동의 철회) 위치·경로를 바로 지워요 (규격서 5장).
- **한 사람당 진행 중인 공유는 1개**: 새 공유를 시작하면 이전 링크는 끝나요.
- **SOS**: 보호자가 없어도 기록과 신고 문안은 진행해요. 긴급 공유는 시간 만료 없이 상황 종료 때까지 가요.
- **아직 정할 것**: 링크 유효시간·긴급 기록 보존 기간 (설계 단계 확정 사항), 테이블 구조를 바꿀 때 쓸 마이그레이션 도구(Alembic) 도입 여부, 서버를 올릴 클라우드

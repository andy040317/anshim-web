# 안심귀갓길 프로토타입 (Team North Star)

유동인구·범죄안전데이터 기반 도보 안심귀갓길 서비스의 **화면 구성과 동작 흐름**을 보여주는 React 프로토타입입니다.
카카오맵 위에서 대구 전체를 대상으로 동작하고, 로그인·서버 부분은 가짜 API로 흉내 냅니다.

## 1. 처음 실행하기

1. **카카오 디벨로퍼스 설정** (developers.kakao.com)
   - 애플리케이션 추가 → **JavaScript 키** 복사
   - JavaScript SDK 도메인에 `http://localhost:5173` 등록 (끝에 `/` 없이)
   - **카카오맵 사용 설정 켜기** (안 켜면 키가 맞아도 지도가 안 뜸)
2. **Node.js(LTS)** 설치 → 터미널에서 `node -v` 로 확인
3. VS Code에서 이 폴더 열기 → 메뉴 `터미널 > 새 터미널`
4. `.env.example` 을 복사해서 이름을 `.env` 로 바꾸고, 키를 붙여넣기
   ```
   VITE_KAKAO_JS_KEY=복사한_JavaScript_키
   ```
5. 터미널에서 실행
   ```
   npm install     # 처음 한 번만 (필요한 패키지 설치)
   npm run dev     # 개발 서버 실행
   ```
6. 브라우저에서 `http://localhost:5173` 열기
   - 시연용 계정: `demo` / `safe1234`
   - `.env` 를 고쳤다면 터미널에서 `Ctrl + C` 로 끄고 `npm run dev` 를 다시 실행해야 반영돼요.

## 2. 시연 순서 (추천)

1. 로그인 → 위치 동의 (브라우저가 위치 권한을 물어봄. 대구 밖이거나 거부하면 시연 위치 사용)
2. 메인 지도에서 **아무 곳이나 눌러** 도착지로 정하기 (또는 검색) → `경로 비교하기`
3. 거리 우선 / 안전시설 경유 경로의 위험도와 근거(CCTV·비상벨·시설 가까운 구간) 비교
4. 보호자에게 공유하며 안내 시작 → 위치 점이 경로를 따라 움직임
5. 오른쪽 패널 `시연 도구`: 경로 이탈 → 재탐색, 도착, 보호자 화면, 수신 지연, 링크 만료, SOS
6. 오른쪽 패널 `구조`: 화면마다 요구사항 ID·컴포넌트·API (구조설계서용), `API 기록`: 호출 순서

## 3. 폴더 구조

| 위치 | 내용 |
|---|---|
| `src/App.jsx` | 앱 전체 상태와 동작 (로그인, 위치, 경로, 안내, 공유, SOS) |
| `src/config.js` | 설정값 (경로 서버 주소, SOS 취소 시간, 링크 만료 등 임시값) |
| `src/screens/` | 화면 하나당 파일 하나 (LoginScreen, MainScreen, RouteCompareScreen …) |
| `src/components/KakaoMap.jsx` | 카카오맵 부품 (경로 선, 표시, 안전시설, 지도 클릭) |
| `src/components/Panel.jsx` | 오른쪽 구조·시연 패널 |
| `src/lib/router.js` | OSRM 경로 받기 + 위험도 평가 + 경로 고르기 |
| `src/lib/facilities.js` | 안전시설 데이터 불러오기 + 주변 검색 |
| `src/lib/meta.js` | 화면별 요구사항 ID·API 목록 (패널에 표시) |
| `public/data/` | 전처리한 대구 CCTV·비상벨·119안전센터 데이터 |
| `scripts/prepare_data.py` | CSV → JSON 전처리 스크립트 |

## 4. 위험도 계산 (데이터 파이프라인 연결 버전)

**데이터 준비 (scripts 폴더, 데이터 담당)** — 순서대로 한 번 실행하면 `public/data/risk/` 가 만들어짐
```
py scripts/step2_road_network.py     # 대구 도보 도로망 → 50m 구간
py scripts/step3_attach_features.py  # 구간마다 범죄주의·CCTV·비상벨·보안등·거점·유흥주점·행정동
py scripts/step4_risk_score.py       # 구간 × 24시간 위험도 (가중치: scripts/config_risk.json)
py scripts/step5_export_web.py       # 웹용 1km 칸 파일로 변환 → public/data/risk/
py scripts/step6_export_graph.py     # 위험도 반영 길 찾기용 도로망 칸 파일 → public/data/graph/ (step4 를 다시 돌리면 이것도 다시)
```

**웹에서 경로 위험도 계산** (`src/lib/risk.js`)
- 경로를 20m 간격 점으로 나누고, 점마다 35m 안의 가장 가까운 도로 구간의 **출발 시각 위험도**를 읽어 평균
- 근거: CCTV 경유 대수, 보안등 구간 %, 골목 %, 범죄주의 7등급 이상 구간 길이, 심야(22~04시) 유흥업소 밀집 구간 길이
- 유흥주점은 **지도에 표시하지 않고** 위험도 계산과 경로 카드 근거("심야 유흥업소 밀집 구간 통과")에만 씀
- **거리 우선** = 가장 짧은 후보, **안전시설 경유** = 우회 한도(+30%) 안에서 위험도가 가장 낮은 후보 (2점 이상 낮을 때만)
- 위험도 단계: 45 미만 낮음 · 55 미만 보통 · 그 이상 높음 (`src/config.js` 의 `RISK_LEVELS`)
- `public/data/risk/` 가 없으면 경로 비교 화면에 "step5_export_web.py 를 실행해 주세요" 안내가 나옴

## 5. 실제 서비스로 바꿀 자리

| 지금 (프로토타입) | 나중 (실제 서비스) |
|---|---|
| `App.jsx` 의 `call(...)` 가짜 API | FastAPI 호출 (`fetch('/api/...')`) |
| `public/data/*.json` | PostgreSQL + `GET /facilities` |
| 공개 OSRM 서버 (`config.js` 의 `ROUTER_URL`) | 팀 OSRM 서버 주소로 한 줄 교체 |
| `public/data/risk/` 칸 파일 + `src/lib/risk.js` | PostgreSQL 의 구간 위험도 테이블 + 백엔드 `POST /routes` (FR-06) |
| 안내 중 위치: 실제 위치(watchPosition) / 시연 자동 이동 전환 | 실제 위치만 사용 (시연 자동 이동 제거) |
| 앱이 화면 꺼짐·백그라운드일 때 위치 멈춤 (PWA 한계) | 네이티브 패키징 시 백그라운드 위치 |

공개 OSRM 서버는 **비상업·시연용**이고 **1초에 1번 이하**로만 호출해야 해서, 경로 비교에 몇 초가 걸립니다.
연결이 안 되면 자동으로 직선 경로로 바뀌고 화면에 안내가 나옵니다.

## 5-1. 지도 레이어 · 실제 위치 안내 · SOS 지도

**지도 레이어 (기본 모두 켜짐)**: CCTV · 비상벨 · 보안등 · 지구대·파출소 · 119안전센터 · 편의점(대피 우선순위 높음)
- 보안등은 멀리 볼 때 숫자 묶음, 가까이 확대하면 작은 점으로 보임

**안내 위치 방식** (시연 도구 → 안내 위치 방식)
| 방식 | 동작 |
|---|---|
| 자동 (기본) | 실제 GPS 위치를 받는 중이면 실제 위치, PC 시연 위치면 자동 이동 |
| 실제 위치 | 폰 위치를 경로 위에 맞춰서 남은 거리·회전 안내 갱신, 30m 이탈 알림, 목적지 30m 안이면 도착 |
| 시연 자동 이동 | 위치가 경로를 따라 저절로 움직임 (발표용) |

- 폰에서 실제 위치를 쓰려면 **HTTPS 주소**가 필요해요 (배포 후 확인). 화면이 꺼지면 위치가 멈춰요.
- PC에서 실제 위치 모드 시험: 크롬 F12 → 오른쪽 위 ⋮ → More tools → **Sensors** → Location 에서 위도·경도를 직접 바꾸기

**SOS 실행 화면**
- 위쪽 지도에 내 위치(실제 GPS면 실시간)와 가까운 대피 후보 3곳(편의점·지구대·119·비상벨, 종류별 최대 2곳)을 번호로 표시
- 후보를 누르면 도보 경로를 그리고 남은 거리 표시, **카카오맵으로 길찾기** 버튼으로 카카오맵(앱)에서 도보 길찾기
- 100m 넘게 움직이면 후보를 다시 찾음

## 6. 데이터 다시 만들기

새 CSV를 받으면 프로젝트 최상위 폴더에서:
```
python scripts/prepare_data.py CCTV정보_대구광역시.csv 안전비상벨위치정보_대구광역시.csv "소방청 119안전센터 주소 및 전화번호20260701.csv"
```
- cp949 인코딩 처리, 대구 범위 밖 좌표(입력 오류) 제거, 같은 좌표 합치기를 합니다.
- 지금 데이터: CCTV 20,728건 → 설치 지점 11,557곳(대구 밖 좌표 48건 제거), 비상벨 655건 → 428곳, 119안전센터 대구 51곳

지구대·파출소 / 119안전센터(좌표 포함) / 편의점 / 보안등 지도 파일 (`data/` 폴더의 정리된 파일 → `public/data/`):
```
py scripts/prepare_map_layers.py
```
- 결과: police.json 66곳, fire119.json 51곳, stores.json 1,954곳(대피 우선순위 높음), lamps.json 67,399곳(같은 좌표 합침)

## 7. 배포 (GitHub + Vercel)

1. GitHub Desktop 으로 이 폴더를 저장소로 만들고 Publish (`.env`·`data/`·`node_modules` 는 `.gitignore` 때문에 안 올라감)
2. Vercel → Add New Project → GitHub 저장소 Import → Framework 는 Vite 자동 선택
3. Environment Variables 에 `VITE_KAKAO_JS_KEY` = 카카오 **JavaScript 키** 하나만 (REST 키·생활안전지도 키는 넣지 않음)
4. 카카오 디벨로퍼스의 사이트 도메인에 `https://○○.vercel.app` 추가 (localhost 는 그대로 둠)
5. 이후에는 GitHub 에 Push 하면 Vercel 이 자동으로 다시 배포

- 키를 바꾸거나 추가하면 Vercel 에서 **Redeploy** 해야 반영됨
- Vercel 무료(Hobby) 요금제는 **비공개 저장소**에서 계정 주인이 아닌 사람의 커밋은 배포를 막음 → 팀원이 함께 Push 하려면 공개 저장소로

## 8. 자주 나는 문제

| 증상 | 확인할 것 |
|---|---|
| "카카오 키가 없어요" | `.env` 파일 이름(앞에 점), 키 값, 서버 재실행. 배포 사이트면 Vercel Environment Variables + Redeploy |
| "지도를 준비하지 못했어요" | 지금 주소(`http://localhost:5173` 또는 `https://○○.vercel.app`)가 카카오에 등록됐는지, 카카오맵 사용 설정 ON |
| `Port 5173 is in use` | 다른 터미널에서 이미 실행 중인지 확인 후 끄기 |
| 경로가 직선으로만 나옴 | 공개 경로 서버 연결 실패 (잠시 뒤 다시 시도). `API 기록` 탭에서 사유 확인 |
| 지도가 회색 | 브라우저 창 크기를 한 번 바꿔 보기, F12 → Console 에러 확인 |
| 안내 중 "실제 위치를 받지 못하고 있어요" | 브라우저 위치 권한 허용, 폰은 HTTPS 주소인지 확인, 안 되면 배너의 "시연 이동" |
| 지구대·편의점·보안등이 안 보임 | `public/data/` 에 police·stores·lamps.json 이 있는지 (`py scripts/prepare_map_layers.py`) |

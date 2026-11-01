// 서비스 전체 설정값을 모아두는 곳
// 요구사항규격서에서 "설계 단계에서 확정"으로 남은 값은 임시값이에요. 정해지면 여기만 바꾸면 돼요.

// 카카오 JavaScript 키 (.env 파일의 VITE_KAKAO_JS_KEY)
export const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY;

// 경로 엔진(OSRM) 주소
// 지금은 공개 도보 서버(무료·시연용, 1초에 1번 이하 호출 규칙).
// 팀 OSRM 서버가 준비되면 이 한 줄만 그 주소로 바꾸면 돼요.
export const ROUTER_URL = 'https://routing.openstreetmap.de/routed-foot';
export const ROUTER_MIN_GAP_MS = 1100; // 공개 서버 호출 간격 (팀 서버로 바꾸면 0으로)

export const SOS_CANCEL_SEC = 5;   // SOS 취소 대기 시간 (임시값)
export const SHARE_EXPIRE_MIN = 60; // 공유 링크 만료 시간 (임시값)
export const DETOUR_LIMIT = 0.3;   // 우회 허용 한도: 기준 경로 대비 +30% (임시값)
export const OFF_ROUTE_M = 30;     // 경로 이탈 기준 30m (FR-08)
export const ARRIVE_M = 30;        // 도착 판단 반경 30m (FR-08)
export const WALK_MPS = 1.25;      // 도보 속도 m/s (약 4.5km/h)
export const SIM_STEP_M = 8;       // 시연: 0.25초마다 8m씩 이동 (실제보다 빠르게)

// 구간 위험도 (데이터 담당 파이프라인 결과, public/data/risk/)
// 시간 구분은 scripts/config_risk.json 과 같게 맞춤
export const RISK_DIR = '/data/risk';
export const NIGHT_HOURS = [22, 23, 0, 1, 2, 3];                      // 심야: 유흥주점 가산
export const DARK_HOURS = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6]; // 어두운 시간: 보안등·골목 반영
export const RISK_MATCH_M = 35;   // 경로 위 점에서 이 거리 안의 도로 구간 위험도를 사용
export const RISK_LEVELS = { low: 45, mid: 55 };  // 경로 평균 위험도 45 미만 낮음, 55 미만 보통, 이상 높음

// 위험도 평가 기준 (CCTV·비상벨 경유 개수 세기, 경유지 고르기에 사용)
export const NEAR_FACILITY_M = 50; // 이 거리 안에 CCTV·비상벨이 있으면 "시설 가까운 구간"
export const PASS_FACILITY_M = 30; // 이 거리 안의 시설은 "경유"한 것으로 셈
export const SAMPLE_STEP_M = 20;   // 경로를 20m 간격으로 나눠 검사

// 서비스 지역: 대구 전체(군위군 포함)
export const DAEGU_BOUNDS = { latMin: 35.55, latMax: 36.35, lngMin: 128.3, lngMax: 129.0 };
export const DAEGU_CENTER = { lat: 35.8714, lng: 128.6014 };
// 위치를 못 받을 때 쓰는 시연 위치 (대구 중구 중앙로역 근처)
export const DEMO_LOCATION = { lat: 35.871, lng: 128.5941, name: '시연 위치 (대구 중구 중앙로역 근처)' };

// 지도에 그리는 색 (카카오맵은 CSS 변수를 못 읽어서 색을 직접 적음)
export const COLORS = { safe: '#2E8BF0', fast: '#E8901A', passed: '#8A94A6', casing: '#FFFFFF', deviate: '#E8901A' };

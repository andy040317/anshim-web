// 화면별 구조 정보: 오른쪽 "구조" 패널에 표시 (구조설계서 작성용)
// ids = 요구사항 ID, comp = 화면 컴포넌트, parts = 안에 들어가는 부품, apis = 호출하는 API
// API 경로는 프론트·백엔드가 맞춰 볼 수 있도록 제안한 이름이에요.
export const META = {
  login: { group: '인증', title: '로그인', ids: ['UC-01', 'FR-01'], comp: 'LoginScreen', parts: ['Field', 'PrimaryButton'],
    apis: [['POST', '/auth/login', '아이디·비밀번호 확인 후 로그인 토큰 발급']] },
  signup: { group: '인증', title: '회원가입', ids: ['UC-01', 'FR-01'], comp: 'SignupScreen', parts: ['Field', 'IdCheckButton', 'AgreeCheckbox'],
    apis: [['GET', '/auth/check-id', '아이디 중복 확인'], ['POST', '/auth/signup', '회원가입 (비밀번호는 해시로 저장)']] },
  consent: { group: '시작', title: '위치 동의', ids: ['FR-02', 'UIR-US-01'], comp: 'ConsentScreen', parts: ['PurposeList', 'ConsentButtons'],
    apis: [['PUT', '/users/me/consents', '위치 수집 동의 여부 저장'], ['EXT', 'Geolocation API', '브라우저에서 현재 위치 받기']] },
  main: { group: '경로', title: '메인 지도', ids: ['UIR-US-01', 'OR-02', 'UIR-US-04'], comp: 'MainScreen',
    parts: ['KakaoMap', 'PlaceRows', 'LayerToggle', 'NearbySummary', 'SosButton', 'TabBar'],
    apis: [['EXT', '카카오맵 JavaScript SDK', '지도 표시'], ['GET', '/facilities', 'CCTV·비상벨·119안전센터 (지금은 CSV 전처리 JSON)']] },
  pickSheet: { group: '경로', title: '지도에서 위치 고르기', ids: ['UC-02', 'OR-02'], comp: 'PickSheet', parts: ['AddressLine', 'PickButtons'],
    apis: [['EXT', '카카오 좌표→주소 변환', '누른 지점의 주소 표시']] },
  search: { group: '경로', title: '장소 검색', ids: ['UC-02', 'FR-03', 'OR-02'], comp: 'SearchScreen', parts: ['SearchInput', 'DepartTimePicker', 'PlaceList'],
    apis: [['EXT', '카카오 장소검색', '대구 안에서 키워드로 장소 찾기']] },
  routes: { group: '경로', title: '경로 비교', ids: ['UC-02', 'FR-04', 'FR-05', 'FR-06', 'UIR-US-02'], comp: 'RouteCompareScreen',
    parts: ['KakaoMap', 'RouteCard', 'RiskMeter', 'ShareOption'],
    apis: [['POST', '/routes', '출발·도착·출발 시각 → 후보 경로 + 구간 위험도 평균 (지금은 public/data/risk 파일)'], ['EXT', 'OSRM 도보 경로', '후보 경로 (지금은 공개 서버)']] },
  guide: { group: '경로', title: '안내 중', ids: ['UC-03·04', 'FR-07', 'FR-08', 'SIR-02'], comp: 'GuideScreen',
    parts: ['KakaoMap', 'TurnCard', 'GuideModeChip', 'GpsBanner', 'DeviationBanner', 'ShareStatus', 'SosButton'],
    apis: [['EXT', 'Geolocation watchPosition', '실제 위치 안내: 폰 위치를 경로에 맞춰 진행·이탈·도착 판단'], ['POST', '/routes', '경로 이탈 시 재탐색'], ['POST', '/shares/{id}/locations', '위치공유 중 현재 위치 전송 (5초 주기)']] },
  guardians: { group: '보호자', title: '보호자 관리', ids: ['UC-05', 'FR-09', 'UIR-US-03'], comp: 'GuardianScreen', parts: ['GuardianList', 'GuardianForm'],
    apis: [['GET', '/guardians', '내 보호자 목록'], ['POST', '/guardians', '보호자 등록'], ['PUT', '/guardians/{id}', '보호자 수정'], ['DELETE', '/guardians/{id}', '보호자 삭제']] },
  shareSheet: { group: '보호자', title: '위치공유 시작', ids: ['UC-05', 'FR-10'], comp: 'ShareSheet', parts: ['GuardianPicker', 'ShareLink', 'CopyButton'],
    apis: [['POST', '/shares', '공유 링크 생성 (추측하기 어려운 토큰)'], ['DELETE', '/shares/{id}', '공유 종료 · 링크 즉시 무효화']] },
  guardianView: { group: '보호자', title: '보호자 조회', ids: ['UC-06·07', 'FR-11', 'UIR-GR-01', 'SIR-03'], comp: 'GuardianViewScreen',
    parts: ['KakaoMap', 'LastReceived', 'LinkStatus'],
    apis: [['GET', '/shares/{token}', '공유 상태·최근 위치 조회 (로그인 없음, 5초 주기)']] },
  sos: { group: '긴급', title: 'SOS', ids: ['UC-08', 'FR-12', 'UIR-US-04'], comp: 'SosFlow', parts: ['CancelCountdown', 'SosMap', 'ShelterList', 'ShelterRoute', 'AlarmIndicator', 'ReportDraft'],
    apis: [['POST', '/sos', 'SOS 시작 · 보호자 긴급 공유'], ['GET', '/facilities/shelters', '가까운 대피 후보 3곳 (편의점·지구대·119·비상벨)'], ['EXT', 'OSRM 도보 경로', '고른 대피 후보까지 길'], ['EXT', '카카오맵 길찾기 링크', '카카오맵(앱)에서 도보 길찾기'], ['EXT', 'Geolocation watchPosition', '실제 GPS일 때 실시간 위치'], ['POST', '/sos/{id}/end', '상황 종료']] },
  myinfo: { group: '기타', title: '내 정보', ids: ['FR-02', 'SIR-02'], comp: 'MyInfoScreen', parts: ['PermissionRow', 'NotificationRow', 'LogoutButton'],
    apis: [['PUT', '/users/me/consents', '위치 동의 변경'], ['POST', '/auth/logout', '로그아웃']] },
};

export const GROUPS = [
  ['인증', ['login', 'signup']],
  ['시작', ['consent']],
  ['경로', ['main', 'pickSheet', 'search', 'routes', 'guide']],
  ['보호자', ['guardians', 'shareSheet', 'guardianView']],
  ['긴급', ['sos']],
  ['기타', ['myinfo']],
];

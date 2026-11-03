// 앱 본체: 모든 상태(로그인, 위치, 경로, 안내, 공유, SOS)와 동작을 한곳에서 관리
// 화면들은 useApp() 으로 여기의 ctx 값을 꺼내 씀
import { useState, useEffect, useRef, useCallback } from 'react';
import { AppCtx } from './AppContext';
import {
  SOS_CANCEL_SEC, SHARE_EXPIRE_MIN, ARRIVE_M, SIM_STEP_M, OFF_ROUTE_M, DEMO_LOCATION, NIGHT_HOURS,
} from './config';
import { distM, pathLength, pointAlong, offsetM, inDaegu, fmtClock, makeToken, projectOnPath } from './lib/geo';
import { loadKakaoMap } from './lib/loadKakaoMap';
import { loadFacilities, geocodeFire } from './lib/facilities';
import { findRoutes, rerouteFrom } from './lib/router';
import { META } from './lib/meta';
import Panel from './components/Panel';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import ConsentScreen from './screens/ConsentScreen';
import MainScreen from './screens/MainScreen';
import PickSheet from './screens/PickSheet';
import SearchScreen from './screens/SearchScreen';
import RouteCompareScreen from './screens/RouteCompareScreen';
import GuideScreen from './screens/GuideScreen';
import ArrivedSheet from './screens/ArrivedSheet';
import GuardianScreen from './screens/GuardianScreen';
import ShareSheet from './screens/ShareSheet';
import GuardianViewScreen from './screens/GuardianViewScreen';
import SosFlow from './screens/SosFlow';
import MyInfoScreen from './screens/MyInfoScreen';

// 화면 이름 → 컴포넌트
const SCREENS = {
  login: LoginScreen, signup: SignupScreen, consent: ConsentScreen, main: MainScreen, search: SearchScreen,
  routes: RouteCompareScreen, guide: GuideScreen, guardians: GuardianScreen, myinfo: MyInfoScreen,
};
// 하단 시트 이름 → 컴포넌트
const SHEETS = { pick: PickSheet, share: ShareSheet, arrived: ArrivedSheet };

// 시연용 목적지 (패널에서 화면으로 바로 이동할 때 사용)
const DEMO_DEST = { lat: 35.8662, lng: 128.6052, name: '시연 목적지 (중구 삼덕동)', addr: '대구 중구 삼덕동' };

// 시연용 시계 기준: 오늘 22:40(심야) 또는 14:00(주간)
function baseTime(night) {
  const d = new Date();
  d.setHours(night ? 22 : 14, night ? 40 : 0, 0, 0);
  return d.getTime();
}

export default function App({ onReset }) {
  const [users, setUsers] = useState([{ id: 'demo', pw: 'safe1234', name: '김안심' }]);
  const [me, setMe] = useState(null);                 // 로그인한 사용자
  const [screen, setScreen] = useState('login');      // 지금 화면
  const [prefillId, setPrefillId] = useState('');
  const [consent, setConsent] = useState(null);       // 위치 동의: true / false / null(아직)
  // guideMode: 안내 중 위치를 어디서 받을지
  //   'auto' = 실제 GPS 위치를 받는 중이면 실제 위치, 아니면(PC 시연 위치) 시연 자동 이동
  //   'gps'  = 항상 실제 위치 (폰으로 걸으며 테스트)   'sim' = 항상 자동 이동 (발표 시연)
  const [demo, setDemo] = useState({ night: true, commError: false, routeFail: false, gpsLost: false, gpsLostAt: null, speed: 1, shareDelay: false, idStrip: false, guideMode: 'auto' });
  const [gpsInfo, setGpsInfo] = useState({ lastFixAt: null, acc: null, error: '' }); // 실시간 위치 수신 상태
  const [guardians, setGuardians] = useState([{ id: 1, name: '친구', phone: '010-1234-5678' }]);
  const [myPos, setMyPos] = useState(null);           // 내 위치 { lat, lng, source: 'gps' | 'demo' }
  const [startPick, setStartPick] = useState(null);   // 직접 고른 출발지 (없으면 내 위치)
  const [destPick, setDestPick] = useState(null);     // 고른 목적지
  const [pickPoint, setPickPoint] = useState(null);   // 지도에서 누른 지점
  const [searchMode, setSearchMode] = useState('dest');
  const [recent, setRecent] = useState([]);           // 최근 목적지
  const [trip, setTrip] = useState(null);             // 경로 비교 결과
  const [guide, setGuide] = useState(null);           // 안내 중 상태
  const [share, setShare] = useState(null);           // 보호자 위치공유
  const [sos, setSos] = useState(null);               // SOS 진행 상태
  const [sheet, setSheet] = useState(null);           // 하단 시트: 'pick' | 'share' | 'arrived'
  const [toast, setToast] = useState(null);
  const [logs, setLogs] = useState([]);
  const [viewAs, setViewAs] = useState('user');       // 'user' 또는 'guardian'(보호자 시점)
  // 메인 지도 레이어 (기본 모두 켜짐. 유흥주점은 지도에 표시하지 않음)
  const [layers, setLayers] = useState({ cctv: true, bell: true, lamp: true, police: true, fire: true, store: true });
  // 지도 종류: 'roadmap'(일반) 또는 'hybrid'(위성+이름). 메인에서 바꾸면 모든 화면 지도에 같이 적용
  const [mapType, setMapType] = useState('roadmap');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState('structure');
  const [kakaoState, setKakaoState] = useState({ status: 'loading', error: '' });
  const [facVersion, setFacVersion] = useState(0);    // 시설 데이터가 바뀔 때마다 +1
  const [, setTick] = useState(0);
  const startRef = useRef(Date.now());
  const demoRef = useRef(demo);
  demoRef.current = demo;

  // ── 시계·토스트·기록 ──
  const clock = useCallback(() => baseTime(demoRef.current.night) + (Date.now() - startRef.current), []);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);
  const showToast = msg => setToast({ msg, key: Date.now() });
  const pushLog = useCallback((method, path, status, note) => {
    setLogs(l => [{ id: Date.now() + Math.random(), at: fmtClock(clock(), true), method, path, status, ok: status === 200 || status === 201, note }, ...l].slice(0, 100));
  }, [clock]);

  // 가짜 백엔드 API 호출: 기록을 남기고, 시연 도구의 "통신 오류"를 켜면 실패
  const call = useCallback((method, path, run, opts = {}) => new Promise((resolve, reject) => {
    setTimeout(async () => {
      if (demoRef.current.commError) {
        pushLog(method, path, '연결 실패', opts.note);
        reject({ code: 'NETWORK', message: '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.' });
        return;
      }
      try {
        const r = run ? await run() : null;
        pushLog(method, path, opts.status || 200, opts.note);
        resolve(r);
      } catch (e) {
        pushLog(method, path, e.status || 'ERR', e.message);
        reject(e);
      }
    }, opts.delay ?? 300);
  }), [pushLog]);
  const fail = (status, code, message) => { throw { status, code, message }; };

  // ── 시작할 때: 시설 데이터 + 카카오맵 불러오기 ──
  useEffect(() => {
    loadFacilities()
      .then(s => { setFacVersion(v => v + 1); pushLog('GET', '/facilities', 200, 'CCTV ' + s.cctv.length + '곳 · 비상벨 ' + s.bell.length + '곳 · 119 ' + s.fire.length + '곳'); })
      .catch(e => { pushLog('GET', '/facilities', 'ERR', e.message); showToast('안전시설 데이터를 불러오지 못했어요.'); });
    loadKakaoMap()
      .then(() => setKakaoState({ status: 'ready', error: '' }))
      .catch(e => setKakaoState({ status: 'error', error: e.message }));
  }, []);
  // 지도와 시설 데이터가 준비되면 119안전센터 주소를 좌표로 바꿈 (한 번)
  const facLoaded = facVersion > 0;
  useEffect(() => {
    if (kakaoState.status !== 'ready' || !facLoaded) return;
    loadKakaoMap().then(kakao => geocodeFire(kakao)).then(n => {
      if (n) { setFacVersion(v => v + 1); pushLog('EXT', '카카오 주소→좌표 변환', 200, '119안전센터 ' + n + '곳'); }
    }).catch(() => {});
  }, [kakaoState.status, facLoaded]);

  // ── 내 위치 (브라우저 Geolocation) ──
  const fallbackToDemo = reason => {
    setMyPos({ lat: DEMO_LOCATION.lat, lng: DEMO_LOCATION.lng, source: 'demo' });
    if (reason) showToast(reason + ' 시연 위치(대구 중구)를 사용해요.');
  };
  const locate = () => {
    if (!('geolocation' in navigator)) { fallbackToDemo('이 브라우저는 위치 기능이 없어요.'); return; }
    navigator.geolocation.getCurrentPosition(
      p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (!inDaegu(pos)) { fallbackToDemo('지금 위치가 서비스 지역(대구) 밖이에요.'); return; }
        setMyPos({ ...pos, source: 'gps' });
        pushLog('EXT', 'Geolocation API', 200, '현재 위치 받음');
      },
      err => fallbackToDemo(err.code === 1 ? '브라우저 위치 권한이 꺼져 있어요.' : '위치를 확인하지 못했어요.'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };
  useEffect(() => { if (consent === true && !myPos) locate(); if (consent === false) setMyPos(null); }, [consent]);

  // 지금 내 위치 (안내 중이면 경로 위의 위치)
  const guidePos = g => (g.deviated ? g.devPos : pointAlong(g.route.pts, g.d));
  const currentPos = guide ? guidePos(guide) : (consent === false ? startPick : myPos);
  const posRef = useRef(null);
  posRef.current = currentPos;
  const routeStart = () => startPick || (consent !== false ? myPos : null);

  /* ── 인증 ── */
  const login = (id, pw) => call('POST', '/auth/login', () => {
    const u = users.find(x => x.id === id && x.pw === pw);
    if (!u) fail(401, 'AUTH_FAILED', '아이디 또는 비밀번호가 맞지 않아요.');
    return u;
  }).then(u => { setMe(u); setScreen(consent === null ? 'consent' : 'main'); showToast(u.name + '님, 반가워요.'); });
  const checkId = id => call('GET', '/auth/check-id?id=' + id, () => ({ available: !users.some(u => u.id === id) && id !== 'admin' }));
  const signup = data => call('POST', '/auth/signup', () => {
    if (users.some(u => u.id === data.id)) fail(409, 'DUPLICATE_ID', '이미 사용 중인 아이디예요.');
    setUsers(us => [...us, data]);
    return true;
  }, { status: 201 }).then(() => { setPrefillId(data.id); setScreen('login'); showToast('가입했어요. 로그인해 주세요.'); });
  const decideConsent = ok => call('PUT', '/users/me/consents', () => true, { note: '위치 동의: ' + (ok ? '동의' : '거부') })
    .then(() => { setConsent(ok); setScreen('main'); if (!ok) showToast('지도를 누르거나 검색해서 출발지를 정해 주세요.'); })
    .catch(e => { showToast(e.message); throw e; });
  const logout = () => {
    call('POST', '/auth/logout', () => true).catch(() => {});
    if (share && share.status === 'active') setShare(s => ({ ...s, status: 'ended', reason: 'user' }));
    setMe(null); setGuide(null); setTrip(null); setSos(null); setSheet(null); setScreen('login');
  };

  /* ── 지도에서 고른 지점 ── */
  const openPick = p => { setPickPoint(p); setSheet('pick'); };
  const choosePlace = (role, place) => {
    if (role === 'start') { setStartPick(place); showToast('출발지를 정했어요.'); }
    else { setDestPick(place); showToast('목적지를 정했어요.'); }
    setSheet(null);
  };

  /* ── 경로 ── */
  const requestRoutes = (dest, opts = {}) => {
    const start = opts.start || routeStart();
    if (!start) { showToast('출발지를 먼저 정해 주세요.'); return Promise.resolve(); }
    // 출발 시각(0~23시): 검색 화면에서 고른 시각, 없으면 시연 시계의 지금 시각
    const hour = opts.hour ?? new Date(clock()).getHours();
    const night = NIGHT_HOURS.includes(hour);
    setDestPick(dest);
    setRecent(r => [dest, ...r.filter(x => x.name !== dest.name)].slice(0, 5));
    setTrip({ dest, start, hour, night, status: 'loading' });
    setScreen('routes');
    return call('POST', '/routes', async () => {
      if (demoRef.current.routeFail) fail(422, 'NO_ROUTE', '이 목적지까지 걸어갈 수 있는 경로를 만들지 못했어요.');
      if (!inDaegu(start) || !inDaegu(dest)) fail(400, 'OUT_OF_AREA', '출발지나 목적지가 서비스 지역(대구) 밖이에요.');
      if (distM(start, dest) < 30) fail(400, 'TOO_CLOSE', '출발지와 목적지가 30m 안이라 경로를 만들 필요가 없어요.');
      await loadFacilities();
      return findRoutes(start, dest, hour, pushLog);
    }, { delay: 50, note: dest.name + ' · ' + hour + '시 위험도 기준' })
      .then(res => setTrip(t => ({ ...t, status: 'ready', routes: res.routes, engine: res.engine, engineError: res.engineError, reason: res.reason, selectedId: res.routes[0].id })))
      .catch(e => setTrip(t => ({ ...t, status: 'error', error: e })));
  };
  // 안내 방식 결정: 'gps'(실제 위치) 또는 'sim'(시연 자동 이동)
  const resolveMode = m => (m === 'auto' ? (myPos && myPos.source === 'gps' ? 'gps' : 'sim') : m);
  const setGuideMode = m => {
    setDemo(d => ({ ...d, guideMode: m }));
    setGuide(g => g && ({ ...g, mode: resolveMode(m) }));
  };
  const startGuide = withShare => {
    const r = trip.routes.find(x => x.id === trip.selectedId);
    setGpsInfo({ lastFixAt: null, acc: null, error: '' });
    setGuide({ key: Date.now(), route: { pts: r.pts, steps: r.steps, engine: r.engine }, total: pathLength(r.pts), d: 0, deviated: false, devPos: null, arrived: false, routeName: r.name, dest: trip.dest, mode: resolveMode(demo.guideMode) });
    setScreen('guide');
    if (withShare && guardians.length) createShare(guardians.map(g => g.id), 'normal').catch(() => {});
  };
  const endGuide = () => {
    if (share && share.status === 'active' && share.type === 'normal') endShare('user');
    setGuide(null); setSheet(null); setScreen('main');
  };
  // 시연: 경로 옆으로 45m 벗어나게 만들기
  const triggerDeviation = () => {
    if (!guide || guide.arrived) return;
    const pts = guide.route.pts;
    const p = pointAlong(pts, guide.d);
    const a = pts[p.seg], b = pts[Math.min(p.seg + 1, pts.length - 1)];
    const north = (b.lat - a.lat) * 111320, east = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
    const L = Math.hypot(north, east) || 1;
    const off = OFF_ROUTE_M + 15;
    setGuide(g => ({ ...g, deviated: true, devPos: offsetM(p, (-east / L) * off, (north / L) * off) }));
  };
  const reroute = () => {
    const g = guide;
    return call('POST', '/routes', () => rerouteFrom(g.devPos, g.dest, pushLog), { delay: 50, note: '이탈 지점에서 재탐색' }).then(route => {
      setGuide(x => ({ ...x, key: Date.now(), route, total: pathLength(route.pts), d: 0, deviated: false, devPos: null }));
      showToast(route.engine === 'osrm' ? '새 경로로 안내할게요.' : '경로 서버에 연결하지 못해 목적지 방향(직선)으로 안내해요.');
    });
  };
  const skipToArrival = () => setGuide(g => g && ({ ...g, deviated: false, devPos: null, d: g.total, arrived: true }));

  // ── 실제 위치 받기 (watchPosition) ──
  // 실제 위치 안내 중이거나, SOS 실행 중(실제 GPS를 쓰는 경우)에만 위치를 계속 받음
  const gpsGuide = !!guide && guide.mode === 'gps' && !guide.arrived;
  const gpsSos = !!sos && sos.phase === 'active' && myPos && myPos.source === 'gps';
  const watchOn = consent === true && (gpsGuide || gpsSos);
  useEffect(() => {
    if (!watchOn) return;
    if (!('geolocation' in navigator)) { setGpsInfo(s => ({ ...s, error: '이 브라우저는 위치 기능이 없어요.' })); return; }
    const id = navigator.geolocation.watchPosition(
      p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setGpsInfo({ lastFixAt: Date.now(), acc: Math.round(p.coords.accuracy), error: '' });
        setMyPos({ ...pos, source: 'gps' });
        // 안내 중이면: 경로 위에 맞춰서 진행 거리·이탈·도착 판단 (FR-08)
        setGuide(g => {
          if (!g || g.mode !== 'gps' || g.arrived) return g;
          if (distM(pos, g.dest) <= ARRIVE_M) return { ...g, d: g.total, deviated: false, devPos: null, arrived: true };
          const pr = projectOnPath(g.route.pts, pos);
          if (pr.off > OFF_ROUTE_M) return { ...g, deviated: true, devPos: pos };
          return { ...g, d: Math.min(g.total, pr.along), deviated: false, devPos: null };
        });
      },
      err => {
        const msg = err.code === 1 ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 위치 권한을 허용해 주세요.'
          : '위치를 받지 못하고 있어요. 실외로 나가거나 잠시 기다려 주세요.';
        setGpsInfo(s => ({ ...s, error: msg }));
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    pushLog('EXT', 'Geolocation watchPosition', 200, gpsGuide ? '실제 위치 안내 시작' : 'SOS 위치 추적 시작');
    return () => navigator.geolocation.clearWatch(id); // 안내·SOS가 끝나면 위치 받기 중단 (위치정보 최소 수집)
  }, [watchOn]);

  // 안내 시뮬레이션(시연 자동 이동): 0.25초마다 경로를 따라 이동
  const guideRunning = !!guide && guide.mode === 'sim' && !guide.arrived && !guide.deviated && !demo.gpsLost;
  useEffect(() => {
    if (!guideRunning) return;
    const t = setInterval(() => setGuide(g => {
      if (!g || g.arrived || g.deviated) return g;
      const d = Math.min(g.total, g.d + SIM_STEP_M * demoRef.current.speed);
      const arrived = g.total - d <= ARRIVE_M; // 목적지 30m 안이면 도착
      return { ...g, d: arrived ? g.total : d, arrived };
    }), 250);
    return () => clearInterval(t);
  }, [guideRunning]);
  // 도착하면: 일반 위치공유 종료 + 도착 안내
  const arrived = !!guide && guide.arrived;
  useEffect(() => {
    if (!arrived) return;
    if (share && share.status === 'active' && share.type === 'normal') endShare('arrived');
    setSheet('arrived');
  }, [arrived]);

  /* ── 보호자·위치공유 ── */
  const addGuardian = g => call('POST', '/guardians', () => { const n = { ...g, id: Date.now() }; setGuardians(l => [...l, n]); return n; }, { status: 201 });
  const updateGuardian = g => call('PUT', '/guardians/' + g.id, () => { setGuardians(l => l.map(x => (x.id === g.id ? g : x))); return g; });
  const removeGuardian = id => call('DELETE', '/guardians/' + id, () => { setGuardians(l => l.filter(x => x.id !== id)); return true; });
  const createShare = (ids, type) => call('POST', '/shares', () => {
    const t = clock();
    return { id: makeToken(6), token: makeToken(22), type, guardianIds: ids, startedAt: t, expiresAt: t + SHARE_EXPIRE_MIN * 60000, status: 'active', last: { pos: posRef.current, at: t } };
  }, { status: 201, note: type === 'sos' ? '긴급(SOS) 공유' : '일반 공유' }).then(s => { setShare(s); return s; });
  const endShare = reason => {
    if (!share) return;
    call('DELETE', '/shares/' + share.id, () => true, { note: { arrived: '도착 → 자동 종료', user: '사용자가 종료', sos: 'SOS 상황 종료' }[reason] || '' }).catch(() => {});
    setShare(s => s && ({ ...s, status: 'ended', reason }));
  };
  const expireShare = () => { setShare(s => s && ({ ...s, status: 'expired', reason: 'expired' })); showToast('공유 링크가 만료되었어요.'); };
  // 공유 중에는 5초마다 위치 전송 (시연 도구의 "수신 지연"을 켜면 멈춤)
  const shareActive = !!share && share.status === 'active';
  useEffect(() => {
    if (!shareActive) return;
    const t = setInterval(() => {
      if (demoRef.current.shareDelay || demoRef.current.gpsLost) return;
      setShare(s => (s && s.status === 'active' ? { ...s, last: { pos: posRef.current, at: clock() } } : s));
      pushLog('POST', '/shares/{id}/locations', 200, '위치 전송 (5초 주기)');
    }, 5000);
    return () => clearInterval(t);
  }, [shareActive]);

  /* ── SOS ── */
  const startSos = () => { setSheet(null); setSos({ phase: 'countdown', left: SOS_CANCEL_SEC }); };
  const cancelSos = () => { setSos(null); showToast('SOS를 취소했어요. 위치공유는 시작하지 않았어요.'); };
  const activateSos = () => {
    const stale = demoRef.current.gpsLost;
    const at = stale ? demoRef.current.gpsLostAt || clock() : clock();
    setSos(s => ({ ...s, phase: 'active', id: makeToken(6), pos: posRef.current, at, stale, alarm: true, shareFailed: false }));
    call('POST', '/sos', () => true, { status: 201, note: 'SOS 시작' }).catch(() => {});
    if (guardians.length) {
      if (share && share.status === 'active') setShare(s => ({ ...s, type: 'sos' }));
      else createShare(guardians.map(g => g.id), 'sos').catch(() => setSos(s => s && ({ ...s, shareFailed: true })));
    }
  };
  useEffect(() => {
    if (!sos || sos.phase !== 'countdown') return;
    if (sos.left <= 0) { activateSos(); return; }
    const t = setTimeout(() => setSos(s => (s && s.phase === 'countdown' ? { ...s, left: s.left - 1 } : s)), 1000);
    return () => clearTimeout(t);
  }, [sos && sos.phase, sos && sos.left]);
  const endSos = () => {
    call('POST', '/sos/' + (sos && sos.id) + '/end', () => true, { note: '상황 종료' }).catch(() => {});
    if (share && share.status === 'active' && share.type === 'sos') endShare('sos');
    setSos(null);
    showToast('상황을 종료했어요. 긴급 공유도 끝냈어요.');
  };

  /* ── 패널에서 화면으로 바로 이동 (시연용) ── */
  const jumpTo = key => {
    setPanelOpen(false); setSheet(null); setSos(null);
    if (key === 'login' || key === 'signup') { setViewAs('user'); setScreen(key); return; }
    if (!me) setMe(users[0]);
    if (key === 'consent') { setViewAs('user'); setScreen('consent'); return; }
    if (consent === null) setConsent(true);
    const start = routeStart() || DEMO_LOCATION;
    if (key === 'guardianView') {
      if (!shareActive) createShare(guardians.map(g => g.id), 'normal').catch(() => {});
      setViewAs('guardian');
      return;
    }
    setViewAs('user');
    if (key === 'routes') { requestRoutes(destPick || DEMO_DEST, { start }); return; }
    if (key === 'guide') {
      if (guide) setScreen('guide');
      else if (trip && trip.status === 'ready') startGuide(false);
      else { requestRoutes(destPick || DEMO_DEST, { start }); showToast('경로를 먼저 계산할게요. 안내 시작을 눌러 주세요.'); }
      return;
    }
    if (key === 'pickSheet') { setScreen('main'); openPick({ lat: start.lat + 0.002, lng: start.lng + 0.002 }); return; }
    if (key === 'shareSheet') { if (['login', 'signup', 'consent'].includes(screen)) setScreen('main'); setSheet('share'); return; }
    if (key === 'sos') { if (['login', 'signup', 'consent'].includes(screen)) setScreen('main'); startSos(); return; }
    setScreen(key);
  };

  const metaKey = viewAs === 'guardian' ? 'guardianView' : sos ? 'sos' : sheet === 'share' ? 'shareSheet' : sheet === 'pick' ? 'pickSheet' : screen;
  const ctx = {
    users, me, screen, go: setScreen, prefillId, consent, setConsent, demo, setDemo, guardians, gpsInfo, setGuideMode,
    myPos, locate, startPick, setStartPick, destPick, setDestPick, pickPoint, openPick, choosePlace, searchMode, setSearchMode, recent,
    trip, setTrip, guide, share, sos, setSos, sheet, setSheet, toast, showToast, logs, setLogs, viewAs, setViewAs, layers, setLayers, mapType, setMapType,
    panelOpen, setPanelOpen, panelTab, setPanelTab, metaKey, kakaoState, facVersion,
    clock, clockText: fmtClock(clock()), call, pushLog,
    login, checkId, signup, decideConsent, logout, requestRoutes, routeStart, startGuide, endGuide, triggerDeviation, reroute, skipToArrival,
    addGuardian, updateGuardian, removeGuardian, createShare, endShare, expireShare, startSos, cancelSos, endSos,
    currentPos, jumpTo, reset: onReset,
  };
  const Screen = SCREENS[screen] || MainScreen;
  const SheetComp = sheet ? SHEETS[sheet] : null;
  return (
    <AppCtx.Provider value={ctx}>
      <div className="stage">
        <div className="phone">
          <div className="demo-bar"><span>안심귀갓길 프로토타입</span><button onClick={() => setPanelOpen(true)}>구조·시연 도구</button></div>
          {demo.idStrip && <div className="id-strip"><b>{META[metaKey].comp}</b>{META[metaKey].ids.map(i => <span key={i}>· {i}</span>)}</div>}
          <div className="screen-wrap">
            {viewAs === 'guardian' ? <GuardianViewScreen /> : <Screen key={screen} />}
            {viewAs === 'user' && SheetComp && <SheetComp />}
            {viewAs === 'user' && sos && <SosFlow />}
            {toast && <div key={toast.key} className="toast" role="status">{toast.msg}</div>}
          </div>
        </div>
        <Panel />
      </div>
    </AppCtx.Provider>
  );
}

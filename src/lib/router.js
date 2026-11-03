// 경로 찾기 + 위험도 평가 (백엔드 POST /routes 가 할 일을 프론트에서 흉내 냄)
//
// 1) OSRM(도보)에서 후보 경로를 받음: 바로 가는 경로 + 다른 길(alternatives)
// 2) CCTV가 많이 모인 지점을 "경유지"로 넣은 후보도 1~2개 더 받음
// 3) 후보마다 지나는 도로 구간의 '출발 시각 위험도'를 평균 (risk.js, 데이터 파이프라인 결과)
//    위험도에는 범죄주의구간·유동인구·CCTV·비상벨·보안등·대피 거점·유흥주점·길 종류가 반영돼 있음
// 4) 가장 짧은 경로 = "거리 우선", 우회 한도 안에서 위험도가 가장 낮은 경로 = "안전시설 경유"
import { ROUTER_URL, ROUTER_MIN_GAP_MS, DETOUR_LIMIT, RISK_GAP, CRIME_CUT_MIN_M, CRIME_CUT_RATIO, PASS_FACILITY_M, SAMPLE_STEP_M, RISK_LEVELS } from '../config';
import { distM, pathLength, distToPathM, samplePath, fmtDist } from './geo';
import { nearby } from './facilities';
import { routeRisk } from './risk';

const wait = ms => new Promise(r => setTimeout(r, ms));

// ── OSRM 호출 ──
let lastCall = 0;
async function osrmRoute(coords, alternatives, log, note) {
  // 공개 서버 이용 규칙: 1초에 1번 이하
  const gap = Date.now() - lastCall;
  if (gap < ROUTER_MIN_GAP_MS) await wait(ROUTER_MIN_GAP_MS - gap);
  lastCall = Date.now();

  const c = coords.map(p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
  const url = ROUTER_URL + '/route/v1/driving/' + c +
    '?overview=full&geometries=geojson&steps=true&alternatives=' + (alternatives ? '3' : 'false');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('경로 서버 응답 오류 (' + res.status + ')');
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes.length) throw new Error('경로 서버가 경로를 찾지 못했어요 (' + data.code + ')');
    log && log('EXT', 'OSRM 도보 경로', 200, note + ' · 후보 ' + data.routes.length + '개');
    return data.routes;
  } catch (e) {
    const msg = e.name === 'AbortError' ? '경로 서버 응답이 8초 넘게 없어요' : e.message;
    log && log('EXT', 'OSRM 도보 경로', 'ERR', note + ' · ' + msg);
    throw new Error(msg);
  } finally {
    clearTimeout(timer);
  }
}

// OSRM 응답 하나 → 우리 경로 모양 { pts, steps, engine }
function toRoute(r) {
  const pts = r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  const steps = [];
  let acc = 0;
  r.legs.forEach((leg, li) => leg.steps.forEach(st => {
    // at = 이 안내(회전 등)가 나오는 지점까지의 거리
    steps.push({ at: acc, type: st.maneuver.type, modifier: st.maneuver.modifier || '', lastLeg: li === r.legs.length - 1 });
    acc += st.distance;
  }));
  return { pts, steps, engine: 'osrm' };
}

// 경로 엔진에 연결하지 못했을 때: 출발→도착 직선
function straightRoute(a, b) {
  return { pts: [a, b], steps: [], engine: 'straight' };
}

// ── 경유지 고르기: 출발·도착 사이(타원 안)에서 CCTV가 많이 모인 곳 ──
function pickViaPoints(start, dest, base, n) {
  const direct = distM(start, dest);
  if (direct < 300) return []; // 너무 가까우면 경유지 후보를 만들지 않음
  const mid = { lat: (start.lat + dest.lat) / 2, lng: (start.lng + dest.lng) / 2 };
  const cells = new Map();
  nearby('cctv', mid, direct * 0.65).forEach(f => {
    if (distM(start, f) + distM(f, dest) > direct * (1 + DETOUR_LIMIT * 0.8)) return; // 너무 돌아가는 곳 제외
    if (distToPathM(f, base.pts) < 80) return; // 이미 기본 경로 위에 있는 곳 제외
    const k = Math.floor(f.lat / 0.0015) + ':' + Math.floor(f.lng / 0.0015);
    const c = cells.get(k) || { n: 0, lat: 0, lng: 0, k: 0 };
    c.n += f.n; c.lat += f.lat; c.lng += f.lng; c.k += 1;
    cells.set(k, c);
  });
  const ranked = [...cells.values()].sort((a, b) => b.n - a.n).map(c => ({ lat: c.lat / c.k, lng: c.lng / c.k }));
  const picked = [];
  for (const p of ranked) {
    if (picked.every(q => distM(p, q) > 200)) picked.push(p);
    if (picked.length >= n) break;
  }
  return picked;
}

// ── 위험도 평가 ──
// 경로가 지나가며 30m 안에 두는 CCTV 카메라·비상벨 개수 (경로 카드의 근거 표시용)
function passedFacilities(pts) {
  const cctv = new Set(), bell = new Set();
  samplePath(pts, SAMPLE_STEP_M).forEach(p => {
    nearby('cctv', p, PASS_FACILITY_M).forEach(f => cctv.add(f));
    nearby('bell', p, PASS_FACILITY_M).forEach(f => bell.add(f));
  });
  return { cameras: [...cctv].reduce((s, f) => s + f.n, 0), bell: bell.size };
}

// 경로 하나 평가: 길이 + 출발 시각 위험도 + 근거
export async function scoreRoute(pts, hour) {
  const r = await routeRisk(pts, hour);
  return { len: pathLength(pts), ...passedFacilities(pts), ...r };
}

export function riskLevel(r) {
  if (r < RISK_LEVELS.low) return { label: '낮음', tone: 'accent' };
  if (r < RISK_LEVELS.mid) return { label: '보통', tone: 'amber' };
  return { label: '높음', tone: 'danger' };
}

// 두 경로가 사실상 같은 길인지
function isSame(a, b) {
  if (Math.abs(a.len - b.len) / Math.max(a.len, 1) > 0.03) return false;
  const s = samplePath(b.pts, 40);
  return s.filter(p => distToPathM(p, a.pts) < 20).length / s.length > 0.9;
}

// ── 메인: 후보 경로 찾기 → 평가 → 거리 우선 / 안전시설 경유 고르기 ──
export async function findRoutes(start, dest, hour, log) {
  let candidates = [];
  let engine = 'osrm', engineError = null;
  try {
    const direct = await osrmRoute([start, dest], true, log, '바로 가는 길');
    candidates = direct.map((r, i) => ({ ...toRoute(r), src: '바로 가는 길 ' + (i + 1) }));
    // CCTV 경유 후보는 항상 최대 2개 (공개 서버가 다른 길을 1개만 주는 경우가 많아서 비교 후보를 늘림)
    const vias = pickViaPoints(start, dest, candidates[0], 2);
    for (let i = 0; i < vias.length; i++) {
      try {
        const r = await osrmRoute([start, vias[i], dest], false, log, 'CCTV 밀집 지점 경유 ' + (i + 1));
        candidates.push({ ...toRoute(r[0]), src: 'CCTV 경유 ' + (i + 1) });
      } catch (e) { /* 경유 후보 하나가 실패해도 나머지로 계속 */ }
    }
  } catch (e) {
    engine = 'straight';
    engineError = e.message;
    candidates = [straightRoute(start, dest)];
  }

  // 평가하고 짧은 순서로 정렬, 같은 길은 하나만 남김
  const scored = (await Promise.all(candidates.map(async c => ({ ...c, ...(await scoreRoute(c.pts, hour)) }))))
    .sort((a, b) => a.len - b.len);
  const unique = [];
  scored.forEach(r => {
    if (unique.some(u => isSame(u, r))) r.verdict = '같은 길이라 제외';
    else unique.push(r);
  });

  const fast = unique[0];
  fast.verdict = '최단 (기준)';
  const inLimit = unique.filter(r => r !== fast && r.len <= fast.len * (1 + DETOUR_LIMIT)); // 우회 허용 한도 안에서
  unique.forEach(r => { if (r !== fast && !inLimit.includes(r)) r.verdict = Math.round(DETOUR_LIMIT * 100) + '% 넘게 돌아가서 제외'; });
  inLimit.forEach(r => {
    const d = fast.risk - r.risk; // 양수면 최단 경로보다 안전
    r.verdict = d > 0 ? d + '점 낮음' : d < 0 ? -d + '점 높음' : '위험도 같음';
  });

  // 안전 경로 고르기 (기준은 config.js 의 RISK_GAP, CRIME_CUT_*)
  //   ① 평균 위험도가 가장 낮은 후보가 RISK_GAP 점 이상 낮으면 → 그 후보
  //   ② 아니면, 평균은 같거나 낮으면서 범죄주의 구간이 충분히 줄어든 후보 중 범죄주의 구간이 가장 짧은 것
  let safe = null;
  const lowest = [...inLimit].sort((a, b) => a.risk - b.risk)[0];
  if (lowest && lowest.risk <= fast.risk - RISK_GAP) {
    safe = { ...lowest, why: '평균 위험도 ' + (fast.risk - lowest.risk) + '점 낮음' };
  } else {
    const cut = r => fast.crimeHighM - r.crimeHighM; // 줄어든 범죄주의 구간 길이(m)
    const byCrime = inLimit
      .filter(r => r.risk <= fast.risk && cut(r) >= CRIME_CUT_MIN_M && r.crimeHighM <= fast.crimeHighM * (1 - CRIME_CUT_RATIO))
      .sort((a, b) => a.crimeHighM - b.crimeHighM || a.risk - b.risk)[0];
    if (byCrime) safe = { ...byCrime, why: '범죄주의 구간 ' + fmtDist(cut(byCrime)) + ' 적음' };
  }

  // 하나만 보여주는 이유 (화면 문구용)
  //   noAlt: 다른 길 후보가 없음 / tooLong: 다른 길이 너무 돌아감 / smallDiff: 위험도 차이가 거의 없음
  let reason = null;
  if (unique.length === 1) reason = 'noAlt';
  else if (!inLimit.length) reason = 'tooLong';
  else if (!safe) reason = 'smallDiff';
  else scored.find(r => r.pts === safe.pts).verdict = '안전 경로로 선택 (' + safe.why + ')';

  // API 기록에 후보별 길이·위험도·판정 남기기 (하나만 나온 이유를 확인하는 용도)
  // 기록은 최신이 위에 쌓이므로, 거꾸로 넣어야 ①②③ 순서로 보임
  if (log) {
    const num = ['①', '②', '③', '④', '⑤', '⑥'];
    [...scored].reverse().forEach(r => {
      const i = scored.indexOf(r);
      log('계산', '후보 경로 ' + (num[i] || i + 1), 200,
        r.src + ' · ' + fmtDist(r.len) + ' · 위험도 ' + r.risk + ' → ' + (r.verdict || ''));
    });
  }

  // 안전 경로가 없으면 하나만 보여줌 (FR-04)
  if (reason) {
    return { engine, engineError, reason, routes: [{ ...fast, id: 'one', name: '추천 경로', single: true, detour: 0 }] };
  }
  return {
    engine, engineError,
    routes: [
      { ...safe, id: 'safe', name: '안전시설 경유 경로', detour: safe.len - fast.len },
      { ...fast, id: 'fast', name: '거리 우선 경로', detour: 0 },
    ],
  };
}

// 경로 이탈 후 재탐색: 지금 위치 → 목적지 하나만
export async function rerouteFrom(pos, dest, log) {
  try {
    const r = await osrmRoute([pos, dest], false, log, '재탐색');
    return toRoute(r[0]);
  } catch (e) {
    return straightRoute(pos, dest);
  }
}

// ── 회전 안내 문구 ──
const MOD = {
  left: '좌회전', right: '우회전', 'slight left': '왼쪽 길로', 'slight right': '오른쪽 길로',
  'sharp left': '크게 좌회전', 'sharp right': '크게 우회전', uturn: '돌아가기', straight: '직진',
};
export function nextManeuver(route, traveled, total) {
  const st = route.steps.find(s =>
    s.at > traveled + 1 &&
    s.type !== 'depart' &&
    !(s.type === 'arrive' && !s.lastLeg) &&      // 경유지 도착은 건너뜀
    s.modifier !== 'straight'
  );
  if (!st || st.type === 'arrive') return { kind: 'arrive', meters: Math.max(0, total - traveled), text: '목적지' };
  const kind = st.modifier.includes('left') ? 'left' : st.modifier.includes('right') ? 'right' : 'straight';
  return { kind, meters: st.at - traveled, text: MOD[st.modifier] || '직진' };
}

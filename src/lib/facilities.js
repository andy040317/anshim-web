// 안전시설·대피 거점 데이터 불러오기 + 주변 검색
// 데이터: public/data/*.json (scripts/prepare_data.py, prepare_map_layers.py 로 만든 것)
// 실제 서비스에서는 백엔드의 GET /facilities 가 이 역할을 해요.
//
// 종류(type)
//   cctv   CCTV (n = 카메라 대수)        bell   안전비상벨
//   lamp   보안등 (n = 설치 개수)        police 지구대·파출소
//   fire   119안전센터                    store  편의점 (대피 우선순위 '높음'만)
import { distM } from './geo';

const CELL = 0.002; // 격자 한 칸 크기(도). 위도 방향 약 220m
const INDEXED = ['cctv', 'bell', 'lamp', 'police', 'fire', 'store'];
export const FAC_NAME = { cctv: 'CCTV', bell: '안전비상벨', lamp: '보안등', police: '지구대·파출소', fire: '119안전센터', store: '편의점' };
let store = null; // 한 번 불러온 데이터를 저장

const cellKey = (i, j) => i + ':' + j;
const cellOf = v => Math.floor(v / CELL);

// 빠른 주변 검색을 위해 점들을 격자 칸별로 묶어둠
function buildIndex(list) {
  const m = new Map();
  list.forEach(p => {
    if (p.lat === null) return;
    const k = cellKey(cellOf(p.lat), cellOf(p.lng));
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  });
  return m;
}

export async function loadFacilities() {
  if (store) return store;
  const get = (name, required = true) => fetch('/data/' + name + '.json').then(r => {
    if (!r.ok) {
      if (!required) return [];
      throw new Error(name + '.json 을 불러오지 못했어요.');
    }
    return r.json();
  });
  const [cctv, bells, fire, police, stores, lamps] = await Promise.all([
    get('cctv'), get('bells'), get('fire119'), get('police', false), get('stores', false), get('lamps', false),
  ]);
  store = {
    cctv: cctv.map(([lat, lng, n]) => ({ type: 'cctv', lat, lng, n })),
    bell: bells.map(([lat, lng, n]) => ({ type: 'bell', lat, lng, n })),
    lamp: lamps.map(([lat, lng, n]) => ({ type: 'lamp', lat, lng, n })),
    police: police.map(p => ({ type: 'police', ...p, name: p.name })),
    // 예전 fire119.json 에는 좌표가 없어서 null 로 두고, 지도 준비 후 주소 → 좌표 변환 (geocodeFire)
    fire: fire.map(f => ({ type: 'fire', ...f, lat: f.lat ?? null, lng: f.lng ?? null })),
    store: stores.map(([lat, lng, name, brand]) => ({ type: 'store', lat, lng, name, brand })),
  };
  store.index = {};
  INDEXED.forEach(t => { store.index[t] = buildIndex(store[t]); });
  return store;
}

export const facilitiesReady = () => !!store;
export const getStore = () => store;

// 점 p 주변 radius(m) 안의 시설
export function nearby(type, p, radius) {
  if (!store) return [];
  const idx = store.index[type];
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.cos((p.lat * Math.PI) / 180));
  const out = [];
  for (let i = cellOf(p.lat - dLat); i <= cellOf(p.lat + dLat); i++) {
    for (let j = cellOf(p.lng - dLng); j <= cellOf(p.lng + dLng); j++) {
      const arr = idx.get(cellKey(i, j));
      if (arr) arr.forEach(f => { if (distM(p, f) <= radius) out.push(f); });
    }
  }
  return out;
}

// 가장 가까운 시설 하나 (반경 안에서)
export function nearest(type, p, radius = 2000) {
  let best = null, bestD = Infinity;
  nearby(type, p, radius).forEach(f => { const d = distM(p, f); if (d < bestD) { best = f; bestD = d; } });
  return best ? { ...best, d: bestD } : null;
}

// SOS 대피 후보: 편의점·지구대/파출소·119안전센터·비상벨 중 가까운 순서로 count 곳
// 한 종류가 후보를 다 차지하지 않게 종류별로 최대 perType 곳까지만 (예: 비상벨만 3개 나오는 것 방지)
export function shelterCandidates(p, count = 3, radius = 3000, perType = 2) {
  const all = [];
  ['store', 'police', 'fire', 'bell'].forEach(t => {
    nearby(t, p, radius)
      .map(f => ({ ...f, d: distM(p, f) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, perType)
      .forEach(f => all.push(f));
  });
  all.sort((a, b) => a.d - b.d);
  return all.slice(0, count);
}

// 지도 화면 범위 안의 시설
export function inBounds(type, sw, ne) {
  if (!store) return [];
  return store[type].filter(f => f.lat !== null && f.lat >= sw.lat && f.lat <= ne.lat && f.lng >= sw.lng && f.lng <= ne.lng);
}

// 119안전센터 주소 → 좌표 (좌표가 없는 예전 데이터일 때만). 결과는 브라우저에 저장해 다음부터 바로 사용
const CACHE_KEY = 'anshim-fire119-coords';
export async function geocodeFire(kakao) {
  if (!store) return 0;
  const todo = store.fire.filter(f => f.lat === null);
  if (!todo.length) return 0; // prepare_map_layers.py 로 좌표가 이미 들어 있으면 할 일 없음
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { cache = {}; }
  const geocoder = new kakao.maps.services.Geocoder();
  let found = 0;
  for (const f of todo) {
    const addr = f.addr.replace(/\(.*?\)/g, '').trim();
    if (cache[addr]) { f.lat = cache[addr].lat; f.lng = cache[addr].lng; found++; continue; }
    const r = await new Promise(res =>
      geocoder.addressSearch(addr, (result, status) => res(status === kakao.maps.services.Status.OK ? result[0] : null))
    );
    if (r) { f.lat = Number(r.y); f.lng = Number(r.x); cache[addr] = { lat: f.lat, lng: f.lng }; found++; }
  }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* 저장 못 해도 동작에는 문제없음 */ }
  store.index.fire = buildIndex(store.fire);
  return found;
}

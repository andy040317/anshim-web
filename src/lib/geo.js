// 위도·경도 계산 도우미 (거리 단위: m)
// 점은 항상 { lat, lng } 모양을 씀
import { DAEGU_BOUNDS, WALK_MPS } from '../config';

const R = 6371000; // 지구 반지름 (m)
const toRad = d => (d * Math.PI) / 180;

// 두 점 사이 거리
export function distM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// 경로(점 배열) 전체 길이
export function pathLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += distM(pts[i - 1], pts[i]);
  return s;
}

// 경로 위에서 출발점부터 d(m) 간 지점. seg = 지금 지나는 구간 번호
export function pointAlong(pts, d) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = distM(pts[i - 1], pts[i]);
    if (acc + L >= d || i === pts.length - 1) {
      const t = L === 0 ? 0 : Math.min(1, Math.max(0, (d - acc) / L));
      return {
        lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t,
        lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * t,
        seg: i - 1,
      };
    }
    acc += L;
  }
  return { ...pts[0], seg: 0 };
}

// 점 p를 북쪽으로 north m, 동쪽으로 east m 옮긴 점
export function offsetM(p, north, east) {
  return { lat: p.lat + north / 111320, lng: p.lng + east / (111320 * Math.cos(toRad(p.lat))) };
}

// 점과 선분 사이 거리 (가까운 거리라서 평면으로 계산)
function distToSegM(p, a, b) {
  const kx = 111320 * Math.cos(toRad(p.lat)), ky = 111320;
  const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky;
  const bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? -(ax * dx + ay * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + dx * t, ay + dy * t);
}
// 점 p 를 경로 위에 맞추기: 경로에서 가장 가까운 지점까지
//   along = 출발점부터 그 지점까지 경로 거리(m), off = p 와 그 지점 사이 거리(m)
// 실제 GPS 안내에서 '얼마나 왔는지'와 '경로에서 얼마나 벗어났는지'를 계산할 때 사용
export function projectOnPath(pts, p) {
  const kx = 111320 * Math.cos(toRad(p.lat)), ky = 111320;
  let best = { along: 0, off: Infinity }, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky;
    const dx = (b.lng - a.lng) * kx, dy = (b.lat - a.lat) * ky;
    const L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    let t = L2 ? -(ax * dx + ay * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const off = Math.hypot(ax + dx * t, ay + dy * t);
    if (off < best.off) best = { along: acc + L * t, off };
    acc += L;
  }
  return best;
}

// 점과 경로 사이 가장 가까운 거리
export function distToPathM(p, pts) {
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) m = Math.min(m, distToSegM(p, pts[i - 1], pts[i]));
  return m;
}

// 경로를 step(m) 간격의 점들로 나누기
export function samplePath(pts, step) {
  const total = pathLength(pts);
  const out = [];
  for (let d = 0; d <= total; d += step) out.push(pointAlong(pts, d));
  if (!out.length) out.push(pts[0]);
  return out;
}

export function inDaegu(p) {
  const b = DAEGU_BOUNDS;
  return p.lat >= b.latMin && p.lat <= b.latMax && p.lng >= b.lngMin && p.lng <= b.lngMax;
}

// 화면 표시용
export const fmtDist = m => (m >= 1000 ? (m / 1000).toFixed(1) + 'km' : Math.max(10, Math.round(m / 10) * 10) + 'm');
export const walkMin = m => Math.max(1, Math.round(m / WALK_MPS / 60));
export const fmtMin = m => walkMin(m) + '분';
const pad2 = n => String(n).padStart(2, '0');
export function fmtClock(ms, withSec) {
  const d = new Date(ms);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + (withSec ? ':' + pad2(d.getSeconds()) : '');
}
export function makeToken(n) {
  const c = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

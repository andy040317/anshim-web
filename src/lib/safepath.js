// 위험도 반영 길 찾기 (브라우저에서 직접 계산)
// 데이터: public/data/graph/ (scripts/step6_export_graph.py 가 만든 도로망 칸 파일)
// 실제 서비스에서는 FastAPI 백엔드가 같은 계산을 함 (networkx 또는 pgRouting)
//
// 방법
//   1) 출발·도착을 감싸는 범위의 도로망 칸들을 불러옴
//   2) 길마다 비용 = (길이 + 어두운 길 가산) × e^(k × (위험도 − 평균) / 10)
//      → 위험할수록 비용이 크게 늘어서 피해 감. k 가 클수록 위험도를 더 중요하게 봄
//   3) 가장 비용이 적은 길(다익스트라)을 찾고, 최단 거리보다 DETOUR_LIMIT 넘게 길면 k 를 줄여서 다시 찾음
import { GRAPH_DIR, DARK_HOURS, DETOUR_LIMIT, SAFE_DARK_MULT, SAFE_MAX_TILES } from '../config';
import { distM } from './geo';

let metaPromise = null;
const tileCache = new Map(); // 칸 번호 → Promise(칸 데이터)

function loadMeta() {
  if (!metaPromise) {
    metaPromise = fetch(GRAPH_DIR + '/meta.json')
      .then(r => { if (!r.ok) throw new Error('도로망 데이터가 없어요 (scripts/step6_export_graph.py 실행 필요)'); return r.json(); })
      .then(m => ({ ...m, tileSet: new Set(m.tiles) }))
      .catch(e => { metaPromise = null; throw e; });
  }
  return metaPromise;
}

function loadTile(key) {
  if (!tileCache.has(key)) {
    const p = fetch(`${GRAPH_DIR}/g_${key}.json`).then(r => r.json()).catch(() => { tileCache.delete(key); return null; });
    tileCache.set(key, p);
  }
  return tileCache.get(key);
}

// 최소 힙 (다익스트라에서 '지금까지 비용이 가장 작은 교차점'을 빨리 꺼내기 위한 자료구조)
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a; a.push(item);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

// 다익스트라: from → to 까지 비용 합이 가장 작은 길. 결과 = 교차점 id 목록
function dijkstra(adj, from, to, costOf) {
  const dist = new Map([[from, 0]]), prev = new Map(), heap = new MinHeap();
  heap.push([0, from]);
  while (heap.size) {
    const [d, n] = heap.pop();
    if (n === to) break;
    if (d > dist.get(n)) continue; // 이미 더 싼 길로 처리한 교차점
    for (const e of adj.get(n) || []) {
      const c = costOf(e);
      if (c === Infinity) continue;
      const nd = d + c;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, n); heap.push([nd, e.to]); }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return path;
}

// 출발·도착 → 위험도 반영 경로 { pts: [{lat,lng}...], len, k } (못 찾으면 null)
export async function findSafePath(start, dest, hour) {
  const m = await loadMeta();
  const direct = distM(start, dest);
  // 불러올 범위: 출발·도착을 감싸는 사각형 + 여유 (직선거리의 30%, 0.8~4km)
  const padM = Math.min(4000, Math.max(800, direct * 0.3));
  const padLat = padM / 111320, padLng = padM / (111320 * Math.cos((start.lat * Math.PI) / 180));
  const x0 = Math.floor((Math.min(start.lng, dest.lng) - padLng - m.lng0) / m.tileLng);
  const x1 = Math.floor((Math.max(start.lng, dest.lng) + padLng - m.lng0) / m.tileLng);
  const y0 = Math.floor((Math.min(start.lat, dest.lat) - padLat - m.lat0) / m.tileLat);
  const y1 = Math.floor((Math.max(start.lat, dest.lat) + padLat - m.lat0) / m.tileLat);
  const keys = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (m.tileSet.has(x + '_' + y)) keys.push(x + '_' + y);
  if (!keys.length || keys.length > SAFE_MAX_TILES) return null;
  const tiles = (await Promise.all(keys.map(loadTile))).filter(Boolean);

  // 교차점 좌표 + 연결 목록 만들기 (걷는 길은 양방향)
  const pos = new Map(), adj = new Map();
  const link = (a, b, e) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ ...e, to: b }); };
  tiles.forEach(t => {
    Object.entries(t.nodes).forEach(([id, [la, ln]]) => pos.set(id, { lat: la / 1e5, lng: ln / 1e5 }));
    t.edges.forEach(([u, v, len, riskHex, dark, motor]) => {
      const e = { len, risk: parseInt(riskHex.substr(hour * 2, 2), 16), dark, motor };
      link(String(u), String(v), e);
      link(String(v), String(u), e);
    });
  });

  // 출발·도착에서 가장 가까운 교차점 (300m 넘게 떨어져 있으면 포기)
  const nearest = p => {
    let best = null, bd = Infinity;
    pos.forEach((q, id) => { if (!adj.has(id)) return; const d = distM(p, q); if (d < bd) { bd = d; best = id; } });
    return bd <= 300 ? best : null;
  };
  const a = nearest(start), b = nearest(dest);
  if (!a || !b || a === b) return null;

  const lenOf = path => path.slice(1).reduce((s, n, i) => s + distM(pos.get(path[i]), pos.get(n)), 0);
  const shortest = dijkstra(adj, a, b, e => (e.motor ? Infinity : e.len));
  if (!shortest) return null;
  const L0 = lenOf(shortest);

  const dark = DARK_HOURS.includes(hour);
  const base = m.hourMean[hour];
  // k 를 큰 값(위험도 중시)부터 시도 → 우회 한도 안에 드는 첫 경로 사용
  for (const k of [4, 2, 1, 0.5]) {
    const cost = e => {
      if (e.motor) return Infinity; // 자동차전용도로는 걷지 않음
      const len = e.len + (dark ? e.dark * (SAFE_DARK_MULT - 1) : 0); // 밤에는 어두운 길을 더 길게 친 셈
      return len * Math.exp((k * (Math.min(e.risk, 90) - base)) / 10);
    };
    const path = dijkstra(adj, a, b, cost);
    if (path && lenOf(path) <= L0 * (1 + DETOUR_LIMIT)) {
      return { pts: path.map(id => pos.get(id)), len: lenOf(path), k, tiles: keys.length };
    }
  }
  return null;
}

// 카카오맵 부품
// 사용 예:
//   <KakaoMap view={{ type: 'center', p: {lat, lng}, level: 4, key: 1 }}
//             user={내위치} start={출발} dest={도착} routes={[{ pts, color, dotted, width, opacity }]}
//             layers={{ cctv: true, bell: true, lamp: true, fire: true, police: true, store: true }} facVersion={app.facVersion}
//             marks={[{ lat, lng, label: '1', kind: 'store', selected }]} onMarkClick={i => ...}
//             onMapClick={p => ...} follow mapType="roadmap" />
// mapType: 'roadmap'(일반 지도, 기본값) 또는 'hybrid'(위성 사진 + 도로·건물 이름)
// view.key 가 바뀔 때만 지도를 그 위치로 옮김 (사용자가 끌어서 움직인 지도를 함부로 되돌리지 않기 위해)
import { useEffect, useRef, useState } from 'react';
import { loadKakaoMap } from '../lib/loadKakaoMap';
import { inBounds, FAC_NAME } from '../lib/facilities';
import { DAEGU_CENTER, COLORS } from '../config';
import { iconSvg } from './Icon';

const FAC_ICON = { cctv: 'cctv', bell: 'bell', fire: 'fire', police: 'shield', store: 'store' };

// 지도 위에 올릴 HTML 요소 만들기
function el(className, html) {
  const d = document.createElement('div');
  d.className = className;
  if (html) d.innerHTML = html;
  return d;
}

export default function KakaoMap({ view, user, userStale, start, dest, routes = [], layers, facVersion, marks, onMarkClick, onMapClick, follow, label, mapType = 'roadmap' }) {
  const markClickRef = useRef(onMarkClick);
  markClickRef.current = onMarkClick;
  const boxRef = useRef(null);     // 지도가 그려질 div
  const mapRef = useRef(null);     // kakao.maps.Map
  const kakaoRef = useRef(null);
  const lines = useRef([]);        // 경로 선들
  const pins = useRef({});         // 내 위치·출발·도착 표시
  const facOverlays = useRef([]);  // 안전시설 표시
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;   // 항상 최신 함수를 쓰도록
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [idle, setIdle] = useState(0); // 지도 이동이 끝날 때마다 +1 → 시설 다시 그림

  // 1) 지도 만들기 (처음 한 번)
  useEffect(() => {
    let alive = true;
    loadKakaoMap()
      .then(kakao => {
        if (!alive || !boxRef.current) return;
        kakaoRef.current = kakao;
        const map = new kakao.maps.Map(boxRef.current, { center: new kakao.maps.LatLng(DAEGU_CENTER.lat, DAEGU_CENTER.lng), level: 5 });
        mapRef.current = map;
        kakao.maps.event.addListener(map, 'click', e => {
          if (clickRef.current) clickRef.current({ lat: e.latLng.getLat(), lng: e.latLng.getLng() });
        });
        kakao.maps.event.addListener(map, 'idle', () => setIdle(n => n + 1));
        setReady(true);
      })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  // 화면 크기가 바뀌면 지도에 알려줌 (안 하면 지도 일부가 회색으로 남음)
  useEffect(() => {
    if (!ready || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => mapRef.current && mapRef.current.relayout());
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [ready]);

  // 지도 종류 바꾸기: 일반 지도 ↔ 위성(HYBRID)
  // HYBRID = 위성 사진 위에 도로·건물 이름을 같이 보여주는 카카오맵 기본 지도 종류 (추가 키 필요 없음)
  useEffect(() => {
    if (!ready) return;
    const kakao = kakaoRef.current;
    mapRef.current.setMapTypeId(mapType === 'hybrid' ? kakao.maps.MapTypeId.HYBRID : kakao.maps.MapTypeId.ROADMAP);
  }, [ready, mapType]);

  // 2) 보는 위치 옮기기: 'center'(한 점 중심) 또는 'fit'(여러 점이 다 보이게)
  const viewKey = view ? view.key : null;
  useEffect(() => {
    if (!ready || !view) return;
    const kakao = kakaoRef.current, map = mapRef.current;
    const LL = p => new kakao.maps.LatLng(p.lat, p.lng);
    if (view.type === 'center' || (view.pts && view.pts.length === 1)) {
      if (view.level) map.setLevel(view.level);
      map.setCenter(LL(view.p || view.pts[0]));
    } else if (view.type === 'fit' && view.pts && view.pts.length) {
      const b = new kakao.maps.LatLngBounds();
      view.pts.forEach(p => b.extend(LL(p)));
      const pd = view.pad || {};
      map.setBounds(b, pd.top ?? 40, pd.right ?? 40, pd.bottom ?? 40, pd.left ?? 40);
    }
  }, [ready, viewKey]);

  // 3) 경로 선 그리기 (실선은 흰 테두리 선을 아래에 깔아 잘 보이게)
  useEffect(() => {
    if (!ready) return;
    const kakao = kakaoRef.current, map = mapRef.current;
    const specs = [];
    routes.forEach((r, i) => {
      const op = r.opacity ?? 1;
      if (!r.dotted) specs.push({ pts: r.pts, color: COLORS.casing, weight: (r.width || 6) + 4, opacity: op * 0.9, style: 'solid', z: i * 2 + 1 });
      specs.push({ pts: r.pts, color: r.color, weight: r.width || 6, opacity: op, style: r.dotted ? 'shortdot' : 'solid', z: i * 2 + 2 });
    });
    specs.forEach((s, i) => {
      const path = s.pts.map(p => new kakao.maps.LatLng(p.lat, p.lng));
      let line = lines.current[i];
      if (!line) { line = new kakao.maps.Polyline({ map, path }); lines.current[i] = line; }
      line.setPath(path);
      line.setOptions({ strokeWeight: s.weight, strokeColor: s.color, strokeOpacity: s.opacity, strokeStyle: s.style });
      line.setZIndex(s.z);
      line.setMap(map);
    });
    lines.current.splice(specs.length).forEach(l => l.setMap(null)); // 남는 선은 지움
  }, [ready, routes]);

  // 4) 내 위치·출발·도착 표시
  useEffect(() => {
    if (!ready) return;
    const kakao = kakaoRef.current, map = mapRef.current;
    const place = (key, p, make, z, yAnchor) => {
      let o = pins.current[key];
      if (!p) { if (o) o.setMap(null); return null; }
      const pos = new kakao.maps.LatLng(p.lat, p.lng);
      if (!o) {
        o = new kakao.maps.CustomOverlay({ position: pos, content: make(), xAnchor: 0.5, yAnchor, zIndex: z });
        pins.current[key] = o;
      }
      o.setPosition(pos);
      o.setMap(map);
      return o;
    };
    place('start', start, () => el('pin-start'), 6, 0.5);
    place('dest', dest, () => el('pin-dest', '<span class="pin-head">' + iconSvg('flag', 15, '#0B1220') + '</span><span class="pin-stem"></span>'), 7, 1);
    const u = place('user', user, () => el('pin-user', '<span class="pin-halo"></span><span class="pin-dot"></span>'), 8, 0.5);
    if (u) u.getContent().classList.toggle('stale', !!userStale);
  }, [ready, start && start.lat, start && start.lng, dest && dest.lat, dest && dest.lng, user && user.lat, user && user.lng, userStale]);

  // 5) 안내 중: 내 위치가 화면 가장자리로 가면 따라감
  useEffect(() => {
    if (!ready || !follow || !user) return;
    const kakao = kakaoRef.current, map = mapRef.current;
    const b = map.getBounds(), sw = b.getSouthWest(), ne = b.getNorthEast();
    const padLat = (ne.getLat() - sw.getLat()) * 0.28, padLng = (ne.getLng() - sw.getLng()) * 0.2;
    const inside = user.lat > sw.getLat() + padLat && user.lat < ne.getLat() - padLat &&
      user.lng > sw.getLng() + padLng && user.lng < ne.getLng() - padLng;
    if (!inside) map.panTo(new kakao.maps.LatLng(user.lat, user.lng));
  }, [ready, follow, user && user.lat, user && user.lng]);

  // 6) 안전시설 표시: 지금 화면 범위 안의 것만 그림
  //    CCTV는 멀리 볼 때(레벨 5 이상) 칸별로 묶어서 카메라 대수만 보여줌
  const layerKey = layers ? Object.keys(layers).filter(k => layers[k]).join(',') : '';
  useEffect(() => {
    if (!ready) return;
    const kakao = kakaoRef.current, map = mapRef.current;
    facOverlays.current.forEach(o => o.setMap(null));
    facOverlays.current = [];
    if (!layers) return;
    const b = map.getBounds();
    const sw = { lat: b.getSouthWest().getLat(), lng: b.getSouthWest().getLng() };
    const ne = { lat: b.getNorthEast().getLat(), lng: b.getNorthEast().getLng() };
    const level = map.getLevel();
    const add = (p, node, z) => {
      const o = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(p.lat, p.lng), content: node, xAnchor: 0.5, yAnchor: 0.5, zIndex: z });
      o.setMap(map);
      facOverlays.current.push(o);
    };
    // 종류별 그리는 규칙 (아래쪽에 그릴 것부터)
    //   cluster: 이 지도 레벨 이상(멀리 볼 때)에는 칸별로 묶어 숫자로 표시
    //   cap: 한 화면에 이보다 많으면 개별 표시 생략 (확대하면 보임)
    const RULES = [
      { type: 'lamp', cluster: 4, cap: 1500, z: 1, unit: '개' },
      { type: 'cctv', cluster: 5, cap: 800, z: 2, unit: '대' },
      { type: 'bell', cap: 800, z: 3 },
      { type: 'store', cap: 400, z: 4 },
      { type: 'police', cap: 500, z: 5 },
      { type: 'fire', cap: 500, z: 5 },
    ];
    RULES.forEach(({ type, cluster, cap, z, unit }) => {
      if (!layers[type]) return;
      const list = inBounds(type, sw, ne);
      if (cluster && level >= cluster) {
        const size = 0.0025 * Math.pow(2, level - 5); // 칸 크기: 멀리 볼수록 크게
        const cells = new Map();
        list.forEach(f => {
          const k = Math.floor(f.lat / size) + ':' + Math.floor(f.lng / size);
          const c = cells.get(k) || { n: 0, lat: 0, lng: 0, k: 0 };
          c.n += f.n; c.lat += f.lat; c.lng += f.lng; c.k += 1;
          cells.set(k, c);
        });
        cells.forEach(c => {
          const node = el('fac-cluster cl-' + type);
          node.textContent = c.n >= 1000 ? (c.n / 1000).toFixed(1) + 'k' : String(c.n);
          const s = Math.round(Math.min(type === 'lamp' ? 36 : 46, (type === 'lamp' ? 16 : 22) + Math.log2(c.n + 1) * 3));
          node.style.width = s + 'px';
          node.style.height = s + 'px';
          node.title = FAC_NAME[type] + ' ' + c.n + unit;
          add({ lat: c.lat / c.k, lng: c.lng / c.k }, node, z);
        });
        return;
      }
      if (list.length > cap) return;
      list.forEach(f => {
        // 보안등은 다른 표시를 가리지 않게 작은 점으로만
        const node = type === 'lamp' ? el('fac-lamp') : el('fac-dot fac-' + type, iconSvg(FAC_ICON[type], 11, '#FFFFFF'));
        node.title = f.name || (type === 'cctv' ? 'CCTV ' + f.n + '대' : FAC_NAME[type]);
        add(f, node, z);
      });
    });
  }, [ready, idle, layerKey, facVersion]);

  // 7) 번호 표시 (SOS 대피 후보 등): marks = [{ lat, lng, label, kind, selected }]
  const markOverlays = useRef([]);
  const marksKey = marks ? marks.map(m => m.lat + ',' + m.lng + (m.selected ? '*' : '')).join('|') : '';
  useEffect(() => {
    if (!ready) return;
    const kakao = kakaoRef.current, map = mapRef.current;
    markOverlays.current.forEach(o => o.setMap(null));
    markOverlays.current = [];
    (marks || []).forEach((m, i) => {
      const node = el('mark-pin mk-' + (m.kind || 'store') + (m.selected ? ' sel' : ''));
      node.textContent = m.label || String(i + 1);
      node.title = m.title || '';
      node.addEventListener('click', e => { e.stopPropagation(); if (markClickRef.current) markClickRef.current(i); });
      const o = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(m.lat, m.lng), content: node, xAnchor: 0.5, yAnchor: 1, zIndex: m.selected ? 12 : 10, clickable: true });
      o.setMap(map);
      markOverlays.current.push(o);
    });
  }, [ready, marksKey]);

  return (
    <div className="kmap" role="region" aria-label={label || '지도'}>
      <div ref={boxRef} className="kmap-box" />
      {!ready && !error && <div className="map-fallback"><span className="spinner" aria-hidden="true" />지도를 불러오는 중…</div>}
      {error && (
        <div className="map-fallback err" role="alert">
          <b>지도를 표시할 수 없어요</b>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

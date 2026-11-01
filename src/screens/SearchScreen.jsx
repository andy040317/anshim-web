// 장소 검색 (UC-02 / FR-03): 카카오 장소검색으로 대구 안의 장소 찾기
import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import Icon from '../components/Icon';
import { loadKakaoMap } from '../lib/loadKakaoMap';
import { inDaegu } from '../lib/geo';
import { DAEGU_BOUNDS, NIGHT_HOURS } from '../config';
import { timeInfo } from '../lib/risk';

// 카카오 키워드 검색 → [{ id, name, addr, lat, lng, cat }]
function searchPlaces(word) {
  return loadKakaoMap().then(kakao => new Promise((resolve, reject) => {
    const ps = new kakao.maps.services.Places();
    const daegu = new kakao.maps.LatLngBounds(
      new kakao.maps.LatLng(DAEGU_BOUNDS.latMin, DAEGU_BOUNDS.lngMin),
      new kakao.maps.LatLng(DAEGU_BOUNDS.latMax, DAEGU_BOUNDS.lngMax)
    );
    ps.keywordSearch(word, (data, status) => {
      const S = kakao.maps.services.Status;
      if (status === S.OK) {
        resolve(data
          .map(d => ({ id: d.id, name: d.place_name, addr: d.road_address_name || d.address_name, lat: Number(d.y), lng: Number(d.x), cat: d.category_group_name }))
          .filter(inDaegu)); // 대구 밖 결과는 제외
      } else if (status === S.ZERO_RESULT) resolve([]);
      else reject({ message: '장소 검색 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.' });
    }, { bounds: daegu, size: 15 });
  }));
}

export default function SearchScreen() {
  const app = useApp();
  const mode = app.searchMode; // 'dest' 또는 'start'
  const [q, setQ] = useState('');
  // 출발 시각: 기본은 시연 시계의 지금 시각. 바꾸면 그 시각 위험도로 경로를 비교함
  const nowHour = new Date(app.clock()).getHours();
  const [hour, setHour] = useState(nowHour);
  const info = timeInfo(hour);
  const [res, setRes] = useState({ status: 'idle', list: [] });

  // 입력을 멈추고 0.3초 뒤 검색
  useEffect(() => {
    const word = q.trim();
    if (!word) { setRes({ status: 'idle', list: [] }); return; }
    setRes(r => ({ ...r, status: 'loading' }));
    let alive = true;
    const t = setTimeout(() => {
      app.call('EXT', '카카오 장소검색', () => searchPlaces(word), { delay: 0, note: '‘' + word + '’' })
        .then(list => { if (alive) setRes({ status: 'done', list }); })
        .catch(e => { if (alive) setRes({ status: 'error', list: [], error: e }); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const pick = p => {
    if (mode === 'start') { app.setStartPick(p); app.go('main'); app.showToast('출발지를 정했어요.'); return; }
    if (!app.routeStart()) { app.setDestPick(p); app.go('main'); app.showToast('목적지를 정했어요. 출발지도 정해 주세요.'); return; }
    app.requestRoutes(p, { hour });
  };
  const useMyPos = () => { app.setStartPick(null); app.go('main'); };

  const word = q.trim();
  return (
    <div className="screen">
      <div className="search-top">
        <button className="icon-btn" aria-label="뒤로 가기" onClick={() => app.go('main')}><Icon name="back" size={22} /></button>
        <label htmlFor="search-q" className="sr-only">{mode === 'start' ? '출발지 검색' : '목적지 검색'}</label>
        <input id="search-q" className="input" autoFocus value={q} onChange={e => setQ(e.target.value)}
          placeholder={mode === 'start' ? '출발지 이름이나 주소 (대구)' : '목적지 이름이나 주소 (대구)'} />
      </div>
      <div className="scroll">
        {mode === 'dest' && (
          <div className="depart">
            <label htmlFor="depart-hour" className="small muted">출발 시각</label>
            <select id="depart-hour" className="input" value={hour} onChange={e => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{h}시{h === nowHour ? ' (지금)' : ''}{NIGHT_HOURS.includes(h) ? ' · 심야' : ''}</option>
              ))}
            </select>
            <p className="small muted">{info.desc}</p>
          </div>
        )}
        {mode === 'start' && app.consent !== false && app.myPos && (
          <button className="place" onClick={useMyPos}>
            <span className="pic"><Icon name="locate" size={18} /></span>
            <span><b>현재 위치</b><small>{app.myPos.source === 'gps' ? 'GPS로 받은 위치' : '시연 위치 (대구 중구)'}</small></span>
          </button>
        )}

        {!word && (
          <>
            <p className="list-head">최근 목적지</p>
            {app.recent.length ? app.recent.map(p => (
              <button key={p.name + p.lat} className="place" onClick={() => pick(p)}>
                <span className="pic"><Icon name="clock" size={18} /></span>
                <span><b>{p.name}</b><small>{p.addr}</small></span>
              </button>
            )) : <p className="small muted" style={{ padding: '0 var(--gr) 0 var(--gl)' }}>아직 없어요. 장소를 검색하거나 지도를 눌러 골라 보세요.</p>}
            <button className="place" onClick={() => { app.go('main'); app.showToast('지도에서 원하는 위치를 눌러 주세요.'); }}>
              <span className="pic"><Icon name="map" size={18} /></span>
              <span><b>지도에서 직접 고르기</b><small>대구 안 아무 곳이나 눌러서 정해요</small></span>
            </button>
          </>
        )}

        {word && <p className="list-head">검색 결과</p>}
        {word && res.status === 'loading' && <div className="state-msg"><span className="spinner" aria-hidden="true" /><span>검색하는 중…</span></div>}
        {word && res.status === 'error' && <div className="state-msg"><Icon name="alert" size={28} /><b>검색하지 못했어요</b><span>{res.error.message}</span></div>}
        {word && res.status === 'done' && !res.list.length && (
          <div className="state-msg"><Icon name="search" size={28} /><b>대구 안에서 ‘{word}’ 검색 결과가 없어요</b><span>이름을 다시 확인하거나 지도에서 직접 골라 주세요.</span></div>
        )}
        {word && res.status === 'done' && res.list.map(p => (
          <button key={p.id} className="place" onClick={() => pick(p)}>
            <span className="pic"><Icon name="pin" size={18} /></span>
            <span><b>{p.name}</b><small>{p.addr}{p.cat ? ' · ' + p.cat : ''}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}

// 메인 지도 (UIR-US-01): 내 위치, 출발·도착 고르기, 안전시설 표시, SOS
import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { TabBar, TimePill } from '../components/ui';
import Icon from '../components/Icon';
import KakaoMap from '../components/KakaoMap';
import { nearby, nearest } from '../lib/facilities';
import { fmtDist } from '../lib/geo';
import { DAEGU_CENTER } from '../config';

// 지도 레이어 버튼 (유흥주점은 지도에 표시하지 않음: 위험도 계산과 경로 카드 근거에만 사용)
const LAYER_LABEL = { cctv: 'CCTV', bell: '비상벨', lamp: '보안등', police: '지구대·파출소', fire: '119안전센터', store: '편의점' };

export default function MainScreen() {
  const app = useApp();
  const denied = app.consent === false;
  const start = app.routeStart();           // 고른 출발지 또는 내 위치
  const dest = app.destPick;
  const [view, setView] = useState(null);

  // 출발·도착이 바뀌면 지도를 그에 맞춰 옮김
  useEffect(() => {
    const pts = [start, dest].filter(Boolean);
    if (pts.length === 2) setView({ type: 'fit', pts, pad: { top: 300, bottom: 230, left: 50, right: 50 }, key: 'fit' + pts.map(p => p.lat + ',' + p.lng).join('|') });
    else if (pts.length === 1) setView({ type: 'center', p: pts[0], level: 4, key: 'c' + pts[0].lat + ',' + pts[0].lng });
    else setView({ type: 'center', p: DAEGU_CENTER, level: 8, key: 'daegu' });
  }, [start && start.lat, start && start.lng, dest && dest.lat, dest && dest.lng]);

  // 출발 지점 반경 300m 안의 시설
  let near = null;
  if (start && app.facVersion) {
    const cctv = nearby('cctv', start, 300);
    near = {
      spots: cctv.length, cameras: cctv.reduce((s, f) => s + f.n, 0),
      lamps: nearby('lamp', start, 300).reduce((s, f) => s + f.n, 0),
      store: nearest('store', start, 3000),
      police: nearest('police', start, 8000),
    };
  }

  const goSearch = mode => { app.setSearchMode(mode); app.go('search'); };
  const startText = app.startPick ? app.startPick.name
    : denied ? '출발지를 정하세요'
    : app.myPos ? (app.myPos.source === 'gps' ? '현재 위치' : '현재 위치 (시연 위치)') : '위치 확인 중…';
  const myCenter = () => {
    const p = app.myPos || app.startPick;
    if (!p) { app.showToast('위치 동의를 하지 않아 현재 위치를 알 수 없어요.'); return; }
    setView({ type: 'center', p, level: 4, key: 'me' + Date.now() });
  };

  return (
    <div className="screen">
      <div className="map-area">
        <KakaoMap view={view} user={denied ? null : app.myPos} userStale={app.demo.gpsLost} start={app.startPick} dest={dest}
          layers={app.layers} facVersion={app.facVersion} onMapClick={app.openPick} label="대구 안전시설 지도" />

        <div className="float-top">
          <div className="search-card">
            <div className="sc-line">
              <button className="sc-row" onClick={() => goSearch('start')}>
                <span className="sc-dot" /><span className="sc-label">출발</span>
                <span className={'grow' + (app.startPick || !denied ? '' : ' sc-placeholder')}>{startText}</span>
                {app.demo.gpsLost && !app.startPick && !denied && <span className="chip chip-amber">GPS 약함</span>}
              </button>
              {app.startPick && !denied && <button className="icon-btn" aria-label="출발지를 현재 위치로 되돌리기" onClick={() => app.setStartPick(null)}><Icon name="close" size={18} /></button>}
            </div>
            <div className="sc-line">
              <button className="sc-row" onClick={() => goSearch('dest')}>
                <span className="sc-dot dest" /><span className="sc-label">도착</span>
                <span className={'grow' + (dest ? '' : ' sc-placeholder')}>{dest ? dest.name : '목적지를 검색하세요'}</span>
                {!dest && <Icon name="search" size={18} />}
              </button>
              {dest && <button className="icon-btn" aria-label="목적지 지우기" onClick={() => app.setDestPick(null)}><Icon name="close" size={18} /></button>}
            </div>
            {start && dest ? (
              <button className="btn btn-primary" style={{ margin: '8px 0' }} onClick={() => app.requestRoutes(dest)}>경로 비교하기</button>
            ) : (
              <p className="sc-hint"><Icon name="pin" size={14} />지도를 눌러도 출발지·도착지를 고를 수 있어요.</p>
            )}
          </div>
          <div className="layer-row" role="group" aria-label="지도에 표시할 시설">
            {Object.keys(LAYER_LABEL).map(k => (
              <button key={k} className="lchip" aria-pressed={app.layers[k] ? 'true' : 'false'} onClick={() => app.setLayers(l => ({ ...l, [k]: !l[k] }))}>
                <span className={'ldot mk-bg-' + k} />{LAYER_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="map-bottom">
          <div className="fab-row">
            <button className="fab" aria-label="내 위치로 이동" onClick={myCenter}><Icon name="locate" size={22} /></button>
            <button className="sos-btn" aria-label="SOS 긴급 도움 요청" onClick={app.startSos}>SOS</button>
          </div>
          <section className="nearby" aria-label="주변 안전시설">
            <div className="nearby-head">
              <h2>{start ? '출발 지점 주변 300m' : '주변 안전시설'}</h2>
              <TimePill night={app.demo.night} />
            </div>
            {!app.facVersion ? <p className="small muted">안전시설 데이터를 불러오는 중이에요…</p>
              : near ? (
                <div className="stat-grid four">
                  <div className="stat"><span><span className="ldot mk-bg-cctv" />CCTV</span><b>{near.spots}곳</b><small>{near.cameras}대</small></div>
                  <div className="stat"><span><span className="ldot mk-bg-lamp" />보안등</span><b>{near.lamps}개</b><small>300m 안</small></div>
                  <div className="stat"><span><span className="ldot mk-bg-store" />편의점</span><b>{near.store ? fmtDist(near.store.d) : '-'}</b><small>가장 가까운</small></div>
                  <div className="stat"><span><span className="ldot mk-bg-police" />지구대</span><b>{near.police ? fmtDist(near.police.d) : '-'}</b><small>{near.police ? near.police.name : '정보 없음'}</small></div>
                </div>
              ) : <p className="small muted">출발지를 정하면 주변 시설 개수를 보여드려요.</p>}
          </section>
        </div>
      </div>
      <TabBar current="main" />
    </div>
  );
}

// 메인 지도 (UIR-US-01): 내 위치, 출발·도착 고르기, 안전시설 표시, SOS
// 화면 구성 원칙: 지도 위 요소는 최소로. 시설 표시 설정은 아래 시트(DragSheet)에 넣고, 끌어 올려야 보이게 함
// (출발지 주변 시설 통계는 넣지 않음: 안전장소는 가는 길 위에서만 의미가 있음)
import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { TabBar, TimePill, DragSheet } from '../components/ui';
import Icon from '../components/Icon';
import KakaoMap from '../components/KakaoMap';
import { DAEGU_CENTER } from '../config';

// 지도 레이어 버튼 (유흥주점은 지도에 표시하지 않음: 위험도 계산과 경로 카드 근거에만 사용)
const LAYER_LABEL = { cctv: 'CCTV', bell: '비상벨', lamp: '보안등', police: '지구대·파출소', fire: '119안전센터', store: '편의점' };

export default function MainScreen() {
  const app = useApp();
  const denied = app.consent === false;
  const start = app.routeStart();           // 고른 출발지 또는 내 위치
  const dest = app.destPick;
  const [view, setView] = useState(null);
  const satellite = app.mapType === 'hybrid'; // 지도 종류는 앱 전체가 같이 씀 (App.jsx의 mapType)

  // 출발·도착이 바뀌면 지도를 그에 맞춰 옮김
  useEffect(() => {
    const pts = [start, dest].filter(Boolean);
    if (pts.length === 2) setView({ type: 'fit', pts, pad: { top: 150, bottom: 230, left: 50, right: 50 } /* top: 위 검색창 높이만큼 비움 */, key: 'fit' + pts.map(p => p.lat + ',' + p.lng).join('|') });
    else if (pts.length === 1) setView({ type: 'center', p: pts[0], level: 4, key: 'c' + pts[0].lat + ',' + pts[0].lng });
    else setView({ type: 'center', p: DAEGU_CENTER, level: 8, key: 'daegu' });
  }, [start && start.lat, start && start.lng, dest && dest.lat, dest && dest.lng]);

  // 지금 지도에 켜 둔 시설 종류 수 (시트 윗줄에 표시)
  const layerKeys = Object.keys(LAYER_LABEL);
  const layersOn = layerKeys.filter(k => app.layers[k]).length;

  // 검색창 모양: 출발이 '현재 위치'이고 목적지를 아직 안 골랐으면 한 줄, 아니면 출발·도착 두 줄
  // (위치 동의를 안 했으면 현재 위치가 없어서 출발 줄이 필요하므로 두 줄)
  const searchOneLine = !dest && !app.startPick && !denied;

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
          layers={app.layers} facVersion={app.facVersion} onMapClick={app.openPick} label="대구 안전시설 지도"
          mapType={app.mapType} />

        <div className="float-top">
          {searchOneLine ? (
            // 한 줄 검색창: 출발은 현재 위치라서 목적지만 고르면 됨. 오른쪽 칩을 누르면 출발지를 바꿀 수 있음
            <div className="search-pill">
              <button className="sp-main" onClick={() => goSearch('dest')}>
                <Icon name="search" size={20} />
                <span className="grow">목적지를 검색하세요</span>
              </button>
              {app.demo.gpsLost && <span className="chip chip-amber">GPS 약함</span>}
              <button className="sp-start" aria-label="출발지 바꾸기 (지금은 현재 위치)" onClick={() => goSearch('start')}>
                <span className="sc-dot" />현재 위치
              </button>
            </div>
          ) : (
            // 출발·도착 두 줄 + (둘 다 정해지면) 오른쪽 경로 버튼
            <div className="search-row">
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
              </div>
              {start && dest && (
                <button className="route-go" aria-label="경로 비교하기" onClick={() => app.requestRoutes(dest)}>
                  <Icon name="right" size={22} /><span>경로</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 아래 시트: 평소엔 윗줄만 보이고, 끌어 올리거나 윗줄을 누르면 시설 표시 버튼이 나옴 */}
        <DragSheet label="지도 표시 설정"
          above={
            // 시트 위에 붙어서 시트와 같이 움직이는 버튼 줄
            <div className="fab-row">
              <div className="fab-col">
                {/* 일반/위성 전환 버튼: 버튼 글자는 '누르면 바뀔 지도'를 보여줌 */}
                <button className="fab fab-type" aria-label={satellite ? '일반 지도로 보기' : '위성 지도로 보기'} aria-pressed={satellite ? 'true' : 'false'}
                  onClick={() => app.setMapType(satellite ? 'roadmap' : 'hybrid')}>
                  <Icon name={satellite ? 'map' : 'layers'} size={18} /><span>{satellite ? '일반' : '위성'}</span>
                </button>
                <button className="fab" aria-label="내 위치로 이동" onClick={myCenter}><Icon name="locate" size={22} /></button>
              </div>
              <button className="sos-btn" aria-label="SOS 긴급 도움 요청" onClick={app.startSos}>SOS</button>
            </div>
          }
          peek={
            // 접혀 있을 때 보이는 한 줄
            <div className="ms-peek">
              <div>
                <h2>안전시설 표시</h2>
                <small>{app.facVersion ? `${layerKeys.length}종 중 ${layersOn}종 표시 · 올려서 고르기` : '안전시설 데이터를 불러오는 중이에요…'}</small>
              </div>
              <TimePill night={app.demo.night} />
            </div>
          }>
          {/* 펼쳤을 때 보이는 내용: 시설 종류별 켜기/끄기 */}
          <div className="layer-wrap" role="group" aria-label="지도에 표시할 시설">
            {layerKeys.map(k => (
              <button key={k} className="lchip" aria-pressed={app.layers[k] ? 'true' : 'false'} onClick={() => app.setLayers(l => ({ ...l, [k]: !l[k] }))}>
                <span className={'ldot mk-bg-' + k} />{LAYER_LABEL[k]}
              </button>
            ))}
          </div>
        </DragSheet>
      </div>
      <TabBar current="main" />
    </div>
  );
}

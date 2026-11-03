// 안내 중 (FR-07·08): 회전 안내, 남은 거리, 이탈 알림·재탐색, 위치공유 상태, SOS
// 위치는 두 가지 방식 (App.jsx)
//   실제 위치(gps): 폰의 실시간 위치(watchPosition)를 경로 위에 맞춰서 진행
//   시연 자동 이동(sim): 위치가 경로를 따라 자동으로 움직임 (PC 발표용)
import { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import Icon from '../components/Icon';
import KakaoMap from '../components/KakaoMap';
import { TopBar } from '../components/ui';
import { pointAlong, distM, distToPathM, fmtDist, fmtMin, fmtClock } from '../lib/geo';
import { nextManeuver } from '../lib/router';
import { nearby } from '../lib/facilities';
import { COLORS, SOS_CANCEL_SEC, WALK_MPS } from '../config';

// 앞으로 갈 경로 근처의 가장 가까운 CCTV·비상벨
function nextFacility(ahead, pos) {
  let best = null;
  ['cctv', 'bell'].forEach(type => nearby(type, pos, 200).forEach(f => {
    const d = distM(pos, f);
    if (d < 15 || distToPathM(f, ahead) > 25) return;
    if (!best || d < best.d) best = { type, d };
  }));
  return best;
}

export default function GuideScreen() {
  const app = useApp();
  const g = app.guide;
  const [busy, setBusy] = useState(false);
  const view = useMemo(() => (g ? { type: 'fit', pts: g.route.pts.filter((_, i) => i % 3 === 0).concat([g.route.pts[g.route.pts.length - 1]]), pad: { top: 240, bottom: 250, left: 40, right: 40 }, key: 'guide-' + g.key } : null), [g && g.key]);

  if (!g) return (
    <div className="screen">
      <TopBar title="안내" onBack={() => app.go('main')} />
      <div className="state-msg"><b>진행 중인 안내가 없어요</b><button className="btn btn-primary btn-sm" onClick={() => app.go('main')}>지도로 가기</button></div>
    </div>
  );

  const pts = g.route.pts;
  const p = pointAlong(pts, g.d);
  const onRoute = { lat: p.lat, lng: p.lng };
  const pos = g.deviated ? g.devPos : onRoute;
  const remain = Math.max(0, g.total - g.d);
  const turn = nextManeuver(g.route, g.d, g.total);
  const passed = [...pts.slice(0, p.seg + 1), onRoute];
  const ahead = [onRoute, ...pts.slice(p.seg + 1)];
  const routes = [
    { pts: passed, color: COLORS.passed, width: 6, opacity: 0.8 },
    { pts: ahead, color: COLORS.safe, width: 6 },
  ];
  if (g.deviated) routes.push({ pts: [pos, onRoute], color: COLORS.deviate, dotted: true, width: 5 });
  const s = app.share && app.share.status === 'active' ? app.share : null;
  const names = s ? app.guardians.filter(x => s.guardianIds.includes(x.id)).map(x => x.name).join(', ') : '';
  const fac = g.deviated ? null : nextFacility(ahead, pos);
  const doReroute = () => { setBusy(true); app.reroute().catch(e => app.showToast(e.message)).finally(() => setBusy(false)); };
  const turnText = turn.kind === 'arrive' ? fmtDist(turn.meters) + ' 앞 목적지' : fmtDist(turn.meters) + ' 앞 ' + turn.text;
  const turnIcon = g.deviated ? 'alert' : turn.kind === 'arrive' ? 'flag' : turn.kind;

  // 실제 위치 모드: 위치 수신 상태 (15초 넘게 새 위치가 없으면 '신호 약함')
  const gps = g.mode === 'gps';
  const gi = app.gpsInfo;
  const waiting = gps && !gi.lastFixAt && !gi.error;
  const weak = gps && !!gi.lastFixAt && Date.now() - gi.lastFixAt > 15000;
  const userStale = gps ? weak || !!gi.error : app.demo.gpsLost;

  return (
    <div className="screen">
      <div className="map-area">
        <KakaoMap view={view} routes={routes} user={pos} userStale={userStale} dest={g.dest}
          layers={{ cctv: true, bell: true }} facVersion={app.facVersion} follow mapType={app.mapType} label="안내 중인 경로 지도" />
        <div className="float-top">
          <section className="turn-card card" aria-live="polite">
            <div className="turn-top">
              <span className="turn-ic"><Icon name={turnIcon} size={28} /></span>
              <div className="turn-text">
                <b>{g.deviated ? '경로를 벗어났어요' : turnText}</b>
                <span>{g.routeName}로 안내 중 · {g.dest.name}</span>
              </div>
            </div>
            <div className="turn-stats">
              <div><span>남은 거리</span><b>{fmtDist(remain)}</b></div>
              <div><span>남은 시간</span><b>{fmtMin(remain)}</b></div>
              <div><span>도착 예정</span><b>{fmtClock(app.clock() + (remain / WALK_MPS) * 1000)}</b></div>
            </div>
            {g.route.engine === 'straight' && <p className="small muted" style={{ marginTop: 8 }}>경로 서버 없이 목적지 방향(직선)으로 안내하고 있어요.</p>}
            <div className="guide-mode">
              {gps
                ? <span className="chip chip-good"><Icon name="pin" size={12} />실제 위치로 안내{gi.acc ? ' · 오차 약 ' + gi.acc + 'm' : ''}</span>
                : <span className="chip chip-muted"><Icon name="map" size={12} />시연 자동 이동</span>}
            </div>
          </section>
          {gps && gi.error && (
            <div className="banner banner-amber" role="alert">
              <Icon name="signal" size={22} />
              <div className="grow"><b>실제 위치를 받지 못하고 있어요</b><small>{gi.error}</small></div>
              <button className="btn btn-amber btn-sm" onClick={() => app.setGuideMode('sim')}>시연 이동</button>
            </div>
          )}
          {waiting && (
            <div className="banner banner-amber" role="status">
              <Icon name="signal" size={22} />
              <div className="grow"><b>실제 위치를 받는 중이에요</b><small>처음 위치를 잡는 데 몇 초 걸릴 수 있어요.</small></div>
            </div>
          )}
          {weak && !gi.error && (
            <div className="banner banner-amber" role="status">
              <Icon name="signal" size={22} />
              <div className="grow"><b>위치 신호가 약해요</b><small>마지막 위치({fmtClock(gi.lastFixAt, true)} 확인)를 표시하고 있어요.</small></div>
            </div>
          )}
          {!gps && app.demo.gpsLost && (
            <div className="banner banner-amber" role="status">
              <Icon name="signal" size={22} />
              <div className="grow"><b>GPS 신호를 받지 못하고 있어요</b><small>마지막 위치({fmtClock(app.demo.gpsLostAt || app.clock(), true)} 확인)를 표시하고 있어요.</small></div>
            </div>
          )}
          {g.deviated && (
            <div className="banner banner-amber" role="alert">
              <Icon name="alert" size={22} />
              <div className="grow"><b>경로에서 30m 이상 벗어났어요</b><small>알림을 못 쓰는 기기에서는 화면 안에서 알려요.</small></div>
              <button className="btn btn-amber btn-sm" disabled={busy} onClick={doReroute}>{busy ? '찾는 중…' : '재탐색'}</button>
            </div>
          )}
        </div>
        <div className="map-bottom">
          {fac && <span className="next-fac" style={{ marginLeft: 'var(--gl)' }}><span className={'ldot mk-bg-' + fac.type} />다음 {fac.type === 'cctv' ? 'CCTV' : '비상벨'} 약 {fmtDist(fac.d)}</span>}
          <section className="guide-bottom" aria-label="위치공유와 긴급 버튼">
            {s ? (
              <div className="share-row">
                <span className={'share-ic' + (s.type === 'sos' ? ' sos' : '')}><Icon name="users" size={18} /></span>
                <div className="grow"><b>{names || '보호자'}에게 {s.type === 'sos' ? '긴급 ' : ''}위치 공유 중</b><small>도착하면 자동 종료 · 링크 만료 {fmtClock(s.expiresAt)}</small></div>
                <button className="btn btn-ghost btn-sm" onClick={() => app.endShare('user')}>공유 종료</button>
              </div>
            ) : (
              <button className="share-row" onClick={() => app.setSheet('share')}>
                <span className="share-ic"><Icon name="link" size={18} /></span>
                <div className="grow"><b>보호자에게 위치 공유하기</b><small>{app.share ? (app.share.status === 'expired' ? '이전 링크는 만료되었어요' : '이전 공유는 종료되었어요') : '링크를 만들어 문자로 보낼 수 있어요'}</small></div>
                <Icon name="plus" size={18} />
              </button>
            )}
            <div className="guide-actions">
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={app.endGuide}>안내 종료</button>
              <button className="btn btn-sos" aria-label="SOS 긴급 도움 요청" onClick={app.startSos}><b>SOS</b><small>{SOS_CANCEL_SEC}초 안에 취소할 수 있어요</small></button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

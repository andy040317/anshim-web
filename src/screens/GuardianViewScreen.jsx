// 보호자 조회 화면 (UIR-GR-01 / FR-11): 보호자가 문자로 받은 링크를 열었을 때 (로그인 없음)
// 정상 / 수신 지연 / 만료·종료(차단) 상태를 구분해서 보여줌
import { useEffect, useMemo } from 'react';
import { useApp } from '../AppContext';
import Icon from '../components/Icon';
import KakaoMap from '../components/KakaoMap';
import { pointAlong, fmtClock, fmtDist } from '../lib/geo';
import { COLORS, WALK_MPS } from '../config';

export default function GuardianViewScreen() {
  const app = useApp();
  const s = app.share;
  const active = !!s && s.status === 'active';
  const name = app.me ? app.me.name : '사용자';
  const g = app.guide;
  const pos = active ? s.last.pos : null;
  const view = useMemo(() => {
    const pts = [pos, g && !g.arrived ? g.dest : null].filter(Boolean);
    return pts.length ? { type: pts.length > 1 ? 'fit' : 'center', pts, p: pts[0], level: 4, pad: { top: 40, bottom: 260, left: 40, right: 40 }, key: 'gv' } : null;
  }, [active]);

  // 보호자 화면은 5초마다 서버에 최신 위치를 물어봄
  useEffect(() => {
    app.call('GET', '/shares/{token}', () => true, { delay: 150, note: active ? '보호자 화면 열기' : '닫힌 링크 → 차단' }).catch(() => {});
    if (!active) return;
    const t = setInterval(() => app.call('GET', '/shares/{token}', () => true, { delay: 150, note: '보호자 화면 갱신 (5초 주기)' }).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [active]);

  const banner = (
    <div className="gv-banner">
      <span>보호자 시점 · 문자로 받은 링크를 연 화면</span>
      <button onClick={() => app.setViewAs('user')}>사용자 화면으로</button>
    </div>
  );

  if (!active) {
    const why = !s ? '유효하지 않은 링크예요. 주소를 다시 확인해 주세요.'
      : s.status === 'expired' ? '공유 시간이 지나서 더 이상 위치를 볼 수 없어요.'
      : s.reason === 'arrived' ? name + '님이 목적지에 도착해서 공유가 끝났어요.'
      : s.reason === 'sos' ? '긴급 상황이 종료되어 공유가 끝났어요.'
      : name + '님이 위치공유를 종료했어요.';
    return (
      <div className="screen">
        {banner}
        <div className="state-msg" style={{ flex: 1, justifyContent: 'center' }}>
          <span className="big-ic amber"><Icon name="lock" size={26} /></span>
          <b>{s && s.status === 'expired' ? '만료된 링크예요' : '닫힌 링크예요'}</b>
          <span>{why}</span>
        </div>
      </div>
    );
  }

  const now = app.clock();
  const lagSec = Math.max(0, Math.round((now - s.last.at) / 1000));
  const delayed = lagSec > 12; // 5초 주기인데 12초 넘게 소식이 없으면 지연
  let ahead = null, remain = null;
  if (g && !g.arrived) {
    const p = pointAlong(g.route.pts, g.d);
    ahead = [{ lat: p.lat, lng: p.lng }, ...g.route.pts.slice(p.seg + 1)];
    remain = g.total - g.d;
  }

  return (
    <div className="screen">
      {banner}
      <div className="gv-head">
        <div><h1>{name}님의 위치</h1><p>{g && !g.arrived ? g.dest.name + '(으)로 이동 중' : '현재 위치'}</p></div>
        {s.type === 'sos' ? <span className="chip chip-danger">긴급 SOS</span> : <span className="chip chip-accent">귀가 중</span>}
      </div>
      <div className="map-area">
        <KakaoMap view={view} routes={ahead ? [{ pts: ahead, color: COLORS.safe, width: 6, opacity: 0.85 }] : []}
          user={pos} userStale={delayed} dest={g && !g.arrived ? g.dest : null} layers={{ cctv: true, bell: true }} facVersion={app.facVersion}
          follow label={name + '님의 마지막 위치 지도'} />
        <div className="map-bottom">
          <section className="gv-card" aria-label="위치 수신 정보">
            {s.type === 'sos' && (
              <div className="banner banner-danger" role="alert">
                <Icon name="alert" size={22} />
                <div className="grow"><b>{name}님이 SOS를 실행했어요</b><small>연락이 닿지 않으면 112에 신고해 주세요. 신고 번호: 112</small></div>
              </div>
            )}
            {delayed && (
              <div className="banner banner-amber" role="status">
                <Icon name="clock" size={22} />
                <div className="grow"><b>위치 수신이 늦어지고 있어요</b><small>마지막으로 받은 위치를 보여드려요. 링크는 아직 열려 있어요.</small></div>
              </div>
            )}
            <div className="stat-grid two">
              <div className="stat"><span>마지막 수신</span><b>{fmtClock(s.last.at, true)}</b><small>{lagSec}초 전</small></div>
              <div className="stat">
                <span>{remain !== null ? '도착 예정' : '링크 만료'}</span>
                <b>{remain !== null ? fmtClock(now + (remain / WALK_MPS) * 1000) : fmtClock(s.expiresAt)}</b>
                <small>{remain !== null ? '남은 거리 ' + fmtDist(remain) : '그 전에 끝날 수 있어요'}</small>
              </div>
            </div>
            <p className="small muted">로그인 없이 링크로 열리는 화면이에요. {name}님이 도착하거나 공유를 끝내면 바로 닫혀요. (만료 {fmtClock(s.expiresAt)})</p>
          </section>
        </div>
      </div>
    </div>
  );
}

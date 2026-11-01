// SOS (UC-08 / FR-12): 취소 대기 → 실행(지도·대피 후보, 경보음 표시, 위치, 보호자 긴급 공유, 112 신고 문안) → 상황 종료
// 실행 중 화면 위쪽에 지도를 둬서 지도를 보면서 이동할 수 있게 함
//   - 내 위치(실제 GPS면 실시간으로 움직임) + 가까운 대피 후보 3곳(번호 표시)
//   - 후보를 누르면 그곳까지 도보 경로를 그리고 남은 거리를 알려줌
//   - '카카오맵으로 길찾기' 버튼: 카카오맵(앱이 있으면 앱)에서 도보 길찾기를 엶
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { Field, CopyButton } from '../components/ui';
import Icon from '../components/Icon';
import KakaoMap from '../components/KakaoMap';
import { fmtClock, fmtDist, fmtMin, distM, pathLength, projectOnPath } from '../lib/geo';
import { shelterCandidates, FAC_NAME } from '../lib/facilities';
import { rerouteFrom } from '../lib/router';
import { SOS_CANCEL_SEC, COLORS, ARRIVE_M, OFF_ROUTE_M } from '../config';

const REFRESH_M = 100; // 처음 찾은 곳에서 100m 넘게 움직이면 대피 후보를 다시 찾음

// 112 문자신고에 붙여 넣을 문안
function buildReport(name, pos, at, stale, place) {
  const lines = ['[긴급 신고] 도움이 필요합니다.', '이름: ' + name];
  if (pos) {
    lines.push('위치: 위도 ' + pos.lat.toFixed(6) + ', 경도 ' + pos.lng.toFixed(6));
    lines.push((stale ? '마지막 확인 시각: ' : '확인 시각: ') + fmtClock(at, true) + (stale ? ' (GPS 신호 끊김)' : ''));
  } else {
    lines.push('위치: ' + (place || '(위치를 확인하지 못했어요. 장소를 적어 주세요)'));
  }
  lines.push('상황: ');
  lines.push('- 안심귀갓길 앱이 만든 신고 문안');
  return lines.join('\n');
}

// 대피 후보 한 곳의 이름·설명
function shelterText(f) {
  if (f.type === 'store') return { name: f.name || '편의점', desc: '편의점 · 대피 우선순위 높음 (사람이 있는 곳)' };
  if (f.type === 'police') return { name: f.name, desc: (f.kind || '지구대·파출소') + ' · 경찰에 바로 도움 요청' };
  if (f.type === 'fire') return { name: f.name, desc: '119안전센터' + (f.tel ? ' · ' + f.tel : '') };
  return { name: FAC_NAME.bell, desc: '누르면 관제센터와 연결돼요' };
}
const keyOf = f => f.type + ':' + f.lat + ',' + f.lng;

// 카카오맵 도보 길찾기 링크 (공식 URL 형식: /link/by/walk/출발이름,위도,경도/도착이름,위도,경도)
// 이름 안의 쉼표·빗금은 주소 구분자와 헷갈리지 않게 빼고 넣음
function kakaoWalkUrl(from, to, toName) {
  const clean = s => encodeURIComponent(String(s).replace(/[,/]/g, ' '));
  return 'https://map.kakao.com/link/by/walk/' + clean('내 위치') + ',' + from.lat + ',' + from.lng + '/' + clean(toName) + ',' + to.lat + ',' + to.lng;
}

export default function SosFlow() {
  const app = useApp();
  const s = app.sos;
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [report, setReport] = useState('');
  const [place, setPlace] = useState('');
  const [cands, setCands] = useState([]);       // 대피 후보 (가까운 순 3곳)
  const [base, setBase] = useState(null);       // 후보를 찾은 위치
  const [sel, setSel] = useState(null);         // 고른 후보
  const [route, setRoute] = useState(null);     // 고른 후보까지 도보 경로 { status, pts, len, engine }
  const [viewKey, setViewKey] = useState(0);    // 바뀔 때만 지도를 다시 맞춤
  const reqRef = useRef('');                    // 마지막으로 요청한 경로 (늦게 온 옛 응답 무시용)
  const name = app.me ? app.me.name : '사용자';
  const phase = s ? s.phase : null;

  // 지금 내 위치: 실제 GPS면 걸을 때마다 바뀜 (App.jsx 의 watchPosition)
  const pos = phase === 'active' ? app.currentPos : null;
  const gi = app.gpsInfo;
  const gpsLive = !!app.myPos && app.myPos.source === 'gps';
  const stale = s && s.stale ? true : gpsLive && !!gi.lastFixAt && Date.now() - gi.lastFixAt > 15000;

  // 실행되면: 신고 문안 만들기 / 끝나거나 취소되면: 지난 SOS의 후보·경로 지우기
  useEffect(() => {
    if (phase !== 'active') {
      setCands([]); setBase(null); setSel(null); setRoute(null); setConfirmEnd(false); reqRef.current = '';
      return;
    }
    setReport(buildReport(name, s.pos, s.at, s.stale, ''));
  }, [phase]);

  // 대피 후보 찾기: 처음 한 번 + 100m 넘게 움직였을 때
  useEffect(() => {
    if (phase !== 'active' || !pos) return;
    if (base && distM(base, pos) < REFRESH_M) return;
    const list = shelterCandidates(pos, 3, 3000);
    if (!list.length && app.facVersion === 0) return; // 시설 데이터를 아직 못 불러옴
    setCands(list);
    if (!base) setViewKey(k => k + 1); // 처음 찾았을 때만 후보가 다 보이게 지도 맞춤
    setBase(pos);
    app.pushLog('GET', '/facilities/shelters', 200, '가까운 대피 후보 ' + list.length + '곳');
  }, [phase, pos && pos.lat, pos && pos.lng, app.facVersion]);

  // 후보 고르기 → 도보 경로 받기
  const pick = f => {
    if (!pos) return;
    const k = keyOf(f);
    setSel(f);
    if (route && route.key === k && route.status === 'ready') return;
    reqRef.current = k;
    setRoute({ key: k, status: 'loading' });
    rerouteFrom(pos, f, app.pushLog).then(r => {
      if (reqRef.current !== k) return; // 그 사이 다른 후보를 눌렀으면 무시
      setRoute({ key: k, status: 'ready', pts: r.pts, len: pathLength(r.pts), engine: r.engine });
      setViewKey(v => v + 1); // 경로 전체가 보이게 지도 맞춤
    });
  };
  // 경로에서 벗어났을 때 지금 위치에서 다시 찾기
  const repick = () => { if (sel) { setRoute(null); reqRef.current = ''; setTimeout(() => pick(sel), 0); } };

  // 지도에 그릴 것들
  const marks = useMemo(() => cands.map((f, i) => ({
    lat: f.lat, lng: f.lng, kind: f.type, label: String(i + 1), title: shelterText(f).name, selected: !!sel && keyOf(sel) === keyOf(f),
  })), [cands, sel]);
  const routeOk = route && route.status === 'ready' && sel && route.key === keyOf(sel);
  const mapRoutes = useMemo(() => (routeOk ? [{ pts: route.pts, color: COLORS.safe, width: 6 }] : []), [routeOk, route]);
  const view = useMemo(() => {
    if (!pos) return null;
    const pts = routeOk ? route.pts.filter((_, i) => i % 3 === 0).concat([route.pts[route.pts.length - 1], pos]) : [pos, ...cands];
    return { type: 'fit', pts, pad: { top: 40, bottom: 30, left: 30, right: 30 }, key: 'sos-' + viewKey };
  }, [viewKey]);

  if (!s) return null;

  // 1) 취소 대기
  if (s.phase === 'countdown') {
    const C = 2 * Math.PI * 58;
    return (
      <div className="sos-layer" role="alertdialog" aria-modal="true" aria-labelledby="sos-title">
        <div className="sos-count">
          <p className="sos-kicker">SOS 실행 대기</p>
          <div className="ring" aria-hidden="true">
            <svg width="132" height="132" viewBox="0 0 132 132">
              <circle className="ring-track" cx="66" cy="66" r="58" />
              <circle className="ring-bar" cx="66" cy="66" r="58" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - s.left / SOS_CANCEL_SEC) }} />
            </svg>
            <b>{s.left}</b>
          </div>
          <h2 id="sos-title">{s.left}초 뒤 SOS를 실행해요</h2>
          <p>실수로 눌렀다면 지금 취소하세요. 취소하면 보호자 공유를 시작하지 않아요.</p>
          <button className="btn btn-cancel" autoFocus onClick={app.cancelSos}>취소</button>
          <button className="btn btn-line" onClick={() => app.setSos(x => ({ ...x, left: 0 }))}>기다리지 않고 바로 실행</button>
        </div>
      </div>
    );
  }

  // 2) 실행 중
  const sh = app.share && app.share.status === 'active' && app.share.type === 'sos' ? app.share : null;
  const names = sh ? app.guardians.filter(g => sh.guardianIds.includes(g.id)).map(g => g.name).join(', ') : '';
  let shareState;
  if (!app.guardians.length) shareState = ['muted', '등록된 보호자가 없어서 공유하지 않았어요. 신고 문안은 준비했어요.'];
  else if (s.shareFailed) shareState = ['st-err', '통신 오류로 보호자에게 공유하지 못했어요. 문자로 직접 알려 주세요.'];
  else if (sh) shareState = ['st-ok', names + '에게 긴급 위치를 공유하고 있어요.'];
  else shareState = ['muted', '보호자 공유를 시작하는 중이에요…'];

  // 고른 후보까지 남은 거리 (경로 위에 내 위치를 맞춰서 계산)
  let remain = null, off = false, reached = false;
  if (routeOk && pos) {
    const pr = projectOnPath(route.pts, pos);
    remain = Math.max(0, route.len - pr.along);
    off = pr.off > OFF_ROUTE_M;
    reached = distM(pos, sel) <= ARRIVE_M;
  }
  const selText = sel ? shelterText(sel) : null;

  return (
    <div className="sos-layer" role="dialog" aria-modal="true" aria-label="SOS 실행 중">
      <header className="sos-top">
        <span className="sos-live"><span className="pulse-dot" aria-hidden="true" />SOS 실행 중</span>
        <span className="mono small">{fmtClock(app.clock(), true)}</span>
      </header>
      <div className="sos-map">
        <KakaoMap view={view} user={pos} userStale={stale} routes={mapRoutes} marks={marks}
          onMarkClick={i => pick(cands[i])} facVersion={app.facVersion} follow label="SOS 지도: 내 위치와 가까운 대피 후보" />
        {!pos && <div className="sos-map-msg">위치를 확인하지 못해 지도에 표시할 수 없어요.</div>}
      </div>
      <div className="scroll sos-body">
        <section className="sos-card" aria-label="가까운 대피 후보">
          <h3>가까운 대피 후보 · 눌러서 길 찾기</h3>
          {cands.length ? cands.map((f, i) => {
            const t = shelterText(f);
            const on = !!sel && keyOf(sel) === keyOf(f);
            return (
              <button key={keyOf(f)} className={'shelter' + (on ? ' sel' : '')} aria-pressed={on ? 'true' : 'false'} onClick={() => pick(f)}>
                <span className={'sh-num mk-bg-' + f.type}>{i + 1}</span>
                <span className="grow"><b className="small" style={{ display: 'block' }}>{t.name}</b><span className="small muted">{t.desc}</span></span>
                <span className="mono small">약 {fmtDist(f.d)}</span>
              </button>
            );
          }) : <p className="small muted">{pos ? '3km 안에서 대피 후보를 찾지 못했어요. 밝고 사람이 많은 큰길로 이동하세요.' : '위치를 확인하면 가까운 편의점·지구대·비상벨을 보여드려요.'}</p>}
          {sel && (
            <div className="sos-route" role="status">
              {route && route.status === 'loading' && <p className="small"><span className="spinner sm" aria-hidden="true" /> {selText.name}까지 도보 경로를 찾는 중이에요…</p>}
              {routeOk && (reached
                ? <p className="small st-ok"><b>{selText.name}에 도착했어요.</b> 안으로 들어가 도움을 요청하세요.</p>
                : <p className="small"><b>{selText.name}</b>까지 남은 거리 <b>{fmtDist(remain)}</b> · 약 {fmtMin(remain)}
                  {route.engine === 'straight' && <span className="muted"> (경로 서버 연결 실패, 직선 표시)</span>}</p>)}
              {routeOk && off && !reached && (
                <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
                  <span className="small st-err">경로에서 벗어났어요.</span>
                  <button className="btn btn-line btn-sm" onClick={repick}>지금 위치에서 다시 찾기</button>
                </div>
              )}
              {pos && (
                <a className="btn btn-light btn-sm" href={kakaoWalkUrl(pos, sel, selText.name)} target="_blank" rel="noopener noreferrer"
                  onClick={() => app.pushLog('EXT', '카카오맵 길찾기 링크', 200, selText.name + '까지 도보')}>
                  <Icon name="map" size={16} />카카오맵으로 길찾기
                </a>
              )}
              <p className="small muted">카카오맵 앱이 설치되어 있으면 앱에서 열 수 있어요. 이 화면으로 돌아오면 SOS는 계속 실행 중이에요.</p>
            </div>
          )}
        </section>
        <section className="sos-card alarm" aria-label="경보음">
          <div className={'bars' + (s.alarm ? '' : ' off')} aria-hidden="true"><span /><span /><span /><span /></div>
          <div className="grow"><b>{s.alarm ? '경보음이 울리고 있어요' : '경보음을 껐어요'}</b><small>무음·진동 모드여도 울려요. 앱으로 패키징한 뒤 네이티브 기능으로 만들어요.</small></div>
          <button className="btn btn-line btn-sm" onClick={() => app.setSos(x => ({ ...x, alarm: !x.alarm }))}>{s.alarm ? '끄기' : '켜기'}</button>
        </section>
        <section className="sos-card" aria-label="내 위치">
          <h3>SOS 실행 위치</h3>
          {s.pos ? (
            <>
              <p className="mono">위도 {s.pos.lat.toFixed(6)} · 경도 {s.pos.lng.toFixed(6)}</p>
              <p className="small muted">{s.stale ? 'GPS 신호가 끊겨 마지막 위치를 보여드려요 · ' + fmtClock(s.at, true) + ' 확인' : fmtClock(s.at, true) + ' 확인'}
                {gpsLive ? ' · 지도에는 지금 위치를 실시간으로 보여줘요' : ''}</p>
            </>
          ) : (
            <>
              <p className="small muted">현재 위치를 확인하지 못했어요. 지금 있는 장소를 적어 주세요.</p>
              <Field id="sos-place" label="지금 있는 장소" value={place} placeholder="예: 반월당역 2번 출구 앞"
                onChange={v => { setPlace(v); setReport(buildReport(name, null, null, false, v)); }} />
            </>
          )}
        </section>
        <section className="sos-card" aria-label="보호자 긴급 공유">
          <h3>보호자 긴급 공유</h3>
          <p className={'small ' + shareState[0]}>{shareState[1]}</p>
        </section>
        <section className="sos-card" aria-label="112 신고 문안">
          <h3>112 신고 문안</h3>
          <label htmlFor="sos-report" className="sr-only">112 신고 문안</label>
          <textarea id="sos-report" className="input msg" rows={6} value={report} onChange={e => setReport(e.target.value)} />
          <div className="btn-row">
            <CopyButton text={report} label="문안 복사" />
            <button className="btn btn-secondary btn-sm" onClick={() => app.showToast('실제 앱에서는 112로 보낼 문자 앱이 열려요. 시연에서는 열지 않아요.')}><Icon name="message" size={16} />문자 앱 열기</button>
          </div>
          <p className="small muted">‘상황’에 내용을 덧붙인 뒤 직접 보내 주세요. 문자를 실제로 보냈는지는 앱이 알 수 없어요.</p>
        </section>
      </div>
      <footer className="sos-foot">
        {confirmEnd ? (
          <>
            <p className="small">상황이 끝났나요? 경보음을 멈추고 보호자 긴급 공유를 종료해요.</p>
            <div className="btn-row">
              <button className="btn btn-line" onClick={() => setConfirmEnd(false)}>아직이에요</button>
              <button className="btn btn-light" onClick={app.endSos}>상황 종료</button>
            </div>
          </>
        ) : <button className="btn btn-light" onClick={() => setConfirmEnd(true)}>상황 종료하기</button>}
      </footer>
    </div>
  );
}

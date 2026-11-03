// 경로 비교 (UIR-US-02 / FR-04·05): 거리 우선 vs 안전시설 경유, 위험도와 근거 표시
import { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { TopBar, TimePill } from '../components/ui';
import Icon from '../components/Icon';
import KakaoMap from '../components/KakaoMap';
import { riskLevel } from '../lib/router';
import { timeInfo } from '../lib/risk';
import { fmtDist, walkMin } from '../lib/geo';
import { COLORS, DETOUR_LIMIT } from '../config';

// 경로가 하나만 나올 때 이유별 안내 문구 (router.js findRoutes 의 reason)
const SINGLE_MSG = {
  noAlt: '다른 길 후보를 찾지 못해서 하나만 보여드려요.',
  tooLong: '다른 길은 ' + Math.round(DETOUR_LIMIT * 100) + '% 넘게 돌아가서 하나만 보여드려요.',
  tooDark: '다른 길은 밤에 어두운 길(산길·공원 안쪽 등)을 길게 지나서 하나만 보여드려요.',
  smallDiff: '다른 길과 위험도 차이가 거의 없어서 하나만 보여드려요.',
};

// 경로 카드 칩 항목
//   better: 'low' = 낮을수록 좋음, 'high' = 높을수록 좋음
//   always: false 면 두 경로 모두 0일 때(min 이 있으면 min 미만일 때) 칩을 숨김
//   tone: 경로가 하나뿐일 때(비교 대상 없음) 쓰는 원래 색
const METRICS = [
  { key: 'barZoneM', better: 'low', icon: 'moon', tone: 'chip-amber',
    text: v => (v > 0 ? '심야 유흥업소 밀집 구간 ' + fmtDist(v) + ' 통과' : '심야 유흥업소 밀집 구간 없음') },
  // 범죄 잦은 구간 = 범죄주의 등급 7 이상인 길을 지나는 길이 (아래 설명 줄 참고)
  { key: 'crimeHighM', better: 'low', tone: 'chip-amber', text: v => (v > 0 ? '범죄 잦은 구간 ' + fmtDist(v) + ' 지남' : '범죄 잦은 구간 없음') },
  // 어두운 길: 보안등·CCTV·비상벨 없는 골목급 길이 가장 길게 이어지는 길이 (어두운 시간에만 값이 있음)
  { key: 'darkRunM', better: 'low', min: 100, icon: 'moon', tone: 'chip-amber',
    text: v => (v >= 100 ? '어두운 길 최대 ' + fmtDist(v) + ' 연속' : '긴 어두운 길 없음') },
  { key: 'cameras', better: 'high', always: true, text: v => 'CCTV ' + v + '대 경유' },
  { key: 'bell', better: 'high', text: v => '비상벨 ' + v + '개' },
  { key: 'lampPct', better: 'high', always: true, text: v => '보안등 구간 ' + v + '%' },
  { key: 'alleyPct', better: 'low', always: true, tone: 'chip-muted', text: v => '골목길 ' + v + '%' },
];

// 다른 경로와 비교: 1 = 이 경로가 나음, -1 = 나쁨, 0 = 같음
function compare(m, r, other) {
  const d = r[m.key] - other[m.key];
  if (d === 0) return 0;
  return (m.better === 'low' ? -d : d) > 0 ? 1 : -1;
}

function RouteCard({ r, sel, base, other, onPick }) {
  const lv = riskLevel(r.risk);
  const mins = walkMin(r.len);
  const baseMin = base ? walkMin(base.len) : mins;
  const isFast = r.id === 'fast';
  const tone = isFast ? 'chip-muted' : 'chip-accent';
  return (
    <button className={'route-card' + (sel ? ' sel' : '')} aria-pressed={sel ? 'true' : 'false'} onClick={onPick}
      style={{ '--rc': isFast ? 'var(--amber)' : 'var(--accent)' }}>
      <span className="rc-head">
        <span className={'rc-swatch' + (isFast ? ' dotted' : '')} />
        <span className="rc-name">{r.name}</span>
        <span className="rc-radio" aria-hidden="true" />
      </span>
      <span className="rc-main">
        <b>{mins}분</b><span>{fmtDist(r.len)}</span>
        {r.detour > 0 && <span className="tone-amber">+{fmtDist(r.detour)}{mins > baseMin ? ' · +' + (mins - baseMin) + '분' : ''} 우회</span>}
        {isFast && <span>기준 경로</span>}
      </span>
      {/* 안전 경로로 고른 이유 (예: 평균 위험도 3점 낮음 / 범죄 잦은 구간 1.9km 적음) */}
      {r.why && <span className="rc-why"><Icon name="shield" size={14} />{r.why}</span>}
      <span className="rc-risk">
        <span className="rc-risk-top"><span>상대 위험도</span><b className={'tone-' + lv.tone}>{r.risk} · {lv.label}</b></span>
        <span className="bar"><span className={'bg-' + lv.tone} style={{ width: Math.max(4, r.risk) + '%' }} /></span>
      </span>
      <span className="rc-chips">
        {r.motor && <span className="chip chip-danger"><Icon name="alert" size={12} />자동차전용도로 포함</span>}
        {METRICS.map(m => {
          // 두 경로 모두 0이면 숨김 (CCTV·보안등·골목은 항상 표시)
          const shown = x => x && x[m.key] >= (m.min || 1);
          if (!m.always && !shown(r) && !shown(other)) return null;
          // 비교 대상이 있으면 ✓(더 나음, 초록) / ✕(더 나쁨, 빨강), 없으면 원래 색
          const c = other ? compare(m, r, other) : null;
          const cls = c === null ? (m.tone || tone) : c > 0 ? 'chip-good' : c < 0 ? 'chip-danger' : 'chip-muted';
          return (
            <span key={m.key} className={'chip ' + cls}>
              {c === 1 && <span aria-hidden="true">✓</span>}
              {c === -1 && <span aria-hidden="true">✕</span>}
              {m.icon && <Icon name={m.icon} size={12} />}
              {m.text(r[m.key])}
              {c !== null && c !== 0 && <span className="sr-only">{c > 0 ? ' (다른 경로보다 좋음)' : ' (다른 경로보다 나쁨)'}</span>}
            </span>
          );
        })}
      </span>
      {r.matchedPct < 60 && <span className="small muted">위험도 자료가 없는 구간이 많아 대구 평균으로 채운 부분이 있어요 ({100 - r.matchedPct}%).</span>}
    </button>
  );
}

export default function RouteCompareScreen() {
  const app = useApp();
  const t = app.trip;
  const [withShare, setWithShare] = useState(false);
  const [needPerm, setNeedPerm] = useState(false);
  const ready = !!t && t.status === 'ready';

  // 지도에 그릴 선: 선택한 경로를 맨 위에
  const mapRoutes = useMemo(() => {
    if (!ready) return [];
    return [...t.routes]
      .sort((a, b) => (a.id === t.selectedId) - (b.id === t.selectedId))
      .map(r => ({ pts: r.pts, color: r.id === 'fast' ? COLORS.fast : COLORS.safe, dotted: r.id === 'fast', width: r.id === 'fast' ? 5 : 6, opacity: r.id === t.selectedId ? 1 : 0.5 }));
  }, [ready, t && t.routes, t && t.selectedId]);
  const view = useMemo(() => {
    if (!t) return null;
    const pts = ready ? t.routes.flatMap(r => [r.pts[0], ...r.pts.filter((_, i) => i % 5 === 0), r.pts[r.pts.length - 1]]) : [t.start, t.dest];
    return { type: 'fit', pts, pad: { top: 50, bottom: 40, left: 30, right: 30 }, key: 'routes-' + t.status + (ready ? t.routes.length : '') };
  }, [t && t.status, t && t.routes]);

  const toSearch = () => { app.setSearchMode('dest'); app.go('search'); };
  if (!t) return (
    <div className="screen">
      <TopBar title="경로 비교" onBack={() => app.go('main')} />
      <div className="state-msg"><b>목적지를 먼저 골라 주세요</b><button className="btn btn-primary btn-sm" onClick={toSearch}>목적지 검색</button></div>
    </div>
  );

  const startName = app.startPick ? app.startPick.name : '현재 위치';
  const sel = ready ? t.routes.find(r => r.id === t.selectedId) : null;
  const base = ready ? t.routes.find(r => r.id === 'fast') : null;
  const names = app.guardians.map(g => g.name).join(', ');
  const onStart = () => { if (app.consent === false) { setNeedPerm(true); return; } app.startGuide(withShare); };
  const allowPerm = () => app.call('PUT', '/users/me/consents', () => true, { note: '위치 동의: 동의' })
    .then(() => { app.setConsent(true); setNeedPerm(false); app.showToast('위치 권한을 허용했어요. 안내를 시작할 수 있어요.'); })
    .catch(e => app.showToast(e.message));
  const errTitle = { NETWORK: '서버에 연결하지 못했어요', OUT_OF_AREA: '서비스 지역 밖이에요', TOO_CLOSE: '이미 목적지 근처예요' }[t.error && t.error.code] || '경로를 만들지 못했어요';

  return (
    <div className="screen">
      <TopBar title="경로 비교" sub={startName + ' → ' + t.dest.name} onBack={() => app.go('main')} />
      <div className="scroll">
        <div className="route-map">
          <KakaoMap view={view} routes={mapRoutes} start={t.start} dest={t.dest} layers={{ cctv: true, bell: true }} facVersion={app.facVersion} mapType={app.mapType} label="후보 경로 지도" />
          <TimePill night={timeInfo(t.hour).dark} text={t.hour + '시 출발 · ' + timeInfo(t.hour).label} />
        </div>

        {t.status === 'loading' && (
          <div className="state-msg">
            <span className="spinner" aria-hidden="true" />
            <b>도보 경로 후보를 받고 있어요</b>
          </div>
        )}
        {t.status === 'error' && (
          <div className="state-msg">
            <Icon name="alert" size={28} />
            <b>{errTitle}</b>
            <span>{t.error.message}</span>
            <div className="btn-row" style={{ width: '100%' }}>
              <button className="btn btn-primary btn-sm" onClick={() => app.requestRoutes(t.dest, { start: t.start, hour: t.hour })}>다시 시도</button>
              <button className="btn btn-ghost btn-sm" onClick={toSearch}>다른 목적지 검색</button>
            </div>
          </div>
        )}
        {ready && (
          <>
            <div className="route-list">
              {t.engine === 'straight' && (
                <p className="banner banner-amber" role="status"><Icon name="alert" size={20} />
                  <span className="grow"><b>경로 서버에 연결하지 못했어요</b><small>목적지까지 직선으로 표시했어요. ({t.engineError})</small></span></p>
              )}
              {/* 경로가 하나뿐인 이유를 원인별로 안내 (자세한 후보 정보는 시연 도구 > API 기록) */}
              {t.routes[0].single && t.engine === 'osrm' && <p className="note-box">{SINGLE_MSG[t.reason] || SINGLE_MSG.smallDiff}</p>}
              {/* 두 경로를 비교할 때만: 칩 기호 설명 */}
              {t.routes.length === 2 && <p className="cmp-legend"><span className="tone-good">✓ 다른 경로보다 나음</span><span className="tone-danger">✕ 다른 경로보다 나쁨</span></p>}
              {t.routes.map(r => (
                <RouteCard key={r.id} r={r} sel={r.id === t.selectedId} base={base}
                  other={t.routes.length === 2 ? t.routes.find(x => x.id !== r.id) : null}
                  onPick={() => app.setTrip(x => ({ ...x, selectedId: r.id }))} />
              ))}
            </div>
            {/* 칩 용어 설명 */}
            <p className="disclaimer"><Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              범죄 잦은 구간: 생활안전지도 범죄주의 등급 7 이상인 길 (등급 숫자가 클수록 범죄가 잦은 곳) · 골목길: 큰길·중간 길이 아닌 좁은 길의 비율</p>
            <p className="disclaimer"><Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              위험도는 범죄주의구간·시간대별 유동인구·CCTV·비상벨·보안등·대피 거점·유흥주점·길 종류를 반영한, 경로끼리 비교하기 위한 상대 지표예요. 실제 범죄 확률이나 안전을 보장하지 않아요.</p>
            <div className="route-foot">
              {app.guardians.length ? (
                <label className="check" htmlFor="with-share">
                  <input id="with-share" type="checkbox" checked={withShare} onChange={e => setWithShare(e.target.checked)} />
                  <span>출발하면서 보호자({names})에게 위치 공유하기</span>
                </label>
              ) : (
                <div className="note-box row" style={{ justifyContent: 'space-between' }}>
                  <span>보호자를 등록하면 출발할 때 위치를 공유할 수 있어요.</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => app.go('guardians')}>등록</button>
                </div>
              )}
              {needPerm && (
                <div className="banner banner-amber" role="alert">
                  <Icon name="lock" size={22} />
                  <div className="grow"><b>안내에는 위치 권한이 필요해요</b><small>권한 없이는 경로 확인만 할 수 있어요.</small></div>
                  <button className="btn btn-amber btn-sm" onClick={allowPerm}>권한 허용</button>
                </div>
              )}
              <button className="btn btn-primary" onClick={onStart}>{sel ? sel.name + '로 안내 시작' : '안내 시작'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

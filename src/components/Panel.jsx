// 오른쪽 "구조·시연" 패널 (폰 너비에서는 상단 버튼으로 열기)
// - 구조: 지금 화면의 요구사항 ID, 컴포넌트, 호출 API (구조설계서용)
// - 시연 도구: 오류 상황·이탈·보호자 시점 등을 직접 일으킴
// - API 기록: 실제로 호출된 순서
import { useApp } from '../AppContext';
import { META, GROUPS } from '../lib/meta';
import { USE_SERVER } from '../config';
import { Switch } from './ui';
import Icon from './Icon';

export default function Panel() {
  const app = useApp();
  const m = META[app.metaKey] || META.login;
  const tabs = [['structure', '구조'], ['demo', '시연 도구'], ['logs', 'API 기록']];
  return (
    <aside className={'panel' + (app.panelOpen ? ' open' : '')} aria-label="구조와 시연 도구">
      <div className="panel-head">
        <div className="panel-title">
          <b>North Star · 앱 구성 프로토타입</b>
          <span>카카오맵 · 대구 공공데이터 · 시연 시각 {app.clockText}</span>
        </div>
        <button className="icon-btn panel-close" aria-label="패널 닫기" onClick={() => app.setPanelOpen(false)}><Icon name="close" /></button>
      </div>
      <div className="panel-tabs" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" className="ptab" aria-selected={app.panelTab === k ? 'true' : 'false'} onClick={() => app.setPanelTab(k)}>
            {l}{k === 'logs' && app.logs.length ? ' ' + app.logs.length : ''}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {app.panelTab === 'structure' && <Structure m={m} />}
        {app.panelTab === 'demo' && <DemoTools />}
        {app.panelTab === 'logs' && <ApiLog />}
      </div>
    </aside>
  );
}

function Structure({ m }) {
  const app = useApp();
  return (
    <>
      <section className="cur-screen" aria-label="지금 보고 있는 화면">
        <span className="sec-label">지금 화면 · {m.group}</span>
        <h3>{m.title}</h3>
        <div className="id-chips">{m.ids.map(i => <span key={i} className="id-chip">{i}</span>)}</div>
        <div className="tree" aria-label="컴포넌트 구성">
          <span className="t-root">&lt;{m.comp}&gt;</span>
          {m.parts.map(p => <span key={p} className="t-child">└ &lt;{p} /&gt;</span>)}
        </div>
        <div className="api-list" aria-label="이 화면이 호출하는 API">
          {m.apis.map(([meth, path, desc]) => (
            <div key={meth + path} className="api-row">
              <span className={'method m-' + meth}>{meth === 'EXT' ? '외부' : meth}</span>
              <span className="api-path">{path}</span>
              <span className="api-desc">{desc}</span>
            </div>
          ))}
        </div>
      </section>
      <Switch checked={app.demo.idStrip} onChange={v => app.setDemo(d => ({ ...d, idStrip: v }))} label="폰 화면 위에 화면 ID 표시" hint="발표·캡처할 때 화면 이름과 요구사항 ID가 함께 보여요" />
      <section className="psec">
        <span className="sec-label">앱 전체 구성 · 누르면 그 화면으로 이동</span>
        {GROUPS.map(([g, keys]) => (
          <div key={g} className="nav-group">
            <span className="nav-group-title">{g}</span>
            {keys.map(k => (
              <button key={k} className="nav-item" aria-current={app.metaKey === k ? 'true' : undefined} onClick={() => app.jumpTo(k)}>
                {META[k].title}<span className="mono">{META[k].comp}</span>
              </button>
            ))}
          </div>
        ))}
      </section>
      <p className="panel-hint">API 경로는 프론트·백엔드가 맞춰 볼 수 있도록 제안한 이름이에요. 확정되면 src/lib/meta.js 에서 바꿔 주세요.</p>
    </>
  );
}

function DemoTools() {
  const app = useApp();
  const d = app.demo;
  const set = patch => app.setDemo(x => ({ ...x, ...patch }));
  const guiding = !!app.guide && !app.guide.arrived;
  const gpsMode = guiding && app.guide.mode === 'gps'; // 실제 위치로 안내 중
  const shareOn = !!app.share && app.share.status === 'active';
  const posText = !app.myPos ? '없음 (위치 동의 안 함)' : app.myPos.source === 'gps' ? '실제 GPS 위치' : '시연 위치 (대구 중구)';
  return (
    <>
      <section className="psec">
        <span className="sec-label">시간대</span>
        <div className="seg" role="group" aria-label="시연 시간대">
          <button aria-pressed={d.night ? 'true' : 'false'} onClick={() => set({ night: true })}>밤 10:40 · 심야</button>
          <button aria-pressed={!d.night ? 'true' : 'false'} onClick={() => set({ night: false })}>오후 2:00 · 주간</button>
        </div>
        <p className="panel-hint">경로를 다시 검색하면 위험도 계산에 반영돼요.</p>
      </section>
      <section className="psec">
        <span className="sec-label">위치</span>
        <div className="seg" role="group" aria-label="위치 권한">
          <button aria-pressed={app.consent !== false ? 'true' : 'false'} onClick={() => app.setConsent(true)}>위치 동의</button>
          <button aria-pressed={app.consent === false ? 'true' : 'false'} onClick={() => app.setConsent(false)}>동의 안 함</button>
        </div>
        <p className="panel-hint">지금 내 위치: {posText}</p>
        <button className="btn btn-secondary btn-sm" disabled={app.consent === false} onClick={app.locate}><Icon name="locate" size={16} />현재 위치 다시 받기</button>
      </section>
      <section className="psec">
        <span className="sec-label">오류 상황</span>
        <Switch checked={d.commError} onChange={v => set({ commError: v })} label="통신 오류" hint="우리 서버(API) 호출이 모두 실패해요" />
        <Switch checked={d.routeFail} onChange={v => set({ routeFail: v })} label="경로 생성 실패" hint="경로 요청이 실패해요" />
        <Switch checked={d.gpsLost} onChange={v => set({ gpsLost: v, gpsLostAt: v ? app.clock() : null })} label="GPS 수신 실패" hint="마지막 위치와 확인 시각을 보여줘요" />
      </section>
      <section className="psec">
        <span className="sec-label">안내 위치 방식</span>
        {/* 자동: 실제 GPS 위치가 있으면 실제 위치, PC 시연 위치면 자동 이동 */}
        <div className="seg" role="group" aria-label="안내 위치 방식">
          {[['auto', '자동'], ['gps', '실제 위치'], ['sim', '시연 자동 이동']].map(([k, t]) => (
            <button key={k} aria-pressed={d.guideMode === k ? 'true' : 'false'} onClick={() => app.setGuideMode(k)}>{t}</button>
          ))}
        </div>
        <p className="panel-hint">
          {guiding ? '지금 안내: ' + (gpsMode ? '실제 위치를 따라가는 중' : '경로를 따라 자동으로 이동하는 중') + ' · '
            : ''}실제 위치는 폰(HTTPS 주소)에서 걸으면서 확인해요. PC에서는 크롬 개발자 도구의 Sensors로 위치를 바꿔 볼 수 있어요.
        </p>
      </section>
      <section className="psec">
        <span className="sec-label">경로 안내{guiding ? '' : ' · 안내 중일 때 쓸 수 있어요'}</span>
        <div className="btn-row">
          <button className="btn btn-secondary btn-sm" disabled={!guiding || gpsMode || app.guide.deviated} onClick={app.triggerDeviation}>경로 이탈 발생</button>
          <button className="btn btn-secondary btn-sm" disabled={!guiding} onClick={app.skipToArrival}>도착 지점으로 이동</button>
        </div>
        <Switch checked={d.speed > 1} onChange={v => set({ speed: v ? 3 : 1 })} label="빠르게 걷기 (×3)" hint="시연 자동 이동에서만 적용돼요" />
      </section>
      <section className="psec">
        <span className="sec-label">보호자 시점</span>
        <button className="btn btn-secondary btn-sm" onClick={() => (app.viewAs === 'guardian' ? app.setViewAs('user') : app.jumpTo('guardianView'))}>
          {app.viewAs === 'guardian' ? '사용자 화면으로 돌아가기' : '보호자 화면 열기'}
        </button>
        <Switch checked={d.shareDelay} onChange={v => set({ shareDelay: v })} label="위치 수신 지연" hint="보호자 화면에 마지막 수신 시각이 표시돼요" />
        <button className="btn btn-ghost btn-sm" disabled={!shareOn} onClick={app.expireShare}>공유 링크 만료시키기</button>
      </section>
      <section className="psec">
        <span className="sec-label">초기화</span>
        <button className="btn btn-ghost btn-sm" onClick={app.reset}>처음부터 다시</button>
      </section>
    </>
  );
}

function ApiLog() {
  const app = useApp();
  if (!app.logs.length) return <p className="empty">아직 호출한 API가 없어요.</p>;
  return (
    <section className="psec">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {/* 서버 주소(VITE_API_URL)가 있으면 진짜 서버, 없으면 브라우저 안의 가짜 API */}
        <span className="sec-label">최근 호출 (최신이 위) · {USE_SERVER ? '진짜 서버' : '가짜 API'}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => app.setLogs([])}>기록 지우기</button>
      </div>
      <div>
        {app.logs.map(l => (
          <div key={l.id} className="log-row">
            <span className="log-time">{l.at}</span>
            <span className={'method m-' + l.method}>{l.method === 'EXT' ? '외부' : l.method}</span>
            <span className="api-path">{l.path} <b className={l.ok ? 'st-ok' : 'st-err'}>{l.status}</b></span>
            {l.note && <span className="log-note">{l.note}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

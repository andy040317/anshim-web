// 여러 화면에서 같이 쓰는 작은 부품들
import { useApp } from '../AppContext';
import Icon from './Icon';

// 이름표 + 입력칸 + 안내/오류 문구
export function Field({ id, label, type = 'text', value, onChange, placeholder, msg, msgKind, autoComplete, right, inputMode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-row">
        <input id={id} className="input" type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode}
          aria-invalid={msg && msgKind === 'err' ? 'true' : 'false'} aria-describedby={msg ? id + '-msg' : undefined}
          onChange={e => onChange(e.target.value)} />
        {right}
      </div>
      {msg && <p id={id + '-msg'} className={'field-msg ' + (msgKind || '')}>{msg}</p>}
    </div>
  );
}

// 화면 위쪽 제목 줄
export function TopBar({ title, sub, onBack, right }) {
  return (
    <header className="topbar">
      {onBack && <button className="icon-btn" aria-label="뒤로 가기" onClick={onBack}><Icon name="back" size={22} /></button>}
      <div style={{ flex: 1, minWidth: 0, paddingLeft: onBack ? 0 : 8 }}>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

// 하단 탭 (지도 / 보호자 / 내 정보) + 안내 중이면 돌아가기 줄
export function TabBar({ current }) {
  const app = useApp();
  const tabs = [['main', 'map', '지도'], ['guardians', 'users', '보호자'], ['myinfo', 'user', '내 정보']];
  const guiding = app.guide && !app.guide.arrived;
  return (
    <>
      {guiding && (
        <button className="resume-bar" onClick={() => app.go('guide')}>
          <Icon name="map" size={16} /><span className="grow">{app.guide.dest.name}(으)로 안내 중이에요 · 안내 화면으로 돌아가기</span>
        </button>
      )}
      <nav className="tabbar" aria-label="주요 메뉴">
        {tabs.map(([key, icon, label]) => (
          <button key={key} className="tab" aria-current={current === key ? 'page' : undefined} onClick={() => app.go(key)}>
            <Icon name={icon} size={22} />{label}
          </button>
        ))}
      </nav>
    </>
  );
}

// 아래에서 올라오는 시트
export function Sheet({ label, onClose, children }) {
  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-handle" />
        {children}
      </section>
    </div>
  );
}

// 켜고 끄는 스위치
export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked ? 'true' : 'false'} className="switch-row" disabled={disabled} onClick={() => onChange(!checked)}>
      <span>{label}{hint && <small>{hint}</small>}</span>
      <span className="switch" aria-hidden="true" />
    </button>
  );
}

// 글자 복사 버튼 (복사가 막힌 환경이면 안내)
export function CopyButton({ text, label = '복사' }) {
  const app = useApp();
  const fail = () => app.showToast('복사하지 못했어요. 글자를 길게 눌러 직접 복사해 주세요.');
  const copy = () => {
    try { navigator.clipboard.writeText(text).then(() => app.showToast('복사했어요.'), fail); } catch (e) { fail(); }
  };
  return <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Icon name="copy" size={16} />{label}</button>;
}

// 심야/주간 표시
export function TimePill({ night, text }) {
  return (
    <span className={'time-pill ' + (night ? 'night' : 'day')}>
      <Icon name={night ? 'moon' : 'sun'} size={13} />{text || (night ? '심야 가중치 적용 중' : '주간 기준')}
    </span>
  );
}

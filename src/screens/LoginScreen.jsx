// 로그인 화면 (UC-01 / FR-01)
import { useState } from 'react';
import { useApp } from '../AppContext';
import { Field } from '../components/ui';
import Icon from '../components/Icon';

export default function LoginScreen() {
  const app = useApp();
  const [id, setId] = useState(app.prefillId || '');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = e => {
    e.preventDefault();
    if (!id.trim() || !pw) { setErr('아이디와 비밀번호를 입력해 주세요.'); return; }
    setBusy(true);
    setErr('');
    app.login(id.trim(), pw).catch(er => { setErr(er.message); setBusy(false); });
  };

  return (
    <div className="screen">
      <div className="scroll pad">
        <div className="brand">
          <div className="brand-mark"><Icon name="shield" size={28} /></div>
          <h1 className="brand-name">안심귀갓길</h1>
          <p className="brand-sub">대구 공공데이터로 밤길 도보 경로를 비교해요.</p>
        </div>
        <form className="stack" onSubmit={submit} noValidate>
          <Field id="login-id" label="아이디" value={id} onChange={setId} autoComplete="username" />
          <Field id="login-pw" label="비밀번호" type="password" value={pw} onChange={setPw} autoComplete="current-password" />
          {err && <p className="form-error" role="alert"><Icon name="alert" size={16} />{err}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '확인하는 중…' : '로그인'}</button>
          <div className="demo-hint">
            <span>시연용 계정 <b className="mono">demo</b> / <b className="mono">safe1234</b></span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setId('demo'); setPw('safe1234'); setErr(''); }}>채우기</button>
          </div>
          <p className="center muted">처음이신가요?<button type="button" className="link-btn" onClick={() => app.go('signup')}>회원가입</button></p>
        </form>
      </div>
    </div>
  );
}

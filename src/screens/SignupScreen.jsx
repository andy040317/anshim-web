// 회원가입 화면 (UC-01 / FR-01): 아이디 중복 확인, 비밀번호 규칙, 필수 동의
import { useState } from 'react';
import { useApp } from '../AppContext';
import { Field, TopBar } from '../components/ui';
import Icon from '../components/Icon';

export default function SignupScreen() {
  const app = useApp();
  const [f, setF] = useState({ name: '', id: '', pw: '', pw2: '', agree: false });
  const [idState, setIdState] = useState(null); // null | 'checking' | 'ok' | 'taken'
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  // 아이디를 고치면 중복 확인을 다시 해야 함
  const set = (k, v) => { setF(p => ({ ...p, [k]: v })); if (k === 'id') setIdState(null); };

  const checkId = () => {
    if (!/^[a-z0-9]{4,12}$/.test(f.id)) { setErrs(p => ({ ...p, id: '아이디는 영문 소문자·숫자 4~12자로 입력해 주세요.' })); return; }
    setErrs(p => ({ ...p, id: undefined }));
    setIdState('checking');
    app.checkId(f.id)
      .then(r => setIdState(r.available ? 'ok' : 'taken'))
      .catch(er => { setIdState(null); setFormErr(er.message); });
  };

  const submit = e => {
    e.preventDefault();
    const er = {};
    if (!f.name.trim()) er.name = '이름을 입력해 주세요.';
    if (idState !== 'ok') er.id = idState === 'taken' ? '이미 사용 중인 아이디예요.' : '아이디 중복 확인을 해 주세요.';
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(f.pw)) er.pw = '8자 이상, 영문과 숫자를 함께 넣어 주세요.';
    if (!f.pw2 || f.pw2 !== f.pw) er.pw2 = '비밀번호가 서로 달라요.';
    if (!f.agree) er.agree = '필수 항목에 동의해 주세요.';
    setErrs(er);
    setFormErr('');
    if (Object.keys(er).length) return;
    setBusy(true);
    app.signup({ id: f.id, pw: f.pw, name: f.name.trim() }).catch(x => { setFormErr(x.message); setBusy(false); });
  };

  const idMsg = errs.id || (idState === 'checking' ? '확인하는 중…' : idState === 'ok' ? '사용할 수 있는 아이디예요.'
    : idState === 'taken' ? '이미 사용 중인 아이디예요. (시연: demo, admin)' : '영문 소문자·숫자 4~12자');
  const idKind = errs.id || idState === 'taken' ? 'err' : idState === 'ok' ? 'ok' : '';

  return (
    <div className="screen">
      <TopBar title="회원가입" onBack={() => app.go('login')} />
      <div className="scroll pad">
        <form className="stack" onSubmit={submit} noValidate>
          <Field id="su-name" label="이름" value={f.name} onChange={v => set('name', v)} autoComplete="name" msg={errs.name} msgKind="err" />
          <Field id="su-id" label="아이디" value={f.id} onChange={v => set('id', v.toLowerCase())} autoComplete="username" msg={idMsg} msgKind={idKind}
            right={<button type="button" className="btn btn-secondary btn-sm" onClick={checkId} disabled={!f.id || idState === 'checking'}>중복 확인</button>} />
          <Field id="su-pw" label="비밀번호" type="password" value={f.pw} onChange={v => set('pw', v)} autoComplete="new-password"
            msg={errs.pw || '8자 이상, 영문과 숫자 포함'} msgKind={errs.pw ? 'err' : ''} />
          <Field id="su-pw2" label="비밀번호 확인" type="password" value={f.pw2} onChange={v => set('pw2', v)} autoComplete="new-password" msg={errs.pw2} msgKind="err" />
          <label className="check" htmlFor="su-agree">
            <input id="su-agree" type="checkbox" checked={f.agree} onChange={e => set('agree', e.target.checked)} />
            <span>(필수) 서비스 이용약관과 개인정보 수집·이용에 동의해요.
              {errs.agree && <span className="field-msg err" style={{ display: 'block' }}>{errs.agree}</span>}</span>
          </label>
          {formErr && <p className="form-error" role="alert"><Icon name="alert" size={16} />{formErr}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '가입하는 중…' : '가입하기'}</button>
        </form>
      </div>
    </div>
  );
}

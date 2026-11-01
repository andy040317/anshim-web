// 보호자 관리 (UC-05 / FR-09): 등록·수정·삭제, 연락처 형식 검사, 이용 목적 동의
import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { Field, TopBar, TabBar } from '../components/ui';
import Icon from '../components/Icon';

// 숫자만 입력해도 010-1234-5678 모양으로 바꿔줌
const formatPhone = v => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
  return d.slice(0, 3) + '-' + d.slice(3, d.length - 4) + '-' + d.slice(-4);
};

export default function GuardianScreen() {
  const app = useApp();
  const [form, setForm] = useState(null); // null 이면 목록, 아니면 등록·수정 폼
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => { app.call('GET', '/guardians', () => true, { note: '내 보호자 목록' }).catch(() => setLoadErr(true)); }, []);

  const openNew = () => { setForm({ name: '', phone: '', agree: false }); setErrs({}); };
  const openEdit = g => { setForm({ ...g, agree: true }); setErrs({}); };
  const save = e => {
    e.preventDefault();
    const er = {};
    if (!form.name.trim()) er.name = '이름을 입력해 주세요.';
    if (!/^01[016789]-\d{3,4}-\d{4}$/.test(form.phone)) er.phone = '휴대폰 번호 형식이 아니에요. 예: 010-1234-5678';
    if (!form.agree) er.agree = '이용 목적을 확인하고 동의해 주세요.';
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const data = { id: form.id, name: form.name.trim(), phone: form.phone };
    (form.id ? app.updateGuardian(data) : app.addGuardian(data))
      .then(() => { app.showToast(form.id ? '보호자 정보를 고쳤어요.' : '보호자를 등록했어요.'); setForm(null); })
      .catch(x => setErrs({ form: x.message }))
      .finally(() => setBusy(false));
  };
  const del = g => app.removeGuardian(g.id)
    .then(() => { app.showToast(g.name + '님을 보호자에서 삭제했어요.'); setConfirmDel(null); })
    .catch(x => app.showToast(x.message));

  return (
    <div className="screen">
      <TopBar
        title={form ? (form.id ? '보호자 정보 수정' : '보호자 등록') : '보호자 관리'}
        sub={form ? null : '위치공유와 SOS 때 연락할 사람'}
        onBack={form ? () => setForm(null) : null}
        right={!form && app.guardians.length > 0 && <button className="btn btn-primary btn-sm" onClick={openNew}><Icon name="plus" size={16} />등록</button>}
      />
      <div className="scroll pad">
        {form ? (
          <form className="stack" onSubmit={save} noValidate>
            <Field id="g-name" label="부를 이름" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="예: 친구" msg={errs.name} msgKind="err" />
            <Field id="g-phone" label="휴대폰 번호" type="tel" inputMode="numeric" autoComplete="tel" value={form.phone}
              onChange={v => setForm(f => ({ ...f, phone: formatPhone(v) }))} placeholder="010-0000-0000" msg={errs.phone} msgKind="err" />
            <label className="check" htmlFor="g-agree">
              <input id="g-agree" type="checkbox" checked={form.agree} onChange={e => setForm(f => ({ ...f, agree: e.target.checked }))} />
              <span>이 번호로 위치공유 링크와 긴급 상황 정보를 보내는 것에 동의해요. 보호자에게도 미리 알려 주세요.
                {errs.agree && <span className="field-msg err" style={{ display: 'block' }}>{errs.agree}</span>}</span>
            </label>
            {errs.form && <p className="form-error" role="alert"><Icon name="alert" size={16} />{errs.form}</p>}
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>취소</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장하는 중…' : '저장'}</button>
            </div>
          </form>
        ) : (
          <div className="stack">
            {loadErr && <p className="form-error" role="alert"><Icon name="alert" size={16} />목록을 새로 불러오지 못했어요. 마지막으로 받은 목록을 보여드려요.</p>}
            {app.guardians.length === 0 ? (
              <div className="empty stack" style={{ alignItems: 'center' }}>
                <span>등록된 보호자가 없어요. 보호자를 등록하면 안내 중에 위치를 공유하고, SOS 때 긴급 공유를 보낼 수 있어요.</span>
                <button className="btn btn-primary btn-sm" onClick={openNew}><Icon name="plus" size={16} />보호자 등록하기</button>
              </div>
            ) : (
              <ul className="g-list">
                {app.guardians.map(g => (
                  <li key={g.id} className="g-item">
                    <span className="g-avatar" aria-hidden="true">{g.name.slice(0, 1)}</span>
                    <div className="grow"><b>{g.name}</b><small className="mono">{g.phone}</small></div>
                    {confirmDel === g.id ? (
                      <>
                        <button className="btn btn-danger btn-sm" onClick={() => del(g)}>삭제</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(null)}>취소</button>
                      </>
                    ) : (
                      <>
                        <button className="icon-btn" aria-label={g.name + ' 정보 수정'} onClick={() => openEdit(g)}><Icon name="edit" size={18} /></button>
                        <button className="icon-btn" aria-label={g.name + ' 삭제'} onClick={() => setConfirmDel(g.id)}><Icon name="trash" size={18} /></button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="note-box">
              <b style={{ color: 'var(--text)' }}>보호자 정보는 이렇게 쓰여요</b>
              <ul className="dot-list">
                <li>안내 중 위치공유 링크를 문자로 보낼 때</li>
                <li>SOS를 실행했을 때 긴급 위치공유</li>
                <li>내가 등록한 보호자 정보만 보고 고칠 수 있어요</li>
              </ul>
            </div>
          </div>
        )}
      </div>
      {!form && <TabBar current="guardians" />}
    </div>
  );
}

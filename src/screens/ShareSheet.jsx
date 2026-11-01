// 위치공유 시작 시트 (FR-10): 보호자 고르기 → 동의 → 링크 생성 → 문자 내용 확인
import { useState } from 'react';
import { useApp } from '../AppContext';
import { Sheet, CopyButton } from '../components/ui';
import Icon from '../components/Icon';
import { fmtClock } from '../lib/geo';
import { SHARE_EXPIRE_MIN } from '../config';

export default function ShareSheet() {
  const app = useApp();
  const [picked, setPicked] = useState(() => app.guardians.map(g => g.id));
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [made, setMade] = useState(null);
  const close = () => app.setSheet(null);

  if (!app.guardians.length) return (
    <Sheet label="위치공유" onClose={close}>
      <div className="sheet-hero"><span className="big-ic accent"><Icon name="users" size={26} /></span><h2>등록된 보호자가 없어요</h2><p className="muted">보호자를 먼저 등록하면 위치공유 링크를 보낼 수 있어요.</p></div>
      <button className="btn btn-primary" onClick={() => { close(); app.go('guardians'); }}>보호자 등록하러 가기</button>
      <button className="btn btn-ghost" onClick={close}>닫기</button>
    </Sheet>
  );

  const create = () => {
    if (!picked.length) { setErr('공유할 보호자를 한 명 이상 골라 주세요.'); return; }
    if (!agree) { setErr('위치공유에 동의해야 링크를 만들 수 있어요.'); return; }
    setBusy(true);
    setErr('');
    app.createShare(picked, 'normal').then(s => setMade(s)).catch(e => setErr(e.message)).finally(() => setBusy(false));
  };

  if (made) {
    const link = 'https://anshim.example/s/' + made.token; // 실제 서비스 도메인이 정해지면 바뀜
    const names = app.guardians.filter(g => made.guardianIds.includes(g.id)).map(g => g.name).join(', ');
    const msg = '[안심귀갓길] ' + (app.me ? app.me.name : '사용자') + '님이 귀갓길 위치를 공유했어요. 도착하거나 ' + fmtClock(made.expiresAt) + '이 지나면 링크가 닫혀요.\n' + link;
    return (
      <Sheet label="위치공유 링크" onClose={close}>
        <div className="sheet-hero"><span className="big-ic good"><Icon name="link" size={26} /></span><h2>공유 링크를 만들었어요</h2><p className="muted">{names}에게 보낼 문자 내용이에요. 내용을 확인하고 직접 보내 주세요.</p></div>
        <div className="field"><label htmlFor="share-msg">문자 내용</label><textarea id="share-msg" className="input msg" rows={4} readOnly value={msg} /></div>
        <div className="btn-row">
          <CopyButton text={msg} label="내용 복사" />
          <button className="btn btn-secondary btn-sm" onClick={() => app.showToast('실제 앱에서는 문자 앱이 열려요. 시연에서는 열지 않아요.')}><Icon name="message" size={16} />문자 앱 열기</button>
        </div>
        <p className="small muted">문자를 실제로 보냈는지는 앱이 알 수 없어서 ‘보냈어요’라고 표시하지 않아요.</p>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => { close(); app.setViewAs('guardian'); }}><Icon name="eye" size={16} />보호자 화면 보기</button>
          <button className="btn btn-primary" onClick={close}>확인</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet label="위치공유 시작" onClose={close}>
      <h2>보호자에게 위치 공유</h2>
      <p className="muted small">고른 보호자는 로그인 없이 링크로 내 위치와 이동 경로를 볼 수 있어요.</p>
      <fieldset className="pick-list">
        <legend className="small muted">공유할 보호자</legend>
        {app.guardians.map(g => (
          <label key={g.id} className="pick" htmlFor={'pick-' + g.id}>
            <input id={'pick-' + g.id} type="checkbox" checked={picked.includes(g.id)}
              onChange={e => setPicked(p => (e.target.checked ? [...p, g.id] : p.filter(x => x !== g.id)))} />
            <span className="grow"><b>{g.name}</b><small className="mono">{g.phone}</small></span>
          </label>
        ))}
      </fieldset>
      <ul className="dot-list small muted">
        <li>도착하거나 직접 종료하면 링크가 바로 닫혀요.</li>
        <li>{SHARE_EXPIRE_MIN}분이 지나면 자동으로 만료돼요.</li>
        <li>공유가 끝난 위치 정보는 삭제돼요.</li>
      </ul>
      <label className="check" htmlFor="share-agree">
        <input id="share-agree" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
        <span>위 내용을 확인했고 위치공유에 동의해요.</span>
      </label>
      {err && <p className="form-error" role="alert"><Icon name="alert" size={16} />{err}</p>}
      <button className="btn btn-primary" disabled={busy} onClick={create}>{busy ? '링크를 만드는 중…' : '공유 링크 만들기'}</button>
    </Sheet>
  );
}

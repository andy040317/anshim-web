// 위치 동의 화면 (FR-02): 목적 안내 → 동의 / 거부(출발지 직접 입력)
import { useState } from 'react';
import { useApp } from '../AppContext';
import Icon from '../components/Icon';

const PURPOSES = [
  ['map', '현재 위치 표시와 경로 안내'],
  ['refresh', '경로 이탈·도착 판단 (30m 기준)'],
  ['users', '보호자 위치공유와 SOS 신고 문안'],
];

export default function ConsentScreen() {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const decide = ok => { setBusy(true); app.decideConsent(ok).catch(() => setBusy(false)); };
  return (
    <div className="screen">
      <div className="scroll pad">
        <div className="stack" style={{ gap: 22 }}>
          <div className="brand-mark"><Icon name="pin" size={26} /></div>
          <div className="stack" style={{ gap: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>위치 정보 사용에 동의해 주세요</h1>
            <p className="muted">{app.me ? app.me.name + '님의 ' : ''}현재 위치를 아래 목적에만 사용해요.</p>
          </div>
          <ul className="consent-list">
            {PURPOSES.map(([ic, t]) => (
              <li key={t} className="consent-item"><span className="ic"><Icon name={ic} size={18} /></span><span style={{ paddingTop: 7 }}>{t}</span></li>
            ))}
          </ul>
          <p className="note-box">동의하면 브라우저가 위치 권한을 한 번 더 물어봐요. 안내와 공유가 끝나면 위치 정보는 삭제돼요. 동의하지 않아도 지도를 누르거나 검색해서 출발지를 정할 수 있어요.</p>
          <div className="stack" style={{ gap: 10 }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => decide(true)}>동의하고 시작하기</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => decide(false)}>동의하지 않고 계속하기</button>
          </div>
        </div>
      </div>
    </div>
  );
}

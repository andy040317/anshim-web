// 내 정보 (FR-02, SIR-02): 위치 동의 변경, 알림(웹 푸시 지원 여부), 로그아웃
import { useState } from 'react';
import { useApp } from '../AppContext';
import { TopBar, TabBar, Switch } from '../components/ui';
import Icon from '../components/Icon';

export default function MyInfoScreen() {
  const app = useApp();
  const [notif, setNotif] = useState(true);
  const pushOk = 'PushManager' in window && 'serviceWorker' in navigator; // 이 브라우저가 웹 푸시를 지원하는지
  const denied = app.consent === false;
  const name = app.me ? app.me.name : '사용자';

  const toggleConsent = () => {
    const next = denied; // 지금 거부 상태면 동의로, 아니면 철회로
    app.call('PUT', '/users/me/consents', () => true, { note: '위치 동의: ' + (next ? '동의' : '철회') })
      .then(() => {
        app.setConsent(next);
        if (!next && app.guide) { app.endGuide(); app.go('myinfo'); } // 권한을 끄면 추적 중단 (FR-07)
        app.showToast(next ? '위치 사용에 동의했어요.' : '위치 동의를 철회했어요. 위치 추적을 멈췄어요.');
      })
      .catch(e => app.showToast(e.message));
  };

  return (
    <div className="screen">
      <TopBar title="내 정보" />
      <div className="scroll pad">
        <div className="stack">
          <div className="profile">
            <span className="g-avatar big" aria-hidden="true">{name.slice(0, 1)}</span>
            <div><b>{name}</b><small className="mono">{app.me ? app.me.id : ''}</small></div>
          </div>
          <section className="set-group" aria-label="권한과 알림">
            <h2 className="sec-label">권한과 알림</h2>
            <div className="set-row">
              <div className="grow"><b>위치 정보 사용</b><small>{denied ? '동의 안 함 · 출발지를 직접 정해요' : '동의함 · 안내와 공유가 끝나면 삭제돼요'}</small></div>
              <button className="btn btn-ghost btn-sm" onClick={toggleConsent}>{denied ? '동의하기' : '동의 철회'}</button>
            </div>
            <Switch checked={notif} onChange={setNotif} label="이탈·도착 알림"
              hint={pushOk ? '이 브라우저는 웹 푸시를 지원해요.' : '이 브라우저는 웹 푸시를 지원하지 않아 화면 안 메시지로 알려요.'} />
          </section>
          <section className="set-group" aria-label="서비스 정보">
            <h2 className="sec-label">서비스 정보</h2>
            <div className="set-row"><div className="grow"><b>서비스 지역</b><small>대구광역시 전체 (군위군 포함)</small></div></div>
            <div className="set-row"><div className="grow"><b>위험도 안내</b><small>경로끼리 비교하기 위한 상대 지표예요. 실제 안전을 보장하지 않아요.</small></div></div>
            {/* 지금 반영된 데이터: public/data/risk/ (구간 위험도) + public/data/*.json (안전시설 위치) 기준 */}
            <div className="set-row"><div className="grow"><b>지금 반영된 데이터</b><small>위험도: 범죄주의구간·시간대별 유동인구·CCTV·안전비상벨·보안등·유흥주점·길 종류 · 안전시설: 지구대·파출소·119안전센터·편의점 (대구 기준)</small></div></div>
          </section>
          <button className="btn btn-ghost" onClick={app.logout}><Icon name="logout" size={18} />로그아웃</button>
        </div>
      </div>
      <TabBar current="myinfo" />
    </div>
  );
}

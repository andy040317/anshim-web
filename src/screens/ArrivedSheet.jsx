// 도착 안내 시트 (FR-08: 목적지 30m 안 → 안내 종료, 일반 위치공유도 종료)
import { useApp } from '../AppContext';
import { Sheet } from '../components/ui';
import Icon from '../components/Icon';
import { fmtDist } from '../lib/geo';

export default function ArrivedSheet() {
  const app = useApp();
  const g = app.guide;
  const ended = app.share && app.share.reason === 'arrived';
  const close = () => app.endGuide();
  return (
    <Sheet label="도착 안내" onClose={close}>
      <div className="sheet-hero">
        <span className="big-ic good"><Icon name="check" size={28} /></span>
        <h2>{g ? g.dest.name : '목적지'}에 도착했어요</h2>
        <p className="muted">목적지 반경 30m 안에 들어와서 안내를 마쳤어요.</p>
      </div>
      {ended && <p className="note-box">보호자 위치공유도 함께 종료했어요. 보낸 링크는 더 이상 열리지 않아요.</p>}
      {g && (
        <div className="stat-grid two">
          <div className="stat"><span>걸은 거리</span><b>{fmtDist(g.total)}</b></div>
          <div className="stat"><span>도착 시각</span><b>{app.clockText}</b></div>
        </div>
      )}
      <button className="btn btn-primary" onClick={close}>확인</button>
    </Sheet>
  );
}

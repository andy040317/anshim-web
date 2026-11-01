// 지도에서 누른 지점을 출발지/도착지로 고르는 시트 (카카오 좌표→주소 변환 사용)
import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { Sheet } from '../components/ui';
import Icon from '../components/Icon';
import { loadKakaoMap } from '../lib/loadKakaoMap';
import { inDaegu } from '../lib/geo';

export default function PickSheet() {
  const app = useApp();
  const p = app.pickPoint;
  const [addr, setAddr] = useState(null); // null = 찾는 중, '' = 주소 없음

  useEffect(() => {
    if (!p) return;
    let alive = true;
    setAddr(null);
    loadKakaoMap()
      .then(kakao => {
        const geocoder = new kakao.maps.services.Geocoder();
        // 주의: 카카오 주소 변환은 (경도, 위도) 순서
        geocoder.coord2Address(p.lng, p.lat, (res, status) => {
          if (!alive) return;
          if (status === kakao.maps.services.Status.OK && res[0]) {
            const r = res[0];
            setAddr((r.road_address && r.road_address.address_name) || r.address.address_name);
            app.pushLog('EXT', '카카오 좌표→주소 변환', 200, '누른 지점 주소');
          } else setAddr('');
        });
      })
      .catch(() => { if (alive) setAddr(''); });
    return () => { alive = false; };
  }, [p && p.lat, p && p.lng]);

  if (!p) return null;
  const close = () => app.setSheet(null);
  const inside = inDaegu(p);
  const coord = p.lat.toFixed(5) + ', ' + p.lng.toFixed(5);
  const place = { lat: p.lat, lng: p.lng, name: addr || '지도에서 고른 위치', addr: addr || coord };

  return (
    <Sheet label="지도에서 고른 위치" onClose={close}>
      <div className="pick-head">
        <span className="big-ic accent"><Icon name="pin" size={24} /></span>
        <div style={{ minWidth: 0 }}>
          <h2>{addr === null ? '주소를 찾는 중…' : addr || '주소 정보가 없는 위치'}</h2>
          <p className="small muted mono">{coord}</p>
        </div>
      </div>
      {!inside ? (
        <p className="form-error" role="alert"><Icon name="alert" size={16} />서비스 지역(대구) 밖이에요. 대구 안에서 골라 주세요.</p>
      ) : (
        <div className="btn-row">
          <button className="btn btn-secondary" onClick={() => app.choosePlace('start', place)}>출발지로</button>
          <button className="btn btn-primary" onClick={() => app.choosePlace('dest', place)}>도착지로</button>
        </div>
      )}
      <button className="btn btn-ghost" onClick={close}>닫기</button>
    </Sheet>
  );
}

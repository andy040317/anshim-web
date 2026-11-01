// 카카오맵 스크립트를 한 번만 불러오는 함수
// 사용: loadKakaoMap().then(kakao => { new kakao.maps.Map(...) })
import { KAKAO_KEY } from '../config';

// 지금 접속한 주소를 그대로 보여줌 (PC: http://localhost:5173, 배포: https://○○.vercel.app)
const SETUP_HINT =
  '카카오 디벨로퍼스에서 ① JavaScript 키 ② 도메인 ' + window.location.origin + ' 등록 ③ 카카오맵 사용 설정 ON 을 확인해 주세요.';

let promise = null;

export function loadKakaoMap() {
  // 이미 불러왔으면 바로 사용
  if (window.kakao && window.kakao.maps && window.kakao.maps.LatLng) return Promise.resolve(window.kakao);
  if (promise) return promise;

  promise = new Promise((resolve, reject) => {
    if (!KAKAO_KEY || KAKAO_KEY.includes('여기에')) {
      // 배포 사이트에서 이 문구가 나오면: Vercel 프로젝트 Settings → Environment Variables 에 키를 넣고 Redeploy
      reject(new Error('카카오 키가 없어요. PC에서는 .env 파일에, 배포 사이트는 Vercel의 Environment Variables에 VITE_KAKAO_JS_KEY를 넣어 주세요.'));
      return;
    }
    // 10초 안에 준비되지 않으면 설정 문제로 보고 안내
    const timer = setTimeout(() => reject(new Error('지도를 준비하지 못했어요. ' + SETUP_HINT)), 10000);
    const script = document.createElement('script');
    // autoload=false: 스크립트를 받은 뒤 kakao.maps.load()로 직접 시작
    // libraries=services: 장소 검색·주소 변환 기능 포함
    script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + KAKAO_KEY + '&autoload=false&libraries=services';
    script.onload = () => {
      if (!window.kakao || !window.kakao.maps) {
        clearTimeout(timer);
        reject(new Error('카카오 지도 스크립트가 이상해요. ' + SETUP_HINT));
        return;
      }
      window.kakao.maps.load(() => { clearTimeout(timer); resolve(window.kakao); });
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('카카오 지도 스크립트를 받지 못했어요. 인터넷 연결과 키를 확인해 주세요.'));
    };
    document.head.appendChild(script);
  }).catch(err => {
    promise = null; // 다음에 다시 시도할 수 있게 비움
    throw err;
  });
  return promise;
}

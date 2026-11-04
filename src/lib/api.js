// 백엔드(FastAPI) 서버 호출 도우미
// 사용: request('POST', '/auth/login', { body: { id, pw } }) → 서버가 준 JSON
// 실패하면 가짜 API 와 같은 모양 { status, code, message } 로 던짐 → 화면 코드는 그대로 e.message 를 보여주면 됨
import { API_URL } from '../config';

const NETWORK_ERROR = { code: 'NETWORK', message: '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.' };

export async function request(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token; // 로그인 토큰
  let res;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw { status: '연결 실패', ...NETWORK_ERROR }; // 서버가 꺼져 있거나 인터넷이 끊김
  }
  if (res.status === 204) return null; // 성공했지만 돌려줄 내용 없음
  let data = null;
  try { data = await res.json(); } catch (e) { /* JSON 이 아닌 응답 */ }
  if (!res.ok) {
    throw { status: res.status, code: (data && data.code) || 'HTTP_' + res.status, message: (data && data.message) || '서버에서 오류가 났어요. 잠시 뒤 다시 시도해 주세요.', data };
  }
  return data;
}

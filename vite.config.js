import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 카카오에 등록한 주소(http://localhost:5173)와 항상 같도록 포트를 5173으로 고정
// 다른 프로그램이 5173을 쓰고 있으면 다른 포트로 바꾸지 않고 에러로 알려줌
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});

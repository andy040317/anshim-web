// 앱 전체 상태와 동작을 화면들에 나눠주는 통로
// 화면에서는 const app = useApp(); 으로 꺼내 씀 (App.jsx 의 ctx 참고)
import { createContext, useContext } from 'react';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyFontSize, readSavedFontSize } from './hooks/useFontSize';
import './lib/install'; // 크롬의 설치 가능 알림을 놓치지 않게 먼저 받아 둔다
import { LS, lsDel } from './lib/storage';
import './styles/global.css';

// 예전 공용 직원 비밀번호·체험 모드 데이터가 기기에 남아 있으면 지운다
LS.legacy.forEach(lsDel);

// 첫 화면이 그려지기 전에 저장된 글자 크기를 적용한다
applyFontSize(readSavedFontSize());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

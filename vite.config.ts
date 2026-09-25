import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // 엑셀 내려받기용 라이브러리(exceljs, 약 0.9MB)는 버튼을 눌렀을 때만 따로 불러오므로 경고 기준을 넉넉히
    chunkSizeWarningLimit: 1000,
  },
});

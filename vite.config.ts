import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 纯前端工作台：构建产物为静态文件，不调用任何外部服务。
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});

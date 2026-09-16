import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 配置：测试前自动启动 vite preview（verify 容器内已先执行 build）。
 * 端口固定 4173，与应用本身的 WEB_PORT 无关。
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

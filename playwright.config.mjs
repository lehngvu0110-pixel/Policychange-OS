import { defineConfig, devices } from '@playwright/test';

// Chạy ở chế độ Ngoại tuyến (?offline=1) để kết quả không phụ thuộc mạng hay dữ liệu dùng chung.
// Trên máy đã có Chromium sẵn: PW_CHROMIUM=/đường/dẫn/chrome npm run e2e
const executablePath = process.env.PW_CHROMIUM || undefined;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', launchOptions: { executablePath } },
  webServer: { command: 'node scripts/serve.mjs', env: { PORT: '4173' }, url: 'http://localhost:4173/index.html', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, testMatch: /layout\.spec/ }
  ]
});

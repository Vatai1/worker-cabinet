import { defineConfig, devices } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:4175'

export default defineConfig({
  testDir: './e2e/timesheet/visual',
  testMatch: '**/*.visual.ts',
  outputDir: './test-results/visual',
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: {
    timeout: 30_000,
    toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.001 },
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    viewport: { width: 1360, height: 900 },
    locale: 'ru-RU',
    timezoneId: 'Asia/Sakhalin',
    contextOptions: { reducedMotion: 'reduce' },
  },
  webServer: process.platform === 'win32' ? undefined : {
    command: 'vite --config e2e/timesheet/visual/vite.config.ts --host 127.0.0.1 --port 4175 --strictPort',
    url: `${BASE_URL}/e2e/timesheet/visual/index.html`,
    env: { BROWSER: 'none', VITE_API_BASE_URL: '/api' },
  },
})

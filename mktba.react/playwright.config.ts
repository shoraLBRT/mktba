import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// E2E smoke against a real API and a throwaway PostgreSQL database (see README, "E2E").
// The API applies migrations at startup; e2e/setup.mjs registers the admin and seeds content.
const isCI = !!process.env.CI;
const API_URL = 'http://localhost:5172';
const APP_URL = 'http://localhost:5173';
const DB_CONNECTION =
  process.env.E2E_DB_CONNECTION ??
  'Host=localhost;Port=5432;Database=mktba_e2e;Username=mktba;Password=mktba_dev';
// A fresh key per run: tokens only have to outlive one test run.
const JWT_SIGNING_KEY = process.env.E2E_JWT_SIGNING_KEY ?? randomBytes(48).toString('base64');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: APP_URL,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
    },
  ],
  webServer: [
    {
      // In CI the solution is already built in Release.
      command: `dotnet run --project ../Mktba.Api --no-launch-profile ${isCI ? '--configuration Release --no-build ' : ''}-- --urls ${API_URL} --environment Development`,
      url: `${API_URL}/auth/status`,
      env: {
        ConnectionStrings__DefaultConnection: DB_CONNECTION,
        Auth__JwtSigningKey: JWT_SIGNING_KEY,
        // Every test logs in from 127.0.0.1; keep the per-IP auth limit out of the way.
        RateLimiting__Auth__PermitLimit: '1000',
        // A developer's appsettings.local.json may hold a real GitHub App key: e2e never files issues.
        Feedback__GitHub__Enabled: 'false',
        // Nor does it ping IndexNow, whatever the local settings hold.
        IndexNow__Enabled: 'false',
      },
      // Never reuse an API that is already running: it may point at a database with real data.
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      // Test tokens for the webmaster verification tags (O-12, #61); crawler.spec checks them.
      env: { YANDEX_VERIFICATION: 'e2e-yandex-token', GOOGLE_SITE_VERIFICATION: 'e2e-google-token' },
      url: APP_URL,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});

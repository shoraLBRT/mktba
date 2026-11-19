import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test as setup } from '@playwright/test';
import { adminCredentials } from './helpers';

setup('register the admin and seed content', () => {
  const { email, password } = adminCredentials();
  execFileSync(process.execPath, [fileURLToPath(new URL('./setup.mjs', import.meta.url))], {
    env: { ...process.env, E2E_ADMIN_EMAIL: email, E2E_ADMIN_PASSWORD: password },
    stdio: 'inherit',
  });
});

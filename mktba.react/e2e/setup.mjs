#!/usr/bin/env node
// Prepares a throwaway database for the Playwright smoke tests: registers the first admin
// (or logs in when it already exists) and seeds the demo content from scripts/demo-content.json
// when the navigation tree is still empty. Safe to run more than once.
//
//   E2E_ADMIN_EMAIL=e2e@mktba.local E2E_ADMIN_PASSWORD=<random> node e2e/setup.mjs
//
// E2E_API_URL defaults to http://localhost:5172. Never point it at a database you care about.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = (process.env.E2E_API_URL ?? 'http://localhost:5172').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const SEED_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'seed-demo-content.mjs');

if (!EMAIL || !PASSWORD) {
  console.error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required.');
  process.exit(1);
}

const call = async (method, path, body) => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
  }
  return text.trim() ? JSON.parse(text) : null;
};

const waitForApi = async (seconds = 120) => {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    try {
      return await call('GET', '/auth/status');
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`API at ${API} is not up: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
};

const status = await waitForApi();
if (status.requiresBootstrapAdmin) {
  await call('POST', '/auth/register', { email: EMAIL, password: PASSWORD });
  console.log(`Registered the first admin ${EMAIL}.`);
} else {
  await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  console.log(`Admin ${EMAIL} already exists and can log in.`);
}

const tree = await call('GET', '/navigationTree/tree');
if (Array.isArray(tree) && tree.length > 0) {
  console.log('Content already seeded.');
} else {
  const seed = spawnSync(
    process.execPath,
    [SEED_SCRIPT, '--api', API, '--email', EMAIL, '--password', PASSWORD],
    { stdio: 'inherit' },
  );
  if (seed.status !== 0) process.exit(seed.status ?? 1);
}

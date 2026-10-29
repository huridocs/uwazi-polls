// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .forEach(line => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]]) return;
      let v = m[2];
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    });
}

// Prefer CI-generated env, then local .env
loadEnvFile(path.join(__dirname, '.env.ci'));
loadEnvFile(path.join(__dirname, '.env'));

// Optional pages.local.json overrides for admin/player paths
const pagesLocal = path.join(__dirname, 'pages.local.json');
if (fs.existsSync(pagesLocal) && !process.env.POLL_ADMIN_PATH) {
  try {
    const meta = JSON.parse(fs.readFileSync(pagesLocal, 'utf8'));
    if (meta.admin && meta.admin.path) process.env.POLL_ADMIN_PATH = meta.admin.path;
    if (meta.player && meta.player.path) process.env.POLL_PLAYER_PATH = meta.player.path;
    if (meta.hub && meta.hub.path) process.env.POLL_HUB_PATH = meta.hub.path;
    if (meta.host && !process.env.POLL_BASE_URL) process.env.POLL_BASE_URL = meta.host;
  } catch {
    /* ignore */
  }
}

const baseURL = process.env.POLL_BASE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

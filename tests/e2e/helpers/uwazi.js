/**
 * Thin Uwazi HTTP helpers for poll_app Playwright tests.
 * Stay outside the Uwazi repo — talk to a running instance only.
 */

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function config() {
  return {
    baseURL: env('POLL_BASE_URL', 'http://localhost:3000'),
    username: env('POLL_USERNAME', 'admin'),
    password: env('POLL_PASSWORD', 'change this password now'),
    adminPath: env('POLL_ADMIN_PATH', '/en/page/m31vsrxno0p/poll-admin'),
  };
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function apiLogin(request) {
  const { username, password } = config();
  const res = await request.post('/api/login', {
    data: { username, password },
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!res.ok()) {
    throw new Error(`login failed: ${res.status()} ${await res.text()}`);
  }
  return res;
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} method
 * @param {string} path
 * @param {object} [data]
 */
async function api(request, method, path, data) {
  const opts = {
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  };
  if (data !== undefined) opts.data = data;
  const res = await request[method.toLowerCase()](path, opts);
  if (!res.ok()) {
    throw new Error(`${method} ${path} → ${res.status()} ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Copy connect.sid from API storage into the browser context.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function applySessionCookie(context, request) {
  const { baseURL } = config();
  const host = new URL(baseURL).hostname;
  const jar = await request.storageState();
  const cookies = (jar.cookies || []).filter(c => c.name === 'connect.sid');
  if (!cookies.length) {
    throw new Error('No connect.sid after login');
  }
  await context.addCookies(
    cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain || host,
      path: c.path || '/',
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite === 'None' ? 'None' : 'Lax',
    }))
  );
}

module.exports = { config, apiLogin, api, applySessionCookie };

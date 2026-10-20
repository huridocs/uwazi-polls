/**
 * Minimal authenticated Uwazi HTTP client for seed scripts.
 */

export function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export function baseURL() {
  return env('POLL_BASE_URL', 'http://localhost:3000').replace(/\/$/, '');
}

export async function login(username, password) {
  const res = await fetch(`${baseURL()}/api/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`login failed: ${res.status} ${await res.text()}`);
  }
  const cookie = res.headers.getSetCookie?.() || [];
  // Node fetch: getSetCookie may exist; fall back to set-cookie
  let raw = cookie.join('; ');
  if (!raw) {
    const single = res.headers.get('set-cookie');
    if (single) raw = single.split(/,(?=\s*[^;]+=)/).map(s => s.split(';')[0].trim()).join('; ');
  }
  if (!raw.includes('connect.sid')) {
    // undici stores cookies in jar when using credentials — use manual jar
    throw new Error('login did not return connect.sid (check Node version / headers)');
  }
  const sid = raw
    .split(';')
    .map(p => p.trim())
    .find(p => p.startsWith('connect.sid='));
  return sid;
}

export function apiClient(cookieHeader) {
  async function api(method, path, data) {
    const headers = {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookieHeader,
    };
    const opts = { method, headers };
    if (data !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }
    const res = await fetch(`${baseURL()}${path}`, opts);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) {
      throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
    }
    return json;
  }
  return { api };
}

/** Prefer cookie jar via undici Agent if getSetCookie is awkward — simpler login helper. */
export async function withSession(fn) {
  const username = env('POLL_USERNAME', 'admin');
  const password = env('POLL_PASSWORD', 'change this password now');
  const jar = new Map();

  async function raw(method, path, data) {
    const headers = {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (jar.size) {
      headers.Cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const opts = { method, headers };
    if (data !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }
    const res = await fetch(`${baseURL()}${path}`, opts);
    const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of setCookie) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    // Fallback single header
    if (!setCookie.length) {
      const single = res.headers.get('set-cookie');
      if (single) {
        const first = single.split(';')[0];
        const eq = first.indexOf('=');
        if (eq > 0) jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
      }
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) {
      throw new Error(`${method} ${path} → ${res.status} ${String(text).slice(0, 400)}`);
    }
    return json;
  }

  await raw('POST', '/api/login', { username, password });
  return fn(raw);
}

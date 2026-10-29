#!/usr/bin/env node
/**
 * Create or update Poll admin/player Pages from local files and write pages.local.json + .env.ci
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { withSession, env, baseURL } from './lib/uwazi-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function readPageFiles(folder) {
  const dir = folder.replace(/\/$/, '');
  let script = fs.readFileSync(path.join(root, dir, 'script.js'), 'utf8');
  // Admin import/export helpers live in lib/sm-details.js (also unit-tested).
  if (dir === 'admin') {
    const sm = fs.readFileSync(path.join(root, 'lib/sm-details.js'), 'utf8');
    const acl = fs.readFileSync(path.join(root, 'lib/respondents-acl.js'), 'utf8');
    script = sm + '\n' + acl + '\n' + script;
  }
  if (dir === 'player' || dir === 'hub') {
    const acl = fs.readFileSync(path.join(root, 'lib/respondents-acl.js'), 'utf8');
    script = acl + '\n' + script;
  }
  return {
    content: fs.readFileSync(path.join(root, dir, 'content.html'), 'utf8'),
    script,
    css: fs.readFileSync(path.join(root, dir, 'style.css'), 'utf8'),
  };
}

function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

await withSession(async api => {
  const pagesMeta = JSON.parse(fs.readFileSync(path.join(root, 'pages.json'), 'utf8'));
  const existing = await api('GET', '/api/pages');
  const rows = Array.isArray(existing) ? existing : existing.rows || [];

  async function upsert(key, meta) {
    const files = readPageFiles(meta.files);
    const title = meta.title || key;
    let page = rows.find(p => {
      const t = p.title || (p.locales && p.locales.en && p.locales.en.title);
      return t === title;
    });

    if (!page) {
      // Create via editor-shaped payload
      const created = await api('POST', '/api/pages', {
        title,
        metadata: {
          content: files.content,
          script: files.script,
          css: files.css,
        },
        entityView: false,
        markdownSupport: false,
      });
      page = created;
      console.log('created page', title, page.sharedId || page._id);
    }

    // Prefer editor mode update (locales.draft) used by modern Uwazi
    let sharedId = page.sharedId;
    if (!sharedId && page._id) {
      // reload list
      const again = await api('GET', '/api/pages');
      const list = Array.isArray(again) ? again : again.rows || [];
      const found = list.find(p => (p.title || '') === title);
      sharedId = found && found.sharedId;
    }
    if (!sharedId) throw new Error('no sharedId for page ' + title);

    let ed;
    try {
      ed = await api('GET', `/api/page?sharedId=${sharedId}&mode=editor`);
    } catch {
      ed = null;
    }

    if (ed && ed.locales) {
      const locales = ed.locales || {};
      const en = locales.en || {};
      const draft = { ...(en.draft || {}) };
      draft.css = files.css;
      draft.script = files.script;
      draft.content = files.content;
      locales.en = { title: en.title || title, draft };
      await api('POST', '/api/pages', {
        _id: ed._id,
        sharedId: ed.sharedId,
        entityView: ed.entityView || false,
        markdownSupport: ed.markdownSupport || false,
        locales,
      });
      const rel = await api('POST', '/api/pages/release', {
        sharedId,
        release_message: 'uwazi-polls seed',
      });
      console.log('published', title, 'v' + (rel.version || '?'), sharedId);
    } else {
      // Legacy metadata pages
      await api('POST', '/api/pages', {
        _id: page._id,
        sharedId,
        title,
        metadata: {
          content: files.content,
          script: files.script,
          css: files.css,
        },
        entityView: false,
      });
      console.log('updated legacy page', title, sharedId);
    }

    return {
      sharedId,
      path: `/en/page/${sharedId}/${slugifyTitle(title)}`,
      title,
      files: meta.files,
    };
  }

  const admin = await upsert('admin', pagesMeta.admin);
  const player = await upsert('player', pagesMeta.player);
  const hub = await upsert('hub', pagesMeta.hub);

  const local = {
    host: baseURL(),
    admin,
    player,
    hub,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(root, 'pages.local.json'), JSON.stringify(local, null, 2));

  const envCi = [
    `POLL_BASE_URL=${baseURL()}`,
    `POLL_USERNAME=${env('POLL_USERNAME', 'admin')}`,
    `POLL_PASSWORD=${env('POLL_PASSWORD', 'change this password now')}`,
    `POLL_ADMIN_PATH=${admin.path}`,
    `POLL_PLAYER_PATH=${player.path}`,
    `POLL_HUB_PATH=${hub.path}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root, '.env.ci'), envCi);
  // Also refresh .env for local convenience if missing admin path placeholders
  fs.writeFileSync(path.join(root, '.env'), envCi);
  console.log('wrote pages.local.json and .env / .env.ci');
});

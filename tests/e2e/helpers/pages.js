const { api } = require('./uwazi');

/**
 * Path of the published "Poll player" Page on this instance
 * (sharedIds differ between local / OMCT / CI).
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} [lang]
 */
async function pollPlayerPath(request, lang = 'en') {
  const pages = await api(request, 'GET', '/api/pages');
  const rows = Array.isArray(pages) ? pages : pages.rows || [];
  const player = rows.find(p => {
    const t = p.title || (p.locales && p.locales.en && p.locales.en.title) || '';
    return String(t).trim() === 'Poll player';
  });
  if (!player || !player.sharedId) {
    throw new Error('No Page titled "Poll player" on this instance');
  }
  return `/${lang}/page/${player.sharedId}/poll-player`;
}

module.exports = { pollPlayerPath };

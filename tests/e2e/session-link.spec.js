const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie } = require('./helpers/uwazi');
const { createMixedPollFixture } = require('./helpers/fixture');
const { deleteAnswersForSession } = require('./helpers/seed');
const { pollPlayerPath } = require('./helpers/pages');

test.describe('Session copy link', () => {
  /** @type {Awaited<ReturnType<typeof createMixedPollFixture>> | null} */
  let fixture = null;
  /** @type {{ session: object, token: string } | null} */
  let sessionInfo = null;

  test.afterEach(async ({ request }) => {
    if (fixture) {
      await apiLogin(request);
      if (sessionInfo) {
        await deleteAnswersForSession(request, sessionInfo.session.sharedId);
      }
      await fixture.cleanup();
      fixture = null;
      sessionInfo = null;
    }
  });

  test('Copy link uses this instance Poll player path (not a hardcoded sharedId)', async ({
    page,
    context,
    request,
  }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);

    fixture = await createMixedPollFixture(request);
    sessionInfo = await fixture.withSession();

    const expectedPath = await pollPlayerPath(request);
    // Guard against regressing to the old OMCT-only hardcoded id when CI/local differ.
    expect(expectedPath).toMatch(/^\/en\/page\/[^/]+\/poll-player$/);

    const { adminPath, baseURL } = config();
    await page.goto(adminPath);
    await expect(page.locator('#poll-admin #pa-card')).toBeVisible({
      timeout: 30_000,
    });

    const sessionsBtn = page.locator(`.pa-sessions[data-id="${fixture.poll.sharedId}"]`);
    await expect(sessionsBtn).toBeVisible({ timeout: 30_000 });
    await sessionsBtn.click();

    const copyBtn = page.locator('.pa-copy-link');
    await expect(copyBtn).toBeVisible({ timeout: 30_000 });
    expect(await copyBtn.getAttribute('data-token')).toBe(sessionInfo.token);

    // Intercept clipboard — more reliable in CI than permission grants.
    await page.evaluate(() => {
      window.__pollCopiedLink = null;
      navigator.clipboard.writeText = function (text) {
        window.__pollCopiedLink = text;
        return Promise.resolve();
      };
    });
    await copyBtn.click();

    const copied = await page.evaluate(() => window.__pollCopiedLink);
    expect(copied).toBeTruthy();

    const url = new URL(copied);
    expect(url.origin).toBe(new URL(baseURL).origin);
    expect(url.pathname).toBe(expectedPath);
    expect(url.searchParams.get('poll')).toBe(fixture.poll.sharedId);
    expect(url.searchParams.get('token')).toBe(sessionInfo.token);

    // Link should load the player (not 404).
    await page.goto(copied);
    await expect(page.locator('#poll-player #pp-card')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('#pp-card .pp-qtext')).toBeVisible({
      timeout: 30_000,
    });
  });
});

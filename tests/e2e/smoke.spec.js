const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie } = require('./helpers/uwazi');
const { createMixedPollFixture } = require('./helpers/fixture');

test.describe('Smoke', () => {
  /** @type {Awaited<ReturnType<typeof createMixedPollFixture>> | null} */
  let fixture = null;

  test.afterEach(async ({ request }) => {
    if (fixture) {
      await apiLogin(request);
      await fixture.cleanup();
      fixture = null;
    }
  });

  test('admin: login opens poll admin card', async ({ page, context, request }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);

    const { adminPath } = config();
    await page.goto(adminPath);
    await expect(page.locator('#poll-admin #pa-card')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('player: seeded poll with session shows questions', async ({
    page,
    context,
    request,
  }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);

    fixture = await createMixedPollFixture(request);
    const { token } = await fixture.withSession();

    const { playerPath } = config();
    const url =
      playerPath +
      (playerPath.includes('?') ? '&' : '?') +
      'poll=' +
      encodeURIComponent(fixture.poll.sharedId) +
      '&token=' +
      encodeURIComponent(token);

    await page.goto(url);
    await expect(page.locator('#poll-player #pp-card')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('#pp-card .pp-qtext')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('#pp-card .pp-qtext')).toContainText('Welcome guidance');
  });
});

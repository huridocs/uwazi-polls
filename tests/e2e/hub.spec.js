const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie, api } = require('./helpers/uwazi');
const { createMixedPollFixture } = require('./helpers/fixture');
const { deleteAnswersForSession } = require('./helpers/seed');

test.describe('Poll hub', () => {
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

  test('lists sessions assigned to the current user and links to the player', async ({
    page,
    context,
    request,
  }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);

    const me = await api(request, 'GET', '/api/user');
    expect(me && me._id).toBeTruthy();

    fixture = await createMixedPollFixture(request);
    sessionInfo = await fixture.withSession({ assignToUser: me });

    const { hubPath, playerPath } = config();
    await page.goto(hubPath);
    await expect(page.locator('#poll-hub #ph-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.ph-poll-title')).toContainText(fixture.poll.title, {
      timeout: 30_000,
    });

    const open = page.locator('a.ph-btn.primary');
    await expect(open).toBeVisible();
    const href = await open.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toContain(playerPath.split('?')[0]);
    expect(href).toContain('poll=' + encodeURIComponent(fixture.poll.sharedId));
    expect(href).toContain('token=' + encodeURIComponent(sessionInfo.token));
  });
});

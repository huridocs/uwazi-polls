const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie, api } = require('./helpers/uwazi');
const { createMixedPollFixture } = require('./helpers/fixture');
const { deleteAnswersForSession, RESPONDENTS_GROUP_NAME } = require('./helpers/seed');

test.describe('Session soft-claim', () => {
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

  test('opening the player claim link narrows session ACL to the current user', async ({
    page,
    context,
    request,
  }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);
    fixture = await createMixedPollFixture(request);
    sessionInfo = await fixture.withSession();

    const groups = await api(request, 'GET', '/api/usergroups');
    const list = Array.isArray(groups) ? groups : groups.rows || [];
    const respondents = list.find(
      g => String(g.name || '').trim().toLowerCase() === RESPONDENTS_GROUP_NAME.toLowerCase()
    );
    expect(respondents && respondents._id).toBeTruthy();
    const groupId = String(respondents._id);

    const before = await api(request, 'PUT', '/api/entities/permissions/', {
      sharedIds: [sessionInfo.session.sharedId],
    });
    expect(
      (before || []).some(p => p.type === 'group' && String(p.refId) === groupId && p.level === 'write')
    ).toBe(true);

    const { playerPath } = config();
    const url =
      playerPath +
      (playerPath.includes('?') ? '&' : '?') +
      'poll=' +
      encodeURIComponent(fixture.poll.sharedId) +
      '&token=' +
      encodeURIComponent(sessionInfo.token);

    await page.goto(url);
    await expect(page.locator('#pp-card .pp-qtext')).toContainText('Alpha choice question', {
      timeout: 30_000,
    });

    const after = await api(request, 'PUT', '/api/entities/permissions/', {
      sharedIds: [sessionInfo.session.sharedId],
    });
    expect((after || []).some(p => p.type === 'group' && String(p.refId) === groupId)).toBe(false);
    expect((after || []).some(p => p.type === 'user' && p.level === 'write')).toBe(true);

    await expect
      .poll(async () => {
        const data = await api(
          request,
          'GET',
          `/api/entities?sharedId=${encodeURIComponent(sessionInfo.session.sharedId)}`
        );
        const rows = data.rows || (Array.isArray(data) ? data : [data]);
        const ent = rows[0] || {};
        const md = ent.metadata || {};
        return {
          by: (((md.poll_claimed_by || [])[0] || {}).value || '').toString(),
          user: (((md.poll_claimed_user || [])[0] || {}).value || '').toString(),
        };
      })
      .toMatchObject({
        by: expect.stringMatching(/\S/),
        user: expect.stringMatching(/\S/),
      });
  });

  test('preview open does not claim the session', async ({ page, context, request }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);
    fixture = await createMixedPollFixture(request);
    sessionInfo = await fixture.withSession();

    const groups = await api(request, 'GET', '/api/usergroups');
    const list = Array.isArray(groups) ? groups : groups.rows || [];
    const respondents = list.find(
      g => String(g.name || '').trim().toLowerCase() === RESPONDENTS_GROUP_NAME.toLowerCase()
    );
    const groupId = String(respondents._id);

    const { playerPath } = config();
    const url =
      playerPath +
      (playerPath.includes('?') ? '&' : '?') +
      'poll=' +
      encodeURIComponent(fixture.poll.sharedId) +
      '&token=' +
      encodeURIComponent(sessionInfo.token) +
      '&preview=1';

    await page.goto(url);
    await expect(page.locator('#pp-card .pp-qtext')).toContainText('Alpha choice question', {
      timeout: 30_000,
    });

    const after = await api(request, 'PUT', '/api/entities/permissions/', {
      sharedIds: [sessionInfo.session.sharedId],
    });
    expect(
      (after || []).some(p => p.type === 'group' && String(p.refId) === groupId && p.level === 'write')
    ).toBe(true);
  });
});

const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie } = require('./helpers/uwazi');
const { createMixedPollFixture } = require('./helpers/fixture');
const { answersForSession } = require('./helpers/seed');

test.describe('Poll player — answer flow', () => {
  /** @type {Awaited<ReturnType<typeof createMixedPollFixture>> | null} */
  let fixture = null;
  /** @type {{ session: object, token: string } | null} */
  let sessionInfo = null;

  test.afterEach(async ({ request }) => {
    if (fixture) {
      await apiLogin(request);
      await fixture.cleanup();
      fixture = null;
      sessionInfo = null;
    }
  });

  test('saves choice answer with S{n} Q{n} title and selected option', async ({
    page,
    context,
    request,
  }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);

    fixture = await createMixedPollFixture(request);
    sessionInfo = await fixture.withSession();

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

    // Section 1, question 2 (instructions skipped) → title S1 Q2
    await page.locator('input[name="pp-option"]').first().check();
    await page.locator('#pp-next').click();

    // Advanced past the choice question (next item is Beta free text).
    await expect(page.locator('#pp-card .pp-qtext')).toContainText('Beta free text', {
      timeout: 30_000,
    });

    await expect
      .poll(async () => {
        const answers = await answersForSession(request, sessionInfo.session.sharedId);
        return answers.map(a => ({
          title: a.title,
          question: (((a.metadata || {}).poll_question || [])[0] || {}).value,
          options: ((a.metadata || {}).poll_selected_options || []).map(o => o.value),
        }));
      })
      .toEqual([
        {
          title: 'S1 Q2',
          question: fixture.questions.choice.sharedId,
          options: [fixture.options.yes.sharedId],
        },
      ]);
  });
});

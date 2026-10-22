const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie } = require('./helpers/uwazi');
const { createMixedPollFixture } = require('./helpers/fixture');
const {
  answersForSession,
  deleteAnswersForSession,
  loadSession,
  resolvePollSchema,
} = require('./helpers/seed');

test.describe('Poll player — answer flow', () => {
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

  async function openPlayer(page, context, request) {
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
  }

  test('saves choice answer with S{n} Q{n} title and selected option', async ({
    page,
    context,
    request,
  }) => {
    await openPlayer(page, context, request);

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

  test('Accept & finish shows thank-you and marks session accepted', async ({
    page,
    context,
    request,
  }) => {
    await openPlayer(page, context, request);

    await page.locator('input[name="pp-option"]').first().check();
    await page.locator('#pp-next').click();
    await expect(page.locator('#pp-card .pp-qtext')).toContainText('Beta free text', {
      timeout: 30_000,
    });

    // Skip free text → date is last
    await page.locator('#pp-skip').click();
    await expect(page.locator('#pp-card .pp-qtext')).toContainText('Beta date question', {
      timeout: 30_000,
    });

    // Last item — leave unanswered and finish.
    await page.locator('#pp-accept').click();
    await expect(page.locator('#pp-confirm-ok')).toBeVisible({ timeout: 15_000 });
    await page.locator('#pp-confirm-ok').click();

    await expect(page.locator('#pp-card .pp-done')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#pp-card .pp-done')).toContainText('Thank you');
    await expect(page.locator('#pp-card .pp-done')).toContainText(fixture.poll.title);

    const schema = await resolvePollSchema(request);
    await expect
      .poll(async () => {
        const session = await loadSession(request, sessionInfo.session.sharedId);
        const status = (((session || {}).metadata || {}).poll_session_status || [])[0] || {};
        return status.value || status.label;
      })
      .toBe(schema.sessionStatus.accepted);
  });

  test('saves date answer with poll_date metadata', async ({ page, context, request }) => {
    await openPlayer(page, context, request);

    await page.locator('input[name="pp-option"]').first().check();
    await page.locator('#pp-next').click();
    await expect(page.locator('#pp-card .pp-qtext')).toContainText('Beta free text', {
      timeout: 30_000,
    });
    await page.locator('#pp-skip').click();
    await expect(page.locator('#pp-date')).toBeVisible({ timeout: 30_000 });

    await page.locator('#pp-date').fill('2026-06-15');
    await page.locator('#pp-accept').click();
    await expect(page.locator('#pp-confirm-ok')).toBeVisible({ timeout: 15_000 });
    await page.locator('#pp-confirm-ok').click();
    await expect(page.locator('#pp-card .pp-done')).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(async () => {
        const answers = await answersForSession(request, sessionInfo.session.sharedId);
        const dateAns = answers.find(
          a => (((a.metadata || {}).poll_question || [])[0] || {}).value === fixture.questions.date.sharedId
        );
        if (!dateAns) return null;
        return {
          title: dateAns.title,
          date: (((dateAns.metadata || {}).poll_date || [])[0] || {}).value,
        };
      })
      .toEqual({
        title: 'S2 Q2',
        // 2026-06-15 UTC midnight
        date: Math.floor(Date.UTC(2026, 5, 15) / 1000),
      });
  });
});

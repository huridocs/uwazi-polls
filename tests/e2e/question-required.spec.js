const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie } = require('./helpers/uwazi');
const {
  resolvePollSchema,
  createEntity,
  deleteEntities,
  createPollSession,
} = require('./helpers/seed');

test.describe('Poll player — required questions', () => {
  /** @type {string[]} */
  let createdIds = [];

  test.afterEach(async ({ request }) => {
    if (createdIds.length) {
      await apiLogin(request);
      await deleteEntities(request, createdIds);
      createdIds = [];
    }
  });

  test('blocks finish when a required question is unanswered and opens TOC', async ({
    page,
    context,
    request,
  }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);

    const schema = await resolvePollSchema(request);
    const T = schema.templates;
    const stamp = Date.now();

    const poll = await createEntity(request, `Required poll ${stamp}`, T.Poll, {
      poll_description: [{ value: 'required e2e' }],
      poll_status: [{ value: schema.pollStatus.draft }],
    });
    const section = await createEntity(request, `Req section ${stamp}`, T.Section, {
      poll_number: [{ value: 1 }],
      poll_poll: [{ value: poll.sharedId }],
    });
    const qRequired = await createEntity(request, `Req Q ${stamp}`, T.Question, {
      poll_number: [{ value: 1 }],
      poll_question_text: [{ value: `Required free text ${stamp}` }],
      poll_type: [{ value: schema.qType.free_text }],
      poll_allow_multiple: [{ value: schema.yesNo.no }],
      poll_required: [{ value: schema.yesNo.yes }],
      poll_section: [{ value: section.sharedId }],
      poll_poll: [{ value: poll.sharedId }],
    });
    const qOptional = await createEntity(request, `Opt Q ${stamp}`, T.Question, {
      poll_number: [{ value: 2 }],
      poll_question_text: [{ value: `Optional free text ${stamp}` }],
      poll_type: [{ value: schema.qType.free_text }],
      poll_allow_multiple: [{ value: schema.yesNo.no }],
      poll_required: [{ value: schema.yesNo.no }],
      poll_section: [{ value: section.sharedId }],
      poll_poll: [{ value: poll.sharedId }],
    });
    const { session, token } = await createPollSession(request, poll.sharedId);
    createdIds.push(
      poll.sharedId,
      section.sharedId,
      qRequired.sharedId,
      qOptional.sharedId,
      session.sharedId
    );

    const { playerPath } = config();
    const url =
      playerPath +
      (playerPath.includes('?') ? '&' : '?') +
      'poll=' +
      encodeURIComponent(poll.sharedId) +
      '&token=' +
      encodeURIComponent(token);

    await page.goto(url);
    await expect(page.locator('#pp-card .pp-qtext')).toContainText(`Required free text ${stamp}`, {
      timeout: 30_000,
    });
    await expect(page.locator('.pp-required-note')).toContainText('Required');

    await page.locator('#pp-skip').click();
    await expect(page.locator('#pp-card .pp-qtext')).toContainText(`Optional free text ${stamp}`, {
      timeout: 30_000,
    });
    await expect(page.locator('.pp-optional-note')).toContainText('Optional');

    await page.locator('#pp-accept').click();
    await expect(page.locator('#pp-confirm-title')).toContainText('Required questions missing', {
      timeout: 15_000,
    });
    await expect(page.locator('#pp-confirm-ok')).toContainText('Open table of contents');
    await page.locator('#pp-confirm-ok').click();

    await expect(page.locator('.pp-toc-heading')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.pp-toc-item.pp-toc-required-missing')).toBeVisible();
    await expect(page.locator('#pp-card .pp-done')).toHaveCount(0);
  });
});

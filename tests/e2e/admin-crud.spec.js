const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie } = require('./helpers/uwazi');
const {
  resolvePollSchema,
  findEntityByTitle,
  findQuestionByText,
  deleteEntities,
} = require('./helpers/seed');

test.describe('Poll admin — CRUD smoke', () => {
  /** @type {string[]} */
  let createdIds = [];

  test.afterEach(async ({ request }) => {
    if (createdIds.length) {
      await apiLogin(request);
      await deleteEntities(request, createdIds);
      createdIds = [];
    }
  });

  test('creates poll, section, and free-text question via UI', async ({
    page,
    context,
    request,
  }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);

    const stamp = Date.now();
    const pollTitle = `CRUD poll ${stamp}`;
    const sectionTitle = `CRUD section ${stamp}`;
    const questionText = `CRUD question text ${stamp}`;

    const { adminPath } = config();
    await page.goto(adminPath);
    await expect(page.locator('#poll-admin #pa-card')).toBeVisible({
      timeout: 30_000,
    });

    await page.locator('#pa-new-poll').click();
    await expect(page.locator('#pa-title')).toBeVisible();
    await page.locator('#pa-title').fill(pollTitle);
    await page.locator('#pa-desc').fill('CRUD smoke description');
    await page.locator('#pa-save-poll').click();

    await expect(page.locator('#pa-add-section')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.pa-heading')).toContainText(pollTitle);

    const schema = await resolvePollSchema(request);
    await expect
      .poll(async () => findEntityByTitle(request, schema.templates.Poll, pollTitle))
      .not.toBeNull();
    const poll = await findEntityByTitle(request, schema.templates.Poll, pollTitle);
    createdIds.push(poll.sharedId);

    await page.locator('#pa-add-section').click();
    await expect(page.locator('#pa-sectitle')).toBeVisible();
    await page.locator('#pa-sectitle').fill(sectionTitle);
    await page.locator('#pa-save-sec').click();

    await expect(page.locator('.pa-section-block')).toHaveCount(1, { timeout: 30_000 });
    await expect
      .poll(async () => findEntityByTitle(request, schema.templates.Section, sectionTitle))
      .not.toBeNull();
    const section = await findEntityByTitle(
      request,
      schema.templates.Section,
      sectionTitle
    );
    createdIds.push(section.sharedId);

    await page.locator('.pa-add-q').click();
    await expect(page.locator('#pa-qtext')).toBeVisible();
    await page.locator('#pa-qtype').selectOption({ label: 'Open text' });
    await page.locator('#pa-qtext').fill(questionText);
    await page.locator('#pa-save-q').click();

    await expect(page.locator('.pa-qitem')).toHaveCount(1, { timeout: 30_000 });

    await expect.poll(async () => findQuestionByText(request, questionText)).not.toBeNull();
    const question = await findQuestionByText(request, questionText);
    createdIds.push(question.sharedId);

    expect((((question.metadata || {}).poll_question_text || [])[0] || {}).value).toBe(
      questionText
    );
    expect((((question.metadata || {}).poll_section || [])[0] || {}).value).toBe(
      section.sharedId
    );
    expect((((question.metadata || {}).poll_poll || [])[0] || {}).value).toBe(poll.sharedId);

    const dateText = `CRUD date question ${stamp}`;
    await page.locator('.pa-add-q').click();
    await expect(page.locator('#pa-qtext')).toBeVisible();
    await page.locator('#pa-qtype').selectOption({ label: 'Date' });
    await page.locator('#pa-qtext').fill(dateText);
    await page.locator('#pa-save-q').click();

    await expect(page.locator('.pa-qitem')).toHaveCount(2, { timeout: 30_000 });
    await expect.poll(async () => findQuestionByText(request, dateText)).not.toBeNull();
    const dateQ = await findQuestionByText(request, dateText);
    createdIds.push(dateQ.sharedId);
    expect((((dateQ.metadata || {}).poll_type || [])[0] || {}).value).toBe(
      schema.qType.date
    );
  });
});

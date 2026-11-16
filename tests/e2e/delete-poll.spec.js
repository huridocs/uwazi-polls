const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie } = require('./helpers/uwazi');
const {
  seedTwoSectionPoll,
  createPollSession,
  createEntity,
  resolvePollSchema,
  deleteEntities,
} = require('./helpers/seed');

async function entityStillThere(request, sharedId) {
  const res = await request.get(`/api/entities?sharedId=${encodeURIComponent(sharedId)}`, {
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  if (res.status() === 404) return false;
  if (!res.ok()) {
    throw new Error(`GET entity ${sharedId} → ${res.status()} ${await res.text()}`);
  }
  const data = await res.json();
  const rows = data.rows || (Array.isArray(data) ? data : data ? [data] : []);
  return rows.some(r => r && r.sharedId === sharedId);
}

test.describe('Poll admin — delete poll', () => {
  /** @type {string[]} */
  let leftoverIds = [];

  test.afterEach(async ({ request }) => {
    if (leftoverIds.length) {
      await apiLogin(request);
      await deleteEntities(request, leftoverIds);
      leftoverIds = [];
    }
  });

  test('deletes poll cascade after typing DELETE', async ({ page, context, request }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);

    const fixture = await seedTwoSectionPoll(request);
    const { session } = await createPollSession(request, fixture.poll.sharedId);
    const schema = await resolvePollSchema(request);
    const stamp = Date.now();
    const sharedOpt = await createEntity(request, `Shared opt ${stamp}`, schema.templates.Option, {
      poll_label: [{ value: `Shared opt ${stamp}` }],
    });
    const onlyOpt = await createEntity(request, `Only opt ${stamp}`, schema.templates.Option, {
      poll_label: [{ value: `Only opt ${stamp}` }],
    });

    // Choice question on the doomed poll references both options.
    const doomedChoice = await createEntity(
      request,
      `Doomed choice ${stamp}`,
      schema.templates.Question,
      {
        poll_number: [{ value: 2 }],
        poll_question_text: [{ value: `Doomed choice ${stamp}` }],
        poll_type: [{ value: schema.qType.choice }],
        poll_allow_multiple: [{ value: schema.yesNo.no }],
        poll_section: [{ value: fixture.sections[0].sharedId }],
        poll_poll: [{ value: fixture.poll.sharedId }],
        poll_available_options: [
          { value: sharedOpt.sharedId },
          { value: onlyOpt.sharedId },
        ],
      }
    );

    // Another poll still uses the shared option — must survive.
    const otherPoll = await createEntity(
      request,
      `Keep poll ${stamp}`,
      schema.templates.Poll,
      {
        poll_description: [{ value: 'must survive' }],
        poll_status: [{ value: schema.pollStatus.draft }],
      }
    );
    const otherSec = await createEntity(request, `Keep section ${stamp}`, schema.templates.Section, {
      poll_number: [{ value: 1 }],
      poll_poll: [{ value: otherPoll.sharedId }],
    });
    const otherQ = await createEntity(request, `Keep question ${stamp}`, schema.templates.Question, {
      poll_number: [{ value: 1 }],
      poll_question_text: [{ value: 'Keep me' }],
      poll_type: [{ value: schema.qType.choice }],
      poll_allow_multiple: [{ value: schema.yesNo.no }],
      poll_section: [{ value: otherSec.sharedId }],
      poll_poll: [{ value: otherPoll.sharedId }],
      poll_available_options: [{ value: sharedOpt.sharedId }],
    });
    leftoverIds.push(
      ...fixture.sharedIds,
      session.sharedId,
      doomedChoice.sharedId,
      onlyOpt.sharedId,
      otherPoll.sharedId,
      otherSec.sharedId,
      otherQ.sharedId,
      sharedOpt.sharedId
    );

    const { adminPath } = config();
    await page.goto(adminPath);
    await expect(page.locator('#poll-admin #pa-card')).toBeVisible({ timeout: 30_000 });

    const row = page.locator('tr', {
      has: page.locator('.pa-open-poll', { hasText: fixture.poll.title }),
    });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.locator('button.pa-delete-poll').click();

    await expect(page.locator('#pa-delete-title')).toBeVisible();
    await expect(page.locator('.pa-delete-counts')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#pa-confirm-delete-poll')).toBeDisabled();

    await page.locator('#pa-delete-confirm').fill('DELETE');
    await expect(page.locator('#pa-confirm-delete-poll')).toBeEnabled();
    await page.locator('#pa-confirm-delete-poll').click();

    await expect(page.locator('#pa-delete-title')).toHaveCount(0, { timeout: 60_000 });
    await expect(
      page.locator('.pa-open-poll', { hasText: fixture.poll.title })
    ).toHaveCount(0);

    await expect.poll(async () => entityStillThere(request, fixture.poll.sharedId)).toBe(false);
    await expect.poll(async () => entityStillThere(request, fixture.sections[0].sharedId)).toBe(
      false
    );
    await expect.poll(async () => entityStillThere(request, fixture.questions[0].sharedId)).toBe(
      false
    );
    await expect.poll(async () => entityStillThere(request, session.sharedId)).toBe(false);
    await expect.poll(async () => entityStillThere(request, onlyOpt.sharedId)).toBe(false);
    await expect.poll(async () => entityStillThere(request, sharedOpt.sharedId)).toBe(true);
    await expect.poll(async () => entityStillThere(request, otherPoll.sharedId)).toBe(true);
  });
});

const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie } = require('./helpers/uwazi');
const { createMixedPollFixture } = require('./helpers/fixture');
const { sectionOrderByNumber } = require('./helpers/seed');

test.describe('Poll admin — structure drag and drop', () => {
  /** @type {Awaited<ReturnType<typeof createMixedPollFixture>> | null} */
  let fixture = null;

  test.afterEach(async ({ request }) => {
    if (fixture) {
      await apiLogin(request);
      await fixture.cleanup();
      fixture = null;
    }
  });

  test('reorders sections when dropped onto a question row and persists numbers', async ({
    page,
    context,
    request,
  }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);

    fixture = await createMixedPollFixture(request);

    const { adminPath } = config();
    await page.goto(adminPath);
    await expect(page.locator('#poll-admin #pa-card')).toBeVisible({
      timeout: 30_000,
    });

    const structureBtn = page.locator(`.pa-structure[data-id="${fixture.poll.sharedId}"]`);
    await expect(structureBtn).toBeVisible({ timeout: 30_000 });
    await structureBtn.click();

    const sections = page.locator('#pa-sections .pa-section-block');
    await expect(sections).toHaveCount(2);

    const firstId = await sections.nth(0).getAttribute('data-id');
    const secondId = await sections.nth(1).getAttribute('data-id');
    expect(firstId).toBe(fixture.sections[0].sharedId);
    expect(secondId).toBe(fixture.sections[1].sharedId);

    await sections.nth(0).evaluate((src, tgtId) => {
      const handle = src.querySelector('.pa-sec-drag');
      const tgtQ = document.querySelector(
        '.pa-section-block[data-id="' + tgtId + '"] .pa-qitem'
      );
      if (!handle) throw new Error('section drag handle missing');
      if (!tgtQ) throw new Error('target question row missing');
      const dt = new DataTransfer();
      handle.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })
      );
      tgtQ.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })
      );
      tgtQ.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
      );
      handle.dispatchEvent(
        new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt })
      );
    }, secondId);

    await expect
      .poll(async () => {
        const ids = await sections.evaluateAll(nodes =>
          nodes.map(n => n.getAttribute('data-id'))
        );
        return ids;
      })
      .toEqual([secondId, firstId]);

    await expect
      .poll(async () => sectionOrderByNumber(request, fixture.poll.sharedId))
      .toEqual(['Section Beta', 'Section Alpha']);
  });
});

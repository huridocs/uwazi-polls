const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie } = require('./helpers/uwazi');
const { createMixedPollFixture } = require('./helpers/fixture');
const { sectionOrderByNumber, questionOrderByNumber } = require('./helpers/seed');

/**
 * Synthetic HTML5 DnD from a drag handle onto a drop target (by CSS selectors).
 * @param {import('@playwright/test').Page} page
 * @param {string} handleSel
 * @param {string} targetSel
 */
async function syntheticDragDrop(page, handleSel, targetSel) {
  await page.evaluate(
    ({ handleSel: h, targetSel: t }) => {
      const handle = document.querySelector(h);
      const tgt = document.querySelector(t);
      if (!handle) throw new Error('drag handle missing: ' + h);
      if (!tgt) throw new Error('drop target missing: ' + t);
      const dt = new DataTransfer();
      handle.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })
      );
      tgt.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })
      );
      tgt.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
      );
      handle.dispatchEvent(
        new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt })
      );
    },
    { handleSel, targetSel }
  );
}

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

  async function openStructure(page, context, request) {
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
    return sections;
  }

  test('reorders sections when dropped onto a question row and persists numbers', async ({
    page,
    context,
    request,
  }) => {
    const sections = await openStructure(page, context, request);

    const firstId = await sections.nth(0).getAttribute('data-id');
    const secondId = await sections.nth(1).getAttribute('data-id');
    expect(firstId).toBe(fixture.sections[0].sharedId);
    expect(secondId).toBe(fixture.sections[1].sharedId);

    await syntheticDragDrop(
      page,
      `.pa-section-block[data-id="${firstId}"] .pa-sec-drag`,
      `.pa-section-block[data-id="${secondId}"] .pa-qitem`
    );

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

  test('reorders sections when dropped onto the section block header', async ({
    page,
    context,
    request,
  }) => {
    const sections = await openStructure(page, context, request);

    const firstId = await sections.nth(0).getAttribute('data-id');
    const secondId = await sections.nth(1).getAttribute('data-id');

    // Drop on the section block itself (header/body), not a question row.
    await syntheticDragDrop(
      page,
      `.pa-section-block[data-id="${firstId}"] .pa-sec-drag`,
      `.pa-section-block[data-id="${secondId}"]`
    );

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

  test('reorders questions within a section and persists numbers', async ({
    page,
    context,
    request,
  }) => {
    const sections = await openStructure(page, context, request);
    const secA = sections.nth(0);
    const secAId = fixture.sections[0].sharedId;

    const qItems = secA.locator('.pa-qitem');
    await expect(qItems).toHaveCount(2);

    const guideId = fixture.questions.guide.sharedId;
    const choiceId = fixture.questions.choice.sharedId;
    expect(await qItems.nth(0).getAttribute('data-id')).toBe(guideId);
    expect(await qItems.nth(1).getAttribute('data-id')).toBe(choiceId);

    await syntheticDragDrop(
      page,
      `.pa-qitem[data-id="${guideId}"] .pa-drag`,
      `.pa-qitem[data-id="${choiceId}"]`
    );

    await expect
      .poll(async () => {
        const ids = await qItems.evaluateAll(nodes =>
          nodes.map(n => n.getAttribute('data-id'))
        );
        return ids;
      })
      .toEqual([choiceId, guideId]);

    await expect
      .poll(async () => questionOrderByNumber(request, secAId))
      .toEqual(['A2 Choice', 'A1 Guide']);
  });
});

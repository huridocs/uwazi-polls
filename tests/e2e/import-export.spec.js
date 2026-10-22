const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { config, apiLogin, applySessionCookie } = require('./helpers/uwazi');
const { createMixedPollFixture } = require('./helpers/fixture');
const SM = require('../../lib/sm-details.js');

test.describe('Import / export', () => {
  /** @type {Awaited<ReturnType<typeof createMixedPollFixture>> | null} */
  let fixture = null;

  test.afterEach(async ({ request }) => {
    if (fixture) {
      await apiLogin(request);
      await fixture.cleanup();
      fixture = null;
    }
  });

  test('Export downloads SurveyMonkey details JSON for a poll', async ({
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

    // Outside the card, right-aligned footer
    const footerDocs = page.locator('#pa-page-foot .pa-docs-link a');
    await expect(footerDocs).toBeVisible();
    await expect(footerDocs).toHaveText('Documentation');
    await expect(footerDocs).toHaveAttribute('target', '_blank');
    await expect(footerDocs).toHaveAttribute(
      'href',
      /github\.com\/huridocs\/uwazi-polls#surveymonkey-import--export/
    );

    const exportBtn = page.locator(`.pa-export[data-id="${fixture.poll.sharedId}"]`);
    await expect(exportBtn).toBeVisible({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      exportBtn.click(),
    ]);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const details = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(details.title).toBe(fixture.poll.title);
    expect(Array.isArray(details.pages)).toBe(true);
    expect(details.pages.length).toBeGreaterThanOrEqual(2);

    // Exported payload must be re-importable by the same mapper.
    const preview = SM.buildImportPreviewFromSmDetails(details);
    expect(preview.stats.skipped).toBe(0);
    expect(preview.stats.sections).toBe(details.pages.length);
    expect(preview.stats.items).toBeGreaterThan(0);
    // Fixture includes a date question → export must round-trip as datetime/date.
    expect(preview.stats.date).toBeGreaterThanOrEqual(1);

  });

  test('Import modal links to docs in a new tab', async ({ page, context, request }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);

    const { adminPath } = config();
    await page.goto(adminPath);
    await expect(page.locator('#pa-import')).toBeVisible({ timeout: 30_000 });
    await page.locator('#pa-import').click();
    // JSON source shows the docs link under the textarea
    await page.locator('input[name="pa-import-source"][value="json"]').check();
    const link = page.locator('#pa-import-json + .pa-docs-link a, .pa-field:has(#pa-import-json) .pa-docs-link a');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('Documentation');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute(
      'href',
      /github\.com\/huridocs\/uwazi-polls#surveymonkey-import--export/
    );
  });
});

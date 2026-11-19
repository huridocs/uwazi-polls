const { test, expect } = require("@playwright/test");
const { config, apiLogin, applySessionCookie } = require("./helpers/uwazi");
const { createMixedPollFixture } = require("./helpers/fixture");
const { deleteAnswersForSession } = require("./helpers/seed");
const { pollPlayerPath } = require("./helpers/pages");

test.describe("Session copy link", () => {
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

  test("Open preview and copy share link use this instance Poll player path", async ({
    page,
    context,
    request,
  }) => {
    await apiLogin(request);
    await applySessionCookie(context, request);

    fixture = await createMixedPollFixture(request);
    sessionInfo = await fixture.withSession();

    const expectedPath = await pollPlayerPath(request);
    // Guard against regressing to the old OMCT-only hardcoded id when CI/local differ.
    expect(expectedPath).toMatch(/^\/en\/page\/[^/]+\/poll-player$/);

    const { adminPath, baseURL } = config();
    await page.goto(adminPath);
    await expect(page.locator("#poll-admin #pa-card")).toBeVisible({
      timeout: 30_000,
    });

    const pollActions = page.locator(
      `tr:has(.pa-open-poll[data-id="${fixture.poll.sharedId}"]) .pa-actions-menu`,
    );
    await expect(pollActions).toBeVisible({ timeout: 30_000 });
    await pollActions.locator("summary").click();
    await pollActions
      .locator(`.pa-sessions[data-id="${fixture.poll.sharedId}"]`)
      .click();

    await expect(page.locator(".pa-table thead")).not.toContainText("Token");
    await expect(page.locator("#pa-export-all-csv")).toBeVisible();

    const actionsMenu = page.locator(".pa-actions-menu").first();
    await expect(actionsMenu).toBeVisible({ timeout: 30_000 });
    await actionsMenu.locator("summary").click();
    await expect(actionsMenu.locator(".pa-del-session")).toBeVisible();
    await expect(actionsMenu.locator(".pa-session-print")).toBeVisible();
    await expect(actionsMenu.locator(".pa-session-csv")).toBeVisible();

    const openLink = actionsMenu.locator(".pa-open-session");
    await expect(openLink).toBeVisible({ timeout: 30_000 });
    const openHref = await openLink.getAttribute("data-href");
    expect(openHref).toBeTruthy();
    const openUrl = new URL(openHref);
    expect(openUrl.origin).toBe(new URL(baseURL).origin);
    expect(openUrl.pathname).toBe(expectedPath);
    expect(openUrl.searchParams.get("poll")).toBe(fixture.poll.sharedId);
    expect(openUrl.searchParams.get("token")).toBe(sessionInfo.token);
    expect(openUrl.searchParams.get("preview")).toBe("1");

    const copyBtn = actionsMenu.locator(".pa-copy-link");
    await expect(copyBtn).toBeVisible({ timeout: 30_000 });
    expect(await copyBtn.getAttribute("data-token")).toBe(sessionInfo.token);

    // Intercept clipboard — more reliable in CI than permission grants.
    await page.evaluate(() => {
      window.__pollCopiedLink = null;
      navigator.clipboard.writeText = function (text) {
        window.__pollCopiedLink = text;
        return Promise.resolve();
      };
    });
    await copyBtn.click();

    const copied = await page.evaluate(() => window.__pollCopiedLink);
    expect(copied).toBeTruthy();

    const url = new URL(copied);
    expect(url.origin).toBe(new URL(baseURL).origin);
    expect(url.pathname).toBe(expectedPath);
    expect(url.searchParams.get("poll")).toBe(fixture.poll.sharedId);
    expect(url.searchParams.get("token")).toBe(sessionInfo.token);
    expect(url.searchParams.get("preview")).toBeNull();

    // Preview link loads player read-only.
    await page.goto(openHref);
    await expect(page.locator("#poll-player #pp-card")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("#poll-player #pp-preview-banner")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("#pp-card .pp-qtext")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("#pp-accept")).toHaveCount(0);
  });
});

// The demo has two accounts: a portal admin and a data consumer who can only browse.
const { test, expect } = require("@playwright/test");
const { signIn } = require("./helpers");

test.describe("data consumer (no admin rights)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, { role: "consumer" });
  });

  test("sees the catalog but not the admin entry points", async ({ page }) => {
    await page.goto("/");
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    await expect(page.getByRole("heading", { name: "מה תרצו לדעת?" })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: /הוספת מאגר/ })).toBeHidden();

    // dataset status is shown, but it is not a switch
    const chip = page.locator('a[href="#/repo/2"] .agm-status');
    await expect(chip).toHaveText("חסום");
    await expect(chip).toBeDisabled();
    await expect(page.locator('[role="switch"]')).toHaveCount(0);
  });

  test("has no block / open button on a dataset page", async ({ page }) => {
    await page.goto("/#/repo/1");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator(".agm-admin-switch")).toHaveCount(0);
  });

  test("cannot open the add-dataset page", async ({ page }) => {
    await page.goto("/add-dataset.html");
    await expect(page).not.toHaveURL(/add-dataset/);
  });
});

test.describe("portal admin", () => {
  test("has the admin entry points", async ({ page }) => {
    await signIn(page);
    await page.goto("/");
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    await expect(page.getByRole("navigation").getByRole("link", { name: /הוספת מאגר/ })).toBeVisible();
    await expect(page.locator('[role="switch"]')).toHaveCount(3);
  });
});

test.describe("signing in with each demo account", () => {
  for (const [who, role] of [["מנהל פורטל", "user"], ["צרכן נתונים", "consumer"]]) {
    test(`"${who}" gets the ${role} role`, async ({ page }) => {
      await page.goto("/#/login");
      await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
      await page.getByRole("button", { name: who, exact: true }).click();
      await page.getByRole("button", { name: "כניסה", exact: true }).click();
      const digits = page.locator("input[maxlength='1']");
      await expect(digits).toHaveCount(6);
      for (let i = 0; i < 6; i++) await digits.nth(i).fill(String(i + 1));
      await page.getByRole("button", { name: "אימות", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("auth") || "{}").role))
        .toBe(role);
    });
  }
});

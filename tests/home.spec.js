const { test, expect } = require("@playwright/test");
const { signIn } = require("./helpers");

test.describe("home page", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/");
  });

  test("greets by role in one uniform style", async ({ page }) => {
    // the comma between the two parts is drawn by CSS, so check the parts separately
    await expect(page.locator(".agm-greet-hello")).toHaveText("שלום");
    await expect(page.locator(".agm-greet-role")).toHaveText("ראש צוות נתונים");

    const style = (sel) =>
      page.locator(sel).evaluate((n) => {
        const s = getComputedStyle(n);
        return { size: s.fontSize, weight: s.fontWeight, color: s.color };
      });
    expect(await style(".agm-greet-hello")).toEqual(await style(".agm-greet-role"));
  });

  test("shows the hero, search and the published datasets", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "מה תרצו לדעת?" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "חיפוש", exact: true })).toBeVisible();
    await expect(page.getByText("רשויות מקומיות").first()).toBeVisible();
  });

  test("has the add-dataset entry in the navigation", async ({ page }) => {
    await expect(page.getByRole("navigation").getByRole("link", { name: /הוספת מאגר/ })).toBeVisible();
  });

  test("an admin can switch a dataset between open and blocked", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    const chip = (id) => page.locator('a[href="#/repo' + "/" + id + '"] .agm-status');

    await expect(chip(2)).toHaveText("חסום");
    await expect(chip(1)).toHaveText("פתוח");

    // open the blocked one
    await chip(2).click();
    await expect(chip(2)).toHaveText("פתוח");
    await expect(page.locator(".agm-status--blocked")).toHaveCount(0);

    // the choice is remembered, and the dataset page agrees
    await page.reload();
    await expect(chip(2)).toHaveText("פתוח");

    // block another one
    await chip(1).click();
    await expect(chip(1)).toHaveText("חסום");
    await expect(page.locator(".agm-status--blocked")).toHaveCount(1);
  });
});

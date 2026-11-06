const { test, expect } = require("@playwright/test");
const { signIn, openCatalog, openPanel, fillDataset } = require("./helpers");

const DATASET = {
  purpose: "מיקומי המקלטים הציבוריים: כתובת, סוג, קיבולת ונגישות",
  owner: "רע״ן הגנה אזרחית",
  phone: "050-1234567"
};

test.describe("add dataset (side panel)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("opens as a side panel and closes with the X, Escape and the backdrop", async ({ page }) => {
    await openCatalog(page);

    await openPanel(page);
    await expect(page.locator("#agm-drawer")).toBeVisible();
    await expect(page).toHaveURL(/#\/catalog/); // did not navigate away
    await page.locator("#agm-drawer .agm-d-x").click();
    await expect(page.locator("#agm-drawer")).toHaveCount(0);

    await openPanel(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("#agm-drawer")).toHaveCount(0);

    await openPanel(page);
    await page.locator("#agm-drawer .agm-d-back").click({ position: { x: 600, y: 300 } });
    await expect(page.locator("#agm-drawer")).toHaveCount(0);
  });

  test("picking a DE table auto-fills the technical facts (without the removed fields)", async ({ page }) => {
    await openCatalog(page);
    const form = await openPanel(page);

    await form.locator("#f-table").selectOption("curated.public_shelters");
    await expect(form.locator(".ad-fact")).toHaveCount(10);
    await expect(form.locator(".ad-fact", { hasText: "מספר שורות" })).toContainText("9,640");
    await expect(form.locator(".ad-fact", { hasText: "תאריך יצירה" })).toContainText("21/10/2026");

    // removed by request: geometry type and the quality-percentage row
    await expect(form.getByText("סוג גיאומטריה")).toHaveCount(0);
    await expect(form.locator(".ad-q")).toHaveCount(0);
  });

  test("the details step only asks for the fields the PM owns", async ({ page }) => {
    await openCatalog(page);
    const form = await openPanel(page);
    await form.locator("#f-table").selectOption("curated.public_shelters");
    await form.getByRole("button", { name: "המשך לפרטי המאגר" }).click();

    const ids = await form.locator("input[id], textarea[id], select[id]").evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(["f-nameHe", "f-purposeHe", "f-ownerHe", "f-ownerPhone", "f-stewardHe", "f-custodianHe", "f-routineDays", "f-emergencyHours"]);

    // removed sections and any English fields must be gone
    for (const text of ["English", "סיווג ומצב", "תוכן, צרכנים וערוצים", "ערוצי הפצה", "קריטריון יציאה"]) {
      await expect(form.getByText(text)).toHaveCount(0);
    }
  });

  test("validates required fields and the phone number", async ({ page }) => {
    await openCatalog(page);
    const form = await openPanel(page);
    await form.locator("#f-table").selectOption("curated.public_shelters");
    await form.getByRole("button", { name: "המשך לפרטי המאגר" }).click();

    await form.getByRole("button", { name: "המשך לסקירה" }).click();
    await expect(form.locator("#err-purposeHe")).toHaveText("שדה חובה");
    await expect(form.locator("#err-ownerHe")).toHaveText("שדה חובה");
    await expect(form.locator("#err-ownerPhone")).toHaveText("שדה חובה");

    await form.locator("#f-purposeHe").fill(DATASET.purpose);
    await form.locator("#f-ownerHe").fill(DATASET.owner);
    await form.locator("#f-ownerPhone").fill("12345");
    await form.getByRole("button", { name: "המשך לסקירה" }).click();
    await expect(form.locator("#err-ownerPhone")).toContainText("מספר לא תקין");

    await form.locator("#f-ownerPhone").fill("050 123 4567");
    await form.getByRole("button", { name: "המשך לסקירה" }).click();
    await expect(form.getByText("050-1234567")).toBeVisible(); // normalised on the review screen
  });

  test("saving shows the dataset in the catalog and on its own page", async ({ page }) => {
    await openCatalog(page);
    await expect(page.getByText("מוצגים 3 מתוך 3")).toBeVisible();

    const form = await openPanel(page);
    await fillDataset(form, DATASET);
    await form.getByRole("button", { name: /שמירה בדפדפן/ }).click();
    await expect(form.getByRole("heading", { name: /המאגר נשמר/ })).toBeVisible();

    // closing the panel after a save refreshes the catalog
    await Promise.all([page.waitForEvent("load"), page.locator("#agm-drawer .agm-d-x").click()]);
    await expect(page.getByText("מוצגים 4 מתוך 4")).toBeVisible();
    await expect(page.getByText("מקלטים ציבוריים").first()).toBeVisible();

    await page.goto("/#/repo/4");
    await expect(page.getByRole("heading", { name: /04 · מקלטים ציבוריים/ })).toBeVisible();
    await expect(page.getByText("050-1234567")).toBeVisible();
    await expect(page.getByText("21.10.2026")).toBeVisible(); // DE creation date

    // other tabs render real content, not errors
    await page.getByRole("tab", { name: /ליניאז/ }).click();
    await expect(page.getByText("db-oref-base").first()).toBeVisible();
    await page.getByRole("tab", { name: "חוזה" }).click();
    await expect(page.getByText(/Public shelters|מקלטים ציבוריים/).first()).toBeVisible();
    await expect(page.getByText(/Not available/)).toHaveCount(0);
  });

  test("a registered table can no longer be picked again", async ({ page }) => {
    await openCatalog(page);
    const form = await openPanel(page);
    await fillDataset(form, DATASET);
    await form.getByRole("button", { name: /שמירה בדפדפן/ }).click();
    await expect(form.getByRole("heading", { name: /המאגר נשמר/ })).toBeVisible();

    await page.goto("/add-dataset.html");
    await expect(page.locator('#f-table option[value="curated.public_shelters"]')).toBeDisabled();
    await expect(page.locator('#f-table option[value="curated.siren_zones"]')).toBeEnabled();
  });

  test("exports a package with every file as text", async ({ page }) => {
    await openCatalog(page);
    const form = await openPanel(page);
    await fillDataset(form, DATASET);
    await form.getByRole("button", { name: /שמירה בדפדפן/ }).click();

    const downloadPromise = page.waitForEvent("download");
    await form.getByRole("button", { name: /ייצוא חבילה/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("dataset-4.package.json");

    const pkg = JSON.parse(require("fs").readFileSync(await download.path(), "utf8"));
    expect(pkg).toMatchObject({ format: "agamim-dataset-package", repoId: 4, layerId: 6455 });
    expect(Object.keys(pkg.files)).toHaveLength(9);
    for (const value of Object.values(pkg.files)) expect(typeof value).toBe("string");
    const repo = JSON.parse(pkg.files["repositories__4.json"]);
    expect(repo).toMatchObject({ classification: 1, restricted: false, accessState: "granted", ownerPhone: "050-1234567" });
  });
});

test.describe("add dataset (standalone page)", () => {
  test("requires sign-in", async ({ page }) => {
    await page.goto("/add-dataset.html");
    await expect(page).not.toHaveURL(/add-dataset\.html/);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("fits the screen without horizontal scrolling", async ({ page }) => {
      await signIn(page);
      await page.goto("/add-dataset.html");
      await page.locator("#f-table").selectOption("curated.siren_zones");
      await expect(page.locator(".ad-fact").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    });
  });
});

// Version control is out of scope for this phase: no dataset version may show anywhere.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { signIn, fillDataset } = require("./helpers");

// "/api/v1/" in an endpoint address is the API's own path, not a dataset version, so a "v1" after a slash is allowed
const VERSION_TEXT = /גרסה|גרסת|גרסאות|(^|[^A-Za-z0-9./])v\d+\b|\bversion\b(?!: 1\.0\.0)/i;

async function visibleVersionText(page) {
  return page.evaluate((src) => {
    const re = new RegExp(src[0], src[1]);
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = (n.textContent || "").trim();
      if (!t || n.parentElement.closest("script,style,noscript")) continue;
      if (re.test(t)) out.push(t.replace(/\s+/g, " ").slice(0, 100));
    }
    return out;
  }, [VERSION_TEXT.source, VERSION_TEXT.flags]);
}

async function open(page, hash) {
  await page.goto("/" + hash);
  await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
  await expect(page.locator("header.no-print")).toBeVisible();
  await page.waitForTimeout(600);
}

test.describe("no version anywhere in the interface", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("home", async ({ page }) => {
    await open(page, "#/");
    await expect(page.locator("ol.card li:not(.agm-lake)")).toHaveCount(3);
    expect(await visibleVersionText(page)).toEqual([]);
    // the last-updated date is still there
    await expect(page.getByText(/עודכן .*2026/).first()).toBeVisible();
  });

  test("catalog", async ({ page }) => {
    await open(page, "#/catalog");
    await expect(page.getByText(/מוצגים \d+ מתוך \d+/)).toBeVisible();
    expect(await visibleVersionText(page)).toEqual([]);
  });

  for (const id of [1, 3]) {
    for (const tab of ["סקירה", "טבלאות ונתונים", "ליניאז", "חוזה"]) {
      test(`dataset ${id} › ${tab}`, async ({ page }) => {
        await open(page, `#/repo/${id}`);
        await page.locator("button[role=tab]", { hasText: tab }).first().click();
        await page.waitForTimeout(500);
        expect(await visibleVersionText(page)).toEqual([]);
      });
    }
  }

  test("layer page", async ({ page }) => {
    await open(page, "#/layer/6452");
    expect(await visibleVersionText(page)).toEqual([]);
  });

  test("dataset 2 after an admin opens it", async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem("agamim-access-overrides-v1")) localStorage.setItem("agamim-access-overrides-v1", JSON.stringify({ 2: { blocked: false } }));
    });
    for (const tab of ["סקירה", "טבלאות ונתונים", "חוזה"]) {
      await open(page, "#/repo/2");
      await page.locator("button[role=tab]", { hasText: tab }).first().click();
      await page.waitForTimeout(400);
      expect(await visibleVersionText(page), tab).toEqual([]);
    }
  });

  test("add-dataset form, every step", async ({ page }) => {
    await page.goto("/add-dataset.html");
    await page.locator("#f-table").selectOption("curated.public_shelters");
    expect(await visibleVersionText(page), "step 1").toEqual([]);
    await page.getByRole("button", { name: "המשך לפרטי המאגר" }).click();
    expect(await visibleVersionText(page), "step 2").toEqual([]);
    await page.locator("#f-purposeHe").fill("בדיקה");
    await page.locator("#f-ownerHe").fill("דנה כהן");
    await page.locator("#f-ownerPhone").fill("050-1234567");
    await page.getByRole("button", { name: "המשך לסקירה" }).click();
    expect(await visibleVersionText(page), "step 3").toEqual([]);
  });

  test("a registered dataset's page shows no version either", async ({ page }) => {
    await page.goto("/add-dataset.html");
    await page.locator("#f-table").selectOption("curated.public_shelters");
    await page.getByRole("button", { name: "המשך לפרטי המאגר" }).click();
    await page.locator("#f-purposeHe").fill("בדיקה");
    await page.locator("#f-ownerHe").fill("דנה כהן");
    await page.locator("#f-ownerPhone").fill("050-1234567");
    await page.getByRole("button", { name: "המשך לסקירה" }).click();
    await page.getByRole("button", { name: /שמירה/ }).first().click();
    await open(page, "#/repo/4");
    for (const tab of ["סקירה", "טבלאות ונתונים", "חוזה"]) {
      await page.locator("button[role=tab]", { hasText: tab }).first().click();
      await page.waitForTimeout(400);
      expect(await visibleVersionText(page), tab).toEqual([]);
    }
  });
});

test("the data files carry no dataset version", () => {
  const found = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".json")) {
        const text = fs.readFileSync(p, "utf8");
        if (/"version"\s*:/.test(text)) found.push(path.relative(process.cwd(), p));
        if (/גרסה|גרסת|גרסאות|history of boundary-change versions/.test(text)) found.push(path.relative(process.cwd(), p) + " (text)");
      }
    }
  };
  walk(path.join(__dirname, "..", "data"));
  expect(found).toEqual([]);
});

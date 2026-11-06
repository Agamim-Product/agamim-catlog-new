// Sorting the dataset lists (home and catalog) and the small icon that replaced the dataset number.
const { test, expect } = require("@playwright/test");
const { signIn } = require("./helpers");

async function home(page, role = "user") {
  await signIn(page, { role });
  await page.goto("/#/");
  await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
  await expect(page.locator("ol.card li:not(.agm-lake)")).toHaveCount(3);
}
const order = (page) =>
  page.locator("ol.card li:not(.agm-lake)").evaluateAll((lis) =>
    lis
      .map((li) => ({ y: li.getBoundingClientRect().top, id: (/#\/repo\/(\d+)/.exec(li.querySelector("a").getAttribute("href")) || [])[1] }))
      .sort((a, b) => a.y - b.y)
      .map((r) => r.id)
  );

test.describe("home list sort", () => {
  test("default order is by dataset number", async ({ page }) => {
    await home(page);
    expect(await order(page)).toEqual(["1", "2", "3"]);
  });

  test("by name (alphabetical)", async ({ page }) => {
    await home(page);
    await page.getByLabel("מיון לפי").selectOption("name");
    await expect.poll(() => order(page)).toEqual(["2", "3", "1"]); // מחוזות, נפות, רשויות
  });

  test("by status puts open datasets first, blocked last", async ({ page }) => {
    await home(page);
    await page.getByLabel("מיון לפי").selectOption("status");
    await expect.poll(() => order(page)).toEqual(["3", "1", "2"]); // open ones by name, then the blocked one
  });

  test("by last update puts the newest first and blocked last", async ({ page }) => {
    await home(page);
    await page.getByLabel("מיון לפי").selectOption("updated");
    await expect.poll(async () => (await order(page)).pop()).toBe("2");
  });

  test("the choice is kept when the page reloads, and 'סדר המאגרים' restores the default", async ({ page }) => {
    await home(page);
    await page.getByLabel("מיון לפי").selectOption("name");
    await page.reload();
    await expect(page.getByLabel("מיון לפי")).toHaveValue("name");
    await page.getByLabel("מיון לפי").selectOption("id");
    await expect.poll(() => order(page)).toEqual(["1", "2", "3"]);
  });

  test("a consumer can sort too", async ({ page }) => {
    await home(page, "consumer");
    await expect(page.getByLabel("מיון לפי")).toBeVisible();
  });
});

test("the catalog sort offers name, status and last update", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/catalog");
  await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
  const sel = page.getByLabel("מיון לפי");
  await expect(sel.locator("option")).toHaveText(["שם", "סטטוס", "עודכן לאחרונה"]);
  await sel.selectOption("status");
  await expect(sel).toHaveValue("status");
});

test("each dataset row shows a small icon, not its number", async ({ page }) => {
  await home(page);
  const tag = page.locator("ol.card li a > span:first-child").first();
  const box = await tag.boundingBox();
  expect(box.width).toBeLessThanOrEqual(40);
  // the number is still there for screen readers, but takes no visible space
  const num = tag.locator("bdi");
  await expect(num).toHaveText("01");
  const nb = await num.boundingBox();
  expect(nb.width).toBeLessThanOrEqual(2);
});

test.describe("hierarchy: data lake -> datasets", () => {
  test("the home list shows the lake db-oref-base with its datasets inside it", async ({ page }) => {
    await home(page);
    await expect(page.getByRole("heading", { name: "מאגרי מידע" })).toBeVisible();
    const lake = page.locator("ol.card li.agm-lake");
    await expect(lake).toHaveCount(1);
    await expect(lake).toContainText("db-oref-base");
    await expect(lake).toContainText("3 מאגרי נתונים");
    // the lake heading comes first and the datasets are indented under it
    const [ly, ry, lx, rx] = await page.evaluate(() => {
      const l = document.querySelector("ol.card li.agm-lake").getBoundingClientRect();
      const r = document.querySelector("ol.card li:not(.agm-lake)").getBoundingClientRect();
      return [l.top, r.top, l.right, r.right];
    });
    expect(ly).toBeLessThan(ry);
    expect(rx).toBeLessThan(lx);
  });

  test("a dataset keeps its lake when the list is sorted", async ({ page }) => {
    await home(page);
    await page.getByLabel("מיון לפי").selectOption("status");
    await expect(page.locator("ol.card li.agm-lake")).toHaveCount(1);
    await expect.poll(() => order(page)).toEqual(["3", "1", "2"]);
  });
});

test("everything sits under one lake, named in Hebrew, with its db code beside it", async ({ page }) => {
  await home(page);
  const lake = page.locator("ol.card li.agm-lake");
  await expect(lake).toHaveCount(1);
  await expect(lake.locator("strong")).toHaveText("מאגר הגיאוגרפיה המנהלית");
  await expect(lake).toContainText("db-oref-base");
  await expect(page.getByRole("heading", { name: "מאגרי מידע" })).toBeVisible();
  await expect(page.getByText("אגמי נתונים")).toHaveCount(0);
});

test.describe("the lake is a dropdown", () => {
  test("clicking it folds the datasets away and opens them again", async ({ page }) => {
    await home(page);
    const btn = page.locator("ol.card li.agm-lake .agm-lake-btn");
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("ol.card li:not(.agm-lake)").first()).toBeVisible();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("ol.card li:not(.agm-lake)").first()).toBeHidden();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("ol.card li:not(.agm-lake)").first()).toBeVisible();
  });

  test("works from the keyboard and is remembered while the tab stays open", async ({ page }) => {
    await home(page);
    const btn = page.locator("ol.card li.agm-lake .agm-lake-btn");
    await btn.focus();
    await page.keyboard.press("Enter");
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(page.locator("ol.card li.agm-lake .agm-lake-btn")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("ol.card li:not(.agm-lake)").first()).toBeHidden();
  });

  test("sorting still works while folded and keeps the state", async ({ page }) => {
    await home(page);
    await page.locator("ol.card li.agm-lake .agm-lake-btn").click();
    await page.getByLabel("מיון לפי").selectOption("name");
    await expect(page.locator("ol.card li.agm-lake .agm-lake-btn")).toHaveAttribute("aria-expanded", "false");
  });
});

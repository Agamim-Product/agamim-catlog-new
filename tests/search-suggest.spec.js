// Search suggestions: a dropdown of matching datasets appears after a few letters.
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { signIn } = require("./helpers");

async function openHome(page, role = "user") {
  await signIn(page, { role });
  await page.goto("/#/");
  await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
  await expect(page.locator("section.agm-hero form input")).toBeVisible();
}
const hero = (page) => page.locator("section.agm-hero form input");
const list = (page) => page.getByRole("listbox", { name: "הצעות לחיפוש" });

test.describe("home search", () => {
  test("nothing opens after one letter, a dropdown opens after two", async ({ page }) => {
    await openHome(page);
    await hero(page).click();
    await hero(page).pressSequentially("ר");
    await page.waitForTimeout(400);
    await expect(list(page)).toBeHidden();
    await hero(page).pressSequentially("ש");
    await expect(list(page)).toBeVisible();
    await expect(list(page).getByRole("option").first()).toContainText("רשויות מקומיות");
  });

  test("shows the matched letters, the lake, the owner and the access state", async ({ page }) => {
    await openHome(page);
    await hero(page).click();
    await hero(page).pressSequentially("מחוז");
    const opt = list(page).getByRole("option").first();
    await expect(opt).toContainText("מחוזות פיקוד העורף");
    await expect(opt.locator("mark")).toHaveText("מחוז");
    await expect(opt).toContainText("מאגר הגיאוגרפיה המנהלית");
    await expect(opt).toContainText("חסום"); // dataset 2 is blocked
  });

  test("finds by purpose and owner words, not only the name", async ({ page }) => {
    await openHome(page);
    await hero(page).click();
    await hero(page).pressSequentially("גבולות");
    await expect(list(page).getByRole("option", { name: /רשויות מקומיות/ })).toBeVisible();
    await expect(list(page).getByRole("option", { name: /נפות פיקוד העורף/ })).toBeVisible();
  });

  test("arrow keys and Enter open the chosen dataset", async ({ page }) => {
    await openHome(page);
    await hero(page).click();
    await hero(page).pressSequentially("נפות");
    await expect(list(page).getByRole("option").first()).toContainText("נפות פיקוד העורף");
    await page.keyboard.press("ArrowDown");
    await expect(list(page).getByRole("option").first()).toHaveAttribute("aria-selected", "true");
    await expect(hero(page)).toHaveAttribute("aria-activedescendant", "agm-sg-0");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/repo\/3/);
    await expect(list(page)).toBeHidden();
  });

  test("clicking a suggestion opens the dataset", async ({ page }) => {
    await openHome(page);
    await hero(page).click();
    await hero(page).pressSequentially("רשויות");
    await list(page).getByRole("option", { name: /רשויות מקומיות/ }).click();
    await expect(page).toHaveURL(/#\/repo\/1/);
  });

  test("Escape closes it, and Enter with no choice still runs the normal search", async ({ page }) => {
    await openHome(page);
    await hero(page).click();
    await hero(page).pressSequentially("רשויות");
    await expect(list(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list(page)).toBeHidden();
    await hero(page).pressSequentially(" מקומיות");
    await expect(list(page)).toBeVisible();
    await hero(page).press("Enter");
    await expect(page).toHaveURL(/#\/search\?q=/);
  });

  test("the last row searches the whole catalog", async ({ page }) => {
    await openHome(page);
    await hero(page).click();
    await hero(page).pressSequentially("נפות");
    await list(page).getByRole("option", { name: /בכל הקטלוג/ }).click();
    await expect(page).toHaveURL(/#\/search\?q=/);
  });

  test("says so when nothing matches", async ({ page }) => {
    await openHome(page);
    await hero(page).click();
    await hero(page).pressSequentially("zzzxqj");
    await expect(list(page)).toContainText("לא נמצא מאגר תואם");
    await expect(list(page).locator("#agm-sg-all")).toBeVisible();
  });

  test("a consumer gets suggestions too", async ({ page }) => {
    await openHome(page, "consumer");
    await hero(page).click();
    await hero(page).pressSequentially("רשו");
    await expect(list(page).getByRole("option").first()).toContainText("רשויות מקומיות");
  });
});

test.describe("header search", () => {
  test("opens suggestions under the opened search box on the catalog page", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/catalog");
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    const input = page.locator("header.no-print form input");
    await input.click();
    await input.pressSequentially("נפות");
    await expect(list(page)).toBeVisible();
    const [ib, lt] = await Promise.all([
      input.evaluate((e) => e.getBoundingClientRect().bottom),
      list(page).evaluate((e) => e.getBoundingClientRect().top),
    ]);
    expect(lt, "the list is below the search box").toBeGreaterThanOrEqual(ib);
    await list(page).getByRole("option", { name: /נפות פיקוד העורף/ }).click();
    await expect(page).toHaveURL(/#\/repo\/3/);
  });

  test("reflects an edit: the new name is found", async ({ page }) => {
    await signIn(page);
    await page.addInitScript(() => {
      if (!localStorage.getItem("agamim-edits-v1")) localStorage.setItem("agamim-edits-v1", JSON.stringify({ 1: { nameHe: "ערים וקהילות" } }));
    });
    await page.goto("/#/catalog");
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    const input = page.locator("header.no-print form input");
    await input.click();
    await input.pressSequentially("קהילות");
    await expect(list(page).getByRole("option").first()).toContainText("ערים וקהילות");
  });

  test("does not offer a deleted dataset", async ({ page }) => {
    await signIn(page);
    await page.addInitScript(() => {
      if (!localStorage.getItem("agamim-deleted-v1")) localStorage.setItem("agamim-deleted-v1", JSON.stringify(["3"]));
    });
    await page.goto("/#/catalog");
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    const input = page.locator("header.no-print form input");
    await input.click();
    await input.pressSequentially("נפות");
    await expect(list(page)).toBeVisible();
    await expect(list(page).getByRole("option", { name: /נפות פיקוד העורף/ })).toHaveCount(0);
  });
});

test("the open dropdown has no serious accessibility problems", async ({ page }) => {
  await openHome(page);
  await hero(page).click();
  await hero(page).pressSequentially("נפות");
  await expect(list(page)).toBeVisible();
  const r = await new AxeBuilder({ page }).include("#agm-suggest").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  expect(await hero(page).getAttribute("role")).toBe("combobox");
  expect(await hero(page).getAttribute("aria-expanded")).toBe("true");
});

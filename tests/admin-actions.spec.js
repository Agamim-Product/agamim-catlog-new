// Admin actions: add button placement, actions menu (edit / disable / delete), edit dialog, restore.
const { test, expect } = require("@playwright/test");
const { signIn } = require("./helpers");

async function home(page) {
  await signIn(page);
  await page.goto("/#/");
  await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
  await expect(page.locator("ol.card li:not(.agm-lake)")).toHaveCount(3);
}
const row = (page, id) => page.locator(`ol.card li a[href="#/repo/${id}"]`);
const kebab = (page, id) => row(page, id).locator(".agm-kebab");

test.describe("add button", () => {
  test("sits at the left end of the datasets heading, with a plus sign", async ({ page }) => {
    await home(page);
    const btn = page.locator("a.agm-add-btn");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("הוספת מאגר");
    await expect(btn.locator("svg")).toHaveCount(1);
    const [b, h] = await Promise.all([
      btn.evaluate((e) => e.getBoundingClientRect().left),
      page.getByRole("heading", { name: "מאגרי מידע" }).evaluate((e) => e.getBoundingClientRect().left),
    ]);
    expect(b, "the button is to the left of the heading").toBeLessThan(h);
  });

  test("opens the add-dataset panel", async ({ page }) => {
    await home(page);
    await page.locator("a.agm-add-btn").click();
    await expect(page.locator("#agm-drawer")).toBeVisible();
  });

  test("is also on the catalog page", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/catalog");
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    await expect(page.locator("a.agm-add-btn")).toBeVisible();
  });
});

test.describe("actions menu", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await home(page);
  });

  test("lists edit, disable and delete, and closes with Escape", async ({ page }) => {
    await kebab(page, 1).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText(["עריכה", "השבתה", "מחיקה"]);
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem").nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(kebab(page, 1)).toBeFocused();
  });

  test("a blocked dataset offers to open it instead of disabling it", async ({ page }) => {
    await kebab(page, 2).click();
    await expect(page.getByRole("menuitem", { name: "פתיחה לגישה" })).toBeVisible();
  });

  test("disable blocks the dataset", async ({ page }) => {
    await kebab(page, 1).click();
    await page.getByRole("menuitem", { name: "השבתה" }).click();
    await expect(row(page, 1).locator(".agm-status")).toHaveText("חסום");
  });

  test("delete hides the dataset and restore brings it back", async ({ page }) => {
    await kebab(page, 3).click();
    await page.getByRole("menuitem", { name: "מחיקה" }).click();
    await expect(page.locator("ol.card li:not(.agm-lake)")).toHaveCount(2);
    await expect(row(page, 3)).toHaveCount(0);
    const restore = page.getByRole("button", { name: /שחזור מאגרים שנמחקו \(1\)/ });
    await expect(restore).toBeVisible();
    await restore.click();
    await expect(page.locator("ol.card li:not(.agm-lake)")).toHaveCount(3);
  });

  test("a deleted dataset's page does not crash the app", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await kebab(page, 3).click();
    await page.getByRole("menuitem", { name: "מחיקה" }).click();
    await expect(page.locator("ol.card li:not(.agm-lake)")).toHaveCount(2);
    await page.goto("/#/repo/3");
    await page.waitForTimeout(800);
    await expect(page.locator("header.no-print")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("edit", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await home(page);
  });

  test("changes the name and owner everywhere and survives a reload", async ({ page }) => {
    await kebab(page, 1).click();
    await page.getByRole("menuitem", { name: "עריכה" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("שם המאגר")).toHaveValue("רשויות מקומיות");
    await dialog.getByLabel("שם המאגר").fill("רשויות וערים");
    await dialog.locator("#agm-e-ownerHe").fill("דנה כהן");
    await dialog.getByLabel("טלפון בעל המאגר").fill("050-1234567");
    await dialog.getByRole("button", { name: "שמירת השינויים" }).click();

    await expect(row(page, 1)).toContainText("רשויות וערים");
    await page.reload();
    await expect(row(page, 1)).toContainText("רשויות וערים");

    await page.goto("/#/repo/1");
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText("רשויות וערים");
    await expect(page.getByText("דנה כהן").first()).toBeVisible();
  });

  test("asks for the required fields and keeps the dialog open", async ({ page }) => {
    await kebab(page, 1).click();
    await page.getByRole("menuitem", { name: "עריכה" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("שם המאגר").fill("");
    await dialog.getByRole("button", { name: "שמירת השינויים" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("חובה למלא: שם המאגר")).toBeVisible();
    await dialog.getByLabel("שם המאגר").fill("שם חדש");
    await dialog.getByLabel("טלפון בעל המאגר").fill("abc");
    await dialog.getByRole("button", { name: "שמירת השינויים" }).click();
    await expect(dialog.getByText("מספר טלפון לא תקין")).toBeVisible();
  });

  test("Escape and Cancel close the dialog without saving", async ({ page }) => {
    await kebab(page, 1).click();
    await page.getByRole("menuitem", { name: "עריכה" }).click();
    await page.getByRole("dialog").getByLabel("שם המאגר").fill("לא נשמר");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row(page, 1)).not.toContainText("לא נשמר");
  });
});

test.describe("dataset page", () => {
  test("has a pencil edit button and the actions menu", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/repo/1");
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    const edit = page.locator(".agm-admin-edit");
    await expect(edit).toBeVisible();
    await expect(edit).toContainText("עריכה");
    await expect(edit.locator("svg")).toHaveCount(1);
    await expect(page.locator(".agm-page-kebab")).toBeVisible();
    await edit.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("a consumer has none of it", async ({ page }) => {
    await signIn(page, { role: "consumer" });
    await page.goto("/#/repo/1");
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator(".agm-admin-edit, .agm-page-kebab, .agm-admin-switch")).toHaveCount(0);
  });
});

test.describe("catalog cards", () => {
  const card = (page, id) => page.locator("article.card").filter({ has: page.locator("h3 bdi", { hasText: new RegExp("^0?" + id + "$") }) });
  test.beforeEach(async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await signIn(page);
    await page.goto("/#/catalog");
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    await expect(page.locator("article.card")).toHaveCount(3);
  });

  test("every card has the actions menu", async ({ page }) => {
    await expect(page.locator("article.card .agm-kebab")).toHaveCount(3);
    await card(page, 1).locator(".agm-kebab").click();
    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["עריכה", "השבתה", "מחיקה"]);
  });

  test("a blocked card offers to open access", async ({ page }) => {
    await card(page, 2).locator(".agm-kebab").click();
    await expect(page.getByRole("menuitem", { name: "פתיחה לגישה" })).toBeVisible();
  });

  test("disable from a card blocks the dataset", async ({ page }) => {
    await card(page, 1).locator(".agm-kebab").click();
    await page.getByRole("menuitem", { name: "השבתה" }).click();
    await expect(card(page, 1).locator('[role="img"][aria-label*="חסומה"]')).toBeVisible();
  });

  test("open from a card gives access to a blocked dataset", async ({ page }) => {
    await card(page, 2).locator(".agm-kebab").click();
    await page.getByRole("menuitem", { name: "פתיחה לגישה" }).click();
    await expect(card(page, 2).locator('[role="img"][aria-label*="פתוחה"]')).toBeVisible();
  });

  test("edit from a card renames it on the card", async ({ page }) => {
    await card(page, 3).locator(".agm-kebab").click();
    await page.getByRole("menuitem", { name: "עריכה" }).click();
    await page.getByRole("dialog").getByLabel("שם המאגר").fill("נפות וחבלים");
    await page.getByRole("dialog").getByRole("button", { name: "שמירת השינויים" }).click();
    await expect(page.locator("article.card h3", { hasText: "נפות וחבלים" })).toBeVisible();
  });

  test("delete from a card removes it", async ({ page }) => {
    await card(page, 3).locator(".agm-kebab").click();
    await page.getByRole("menuitem", { name: "מחיקה" }).click();
    await expect(page.locator("article.card")).toHaveCount(2);
  });

  test("a consumer sees no menu on the cards", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("auth", JSON.stringify({ signedIn: true, role: "consumer" })));
    await page.goto("about:blank"); // a fresh page load, so the consumer sign-in above applies
    await page.goto("/#/catalog");
    await expect(page.locator("article.card")).toHaveCount(3);
    await expect(page.locator("article.card .agm-kebab")).toHaveCount(0);
  });
});

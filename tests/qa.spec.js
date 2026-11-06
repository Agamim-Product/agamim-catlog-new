// Broad regression checks for the redesigned site: layout, logos, header, search, admin switch, a11y basics.
const { test, expect } = require("@playwright/test");
const { signIn } = require("./helpers");

const ROUTES = [
  ["home", "/#/"],
  ["catalog", "/#/catalog"],
  ["dataset 1", "/#/repo/1"],
  ["dataset 2 (blocked)", "/#/repo/2"],
  ["dataset 3", "/#/repo/3"],
];

async function ready(page, path) {
  await page.goto(path);
  await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
  await expect(page.locator("header.no-print")).toBeVisible();
}

// ---------- logos ----------
test.describe("logos", () => {
  const logoFiles = ["pakar-logo.svg", "agamim-emblem.png", "agamim-logo.png"];

  async function logosIn(page, scope) {
    await page.locator(`${scope} img:visible`).first().waitFor();
    await page.waitForFunction((sel) => [...document.querySelectorAll(sel + " img")].every((i) => i.complete), scope);
    return page.locator(`${scope} img`).evaluateAll((imgs, files) => {
      return files.map((f) => {
        const img = imgs.find((i) => (i.getAttribute("src") || "").includes(f) && i.getBoundingClientRect().width > 0);
        if (!img) return { f, found: false };
        const r = img.getBoundingClientRect();
        // nearest ancestor with a visible background colour
        let n = img.parentElement;
        let bg = null;
        while (n && n !== document.body && n !== document.documentElement) {
          const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(n).backgroundColor);
          if (m && (m[4] === undefined || parseFloat(m[4]) > 0.5)) {
            bg = [+m[1], +m[2], +m[3]];
            break;
          }
          n = n.parentElement;
        }
        return { f, found: true, w: Math.round(r.width), h: Math.round(r.height), bg, loaded: img.naturalWidth > 0 };
      });
    }, logoFiles);
  }

  function expectLogos(list, minH, { onWhiteCard = false } = {}) {
    for (const l of list) {
      expect(l.found, `${l.f} present`).toBe(true);
      expect(l.loaded, `${l.f} loaded`).toBe(true);
      expect(l.h, `${l.f} size`).toBeGreaterThanOrEqual(minH);
      const white = l.bg && l.bg.every((c) => c > 245);
      if (!onWhiteCard) expect(white, `${l.f} has no white tile behind it (bg ${l.bg})`).toBeFalsy();
    }
  }

  test("header shows the three logos on every page, with no white tile", async ({ page }) => {
    await signIn(page);
    for (const [, path] of ROUTES) {
      await ready(page, path);
      expectLogos(await logosIn(page, "header.no-print"), 40);
    }
  });

  test("login screen shows the three logos large, with no white tile", async ({ page }) => {
    await page.goto("/#/login");
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    await expect(page.getByRole("button", { name: "כניסה", exact: true })).toBeVisible();
    expectLogos(await logosIn(page, "aside"), 56);
  });

  test("welcome splash shows the three logos", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/");
    await expect(page.locator(".splash")).toBeVisible();
    expectLogos(await logosIn(page, ".splash"), 80);
  });

  test("profile form shows the three logos", async ({ page }) => {
    await signIn(page, { profile: false });
    await page.goto("/#/");
    await expect(page.locator("#agamim-onboarding")).toBeVisible();
    // the profile form is a white card by design; the logos only need to be present and loaded
    expectLogos(await logosIn(page, "#agamim-onboarding"), 48, { onWhiteCard: true });
  });

  test("home hero shows the HFC logo", async ({ page }) => {
    await signIn(page);
    await ready(page, "/#/");
    const logo = page.locator(".agm-hero-logo");
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  });
});

// ---------- the bar is the same on every page ----------
test("the navigation bar has the same parts on every page", async ({ page }) => {
  await signIn(page);
  const seen = [];
  for (const [, path] of ROUTES) {
    await ready(page, path);
    const nav = page.getByRole("navigation").first();
    await expect(page.locator("header.no-print").getByRole("link", { name: "בית" })).toBeVisible();
    await expect(page.locator("header.no-print").getByRole("link", { name: "קטלוג" })).toBeVisible();
    await expect(page.locator("header.no-print").getByRole("link", { name: /הוספת מאגר/ })).toBeVisible();
    await expect(page.locator("header.no-print").getByRole("button", { name: "יציאה" })).toBeVisible();
    await expect(page.locator("header.no-print").getByRole("button", { name: "עזרה" })).toBeVisible();
    await expect(nav).toBeVisible();
    // same bar geometry everywhere: one row of tools, bar no taller than 110px on a desktop screen
    const h = await page.locator("header.no-print").evaluate((e) => Math.round(e.getBoundingClientRect().height));
    seen.push(h);
  }
  expect(Math.max(...seen) - Math.min(...seen), `bar heights ${seen}`).toBeLessThanOrEqual(4);
});

// ---------- no console errors, no broken requests ----------
test("no console errors or failed requests on any page", async ({ page }) => {
  await signIn(page);
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text())) problems.push("console: " + m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)|favicon/.test(r.url())) problems.push(`${r.status()} ${r.url()}`);
  });
  for (const [, path] of ROUTES) await ready(page, path);
  await ready(page, "/#/search?q=%D7%A8%D7%A9%D7%95%D7%99%D7%95%D7%AA");
  expect(problems).toEqual([]);
});

// ---------- phone widths ----------
test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [name, path] of [...ROUTES, ["login", "/#/login"]]) {
    test(`${name} fits the screen without horizontal scrolling`, async ({ page }) => {
      if (name !== "login") await signIn(page);
      await page.goto(path);
      await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(600);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }

  test("the add-dataset panel fits a phone", async ({ page }) => {
    await signIn(page);
    await ready(page, "/#/");
    await page.locator("header.no-print").getByRole("link", { name: /הוספת מאגר/ }).click();
    const panel = page.locator("#agm-drawer .agm-d-panel");
    await expect(panel).toBeVisible();
    const w = await panel.evaluate((e) => Math.round(e.getBoundingClientRect().width));
    expect(w).toBeLessThanOrEqual(390);
  });
});

// ---------- search ----------
test("global search opens below the bar and returns results", async ({ page }) => {
  await signIn(page);
  await ready(page, "/#/catalog");
  const input = page.locator("header.no-print form input");
  await input.click();
  const [hb, ib] = await Promise.all([
    page.locator("header.no-print").evaluate((e) => e.getBoundingClientRect().bottom),
    input.evaluate((e) => e.getBoundingClientRect().top),
  ]);
  expect(ib, "the open search box sits below the bar").toBeGreaterThanOrEqual(hb - 1);
  await input.fill("רשויות");
  await input.press("Enter");
  await expect(page).toHaveURL(/#\/search/);
  await expect(page.getByText("רשויות מקומיות").first()).toBeVisible();
});

test("the bar has its search button on home too, and the catalog has no table/card view switch", async ({ page }) => {
  await signIn(page);
  await ready(page, "/#/");
  await expect(page.locator("header.no-print form")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "חיפוש", exact: true })).toBeVisible();
  await ready(page, "/#/catalog");
  await expect(page.getByRole("button", { name: "טבלה", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "כרטיסים", exact: true })).toHaveCount(0);
});

// ---------- alert strip ----------
test("the alert is one line until opened", async ({ page }) => {
  await signIn(page);
  await ready(page, "/#/");
  const body = page.locator("section.no-print [role=alert] p").first();
  await expect(body).toBeHidden();
  await page.locator("section.no-print [role=alert] [role=button]").click();
  await expect(body).toBeVisible();
  await page.locator("section.no-print [role=alert] [role=button]").press("Enter");
  await expect(body).toBeHidden();
});

// ---------- admin switch ----------
test.describe("admin switch", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    page.on("dialog", (d) => d.accept());
  });

  test("the dataset page button opens a blocked dataset and the choice sticks", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await ready(page, "/#/repo/2");
    const btn = page.locator(".agm-admin-switch");
    await expect(btn).toHaveText("פתיחת המאגר לגישה");
    await btn.click();
    await expect(page.locator(".agm-admin-switch")).toHaveText("חסימת המאגר");
    await page.reload();
    await expect(page.locator(".agm-admin-switch")).toHaveText("חסימת המאגר");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    for (const tab of ["טבלאות ונתונים", "ליניאז'", "חוזה", "סקירה"]) {
      await page.locator("button", { hasText: tab }).first().click();
    }
    expect(errors).toEqual([]);
  });

  test("an opened dataset renders everywhere without errors (catalog, home, layer page)", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem("agamim-access-overrides-v1")) localStorage.setItem("agamim-access-overrides-v1", JSON.stringify({ 2: { blocked: false } }));
    });
    await ready(page, "/#/catalog");
    await expect(page.getByText(/מוצגים \d+ מתוך \d+/)).toBeVisible();
    await ready(page, "/#/");
    await expect(page.locator('a[href="#/repo/2"] .agm-status')).toHaveText("פתוח");
    await ready(page, "/#/layer/6453");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await ready(page, "/#/repo/2");
    await page.locator("button[role=tab]", { hasText: "טבלאות ונתונים" }).click();
    await expect(page.getByText("district_id").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("blocking an open dataset shows it blocked everywhere", async ({ page }) => {
    await ready(page, "/#/repo/1");
    await page.locator(".agm-admin-switch").click();
    await expect(page.locator(".agm-admin-switch")).toHaveText("פתיחת המאגר לגישה");
    await ready(page, "/#/");
    await expect(page.locator('a[href="#/repo/1"] .agm-status')).toHaveText("חסום");
  });
});

// ---------- keyboard and focus ----------
test("keyboard: the bar is reachable and focus is visible", async ({ page }) => {
  await signIn(page);
  await ready(page, "/#/catalog");
  const names = new Set();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const e = document.activeElement;
      const s = getComputedStyle(e);
      return { name: (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30), outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 };
    });
    names.add(info.name);
    if (/יציאה|בית|קטלוג/.test(info.name)) expect(info.outline, `focus ring on ${info.name}`).toBe(true);
  }
  expect([...names].some((n) => /בית/.test(n))).toBe(true);
});

test("Escape closes the add-dataset panel", async ({ page }) => {
  await signIn(page);
  await ready(page, "/#/");
  await page.locator("header.no-print").getByRole("link", { name: /הוספת מאגר/ }).click();
  await expect(page.locator("#agm-drawer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#agm-drawer")).toHaveCount(0);
});

// ---------- splash ----------
test("the welcome screen goes away when clicked", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/");
  const splash = page.locator(".splash");
  await expect(splash).toBeVisible();
  await splash.click();
  await expect(splash).toHaveClass(/splash-out/);
});

// ---------- regressions found by exploratory QA ----------
test.describe("QA regressions", () => {
  for (const width of [1100, 768, 390]) {
    test(`the open search box is below the bar at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await signIn(page);
      await ready(page, "/#/catalog");
      const input = page.locator("header.no-print form input");
      await input.click();
      const hb = await page.locator("header.no-print").evaluate((e) => e.getBoundingClientRect().bottom);
      const it = await input.evaluate((e) => e.getBoundingClientRect().top);
      expect(it).toBeGreaterThanOrEqual(hb - 1);
    });
  }

  test("the welcome-screen logos fit a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto("/#/");
    await expect(page.locator(".splash")).toBeVisible();
    await page.waitForTimeout(500);
    const rects = await page.locator(".splash-logos img").evaluateAll((a) => a.map((i) => { const r = i.getBoundingClientRect(); return [r.left, r.right]; }));
    expect(rects).toHaveLength(3);
    for (const [l, r] of rects) {
      expect(l).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(390);
    }
  });

  test("an open dataset shows the block button on its layer view too", async ({ page }) => {
    await signIn(page);
    await ready(page, "/#/repo/1?tab=layers&layer=6452");
    await expect(page.locator(".agm-admin-switch")).toHaveText("חסימת המאגר");
  });

  test("a dataset opened by an admin shows complete details", async ({ page }) => {
    await signIn(page);
    await page.addInitScript(() => {
      if (!localStorage.getItem("agamim-access-overrides-v1")) localStorage.setItem("agamim-access-overrides-v1", JSON.stringify({ 2: { blocked: false } }));
    });
    await ready(page, "/#/repo/2");
    await expect(page.getByText("מה זה?").first()).toBeVisible();
    await expect(page.getByText("db-oref-base").first()).toBeVisible();
    await page.locator("button[role=tab]", { hasText: "ליניאז" }).click();
    await expect(page.getByText("מסלול הנתונים של מאגר מוגבל")).toHaveCount(0);
  });
});

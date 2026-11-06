// Automated accessibility scan (axe-core). Serious and critical problems fail the build.
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { signIn } = require("./helpers");

const PAGES = [
  ["home", "/#/", "user"],
  ["catalog", "/#/catalog", "user"],
  ["dataset", "/#/repo/1", "user"],
  ["dataset (blocked)", "/#/repo/2", "user"],
  ["home as consumer", "/#/", "consumer"],
];

async function scan(page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const [name, path, role] of PAGES) {
  test(`accessibility: ${name}`, async ({ page }) => {
    await signIn(page, { role });
    await page.goto(path);
    await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
    await expect(page.locator("header.no-print")).toBeVisible();
    await page.waitForTimeout(700);
    expect(await scan(page)).toEqual([]);
  });
}

test("accessibility: login", async ({ page }) => {
  await page.goto("/#/login");
  await page.locator(".splash").click({ timeout: 3000 }).catch(() => {});
  await expect(page.getByRole("button", { name: "כניסה", exact: true })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("accessibility: add-dataset form", async ({ page }) => {
  await signIn(page);
  await page.goto("/add-dataset.html");
  await page.locator("#f-table").selectOption("curated.public_shelters");
  expect(await scan(page)).toEqual([]);
});

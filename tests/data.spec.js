// Data-integrity checks on the static JSON files. No browser needed.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "data", "consumer");
const read = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));

test.describe("published data", () => {
  test("every JSON file parses", () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) expect(() => read(f), f).not.toThrow();
  });

  test("repositories.json and layers.json are consistent", () => {
    const repos = read("repositories.json");
    const layers = read("layers.json");
    expect(repos.total).toBe(repos.items.length);
    expect(layers.total).toBe(layers.items.length);

    const repoIds = repos.items.map((r) => r.id);
    expect(new Set(repoIds).size).toBe(repoIds.length);
    const layerIds = layers.items.map((l) => l.id);
    expect(new Set(layerIds).size).toBe(layerIds.length);
  });

  test("every published dataset has its full set of files", () => {
    const repos = read("repositories.json");
    const layers = read("layers.json");
    for (const r of repos.items) {
      for (const name of [
        `repositories__${r.id}.json`,
        `repositories__${r.id}__layers.json`,
        `repositories__${r.id}__quality-profile.json`,
        `repositories__${r.id}__lineage__d1.json`,
        `repositories__${r.id}__lineage__d2.json`,
        `repositories__${r.id}__lineage__d3.json`
      ]) {
        expect(fs.existsSync(path.join(DIR, name)), name).toBe(true);
      }
      expect(read(`repositories__${r.id}.json`).id).toBe(r.id);
    }
    for (const l of layers.items) {
      expect(fs.existsSync(path.join(DIR, `layers__${l.id}.json`)), `layer ${l.id}`).toBe(true);
      expect(repos.items.some((r) => r.id === l.repoId), `layer ${l.id} -> repo ${l.repoId}`).toBe(true);
    }
  });
});

test.describe("simulated DE staging database", () => {
  const db = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "staging", "db-tables.json"), "utf8"));

  test("has tables with the technical fields the form relies on", () => {
    expect(db.tables.length).toBeGreaterThanOrEqual(3);
    for (const t of db.tables) {
      for (const key of ["sqlName", "dbName", "titleHe", "rowCount", "createdAt", "lastUpdated", "cadence", "loadTime"]) {
        expect(t[key], `${t.sqlName}.${key}`).toBeDefined();
      }
      expect(["daily", "onChange"]).toContain(t.cadence);
      expect(t.columns.length).toBeGreaterThan(0);
      expect(t.sampleRows.length).toBeGreaterThan(0);
      expect(t.columns.filter((c) => c.pk)).toHaveLength(1);
    }
  });

  test("sqlNames are unique and not already published", () => {
    const names = db.tables.map((t) => t.sqlName);
    expect(new Set(names).size).toBe(names.length);
    const published = read("layers.json").items.map((l) => l.sqlName);
    for (const n of names) expect(published).not.toContain(n);
  });
});

test.describe("catalog with nothing registered locally", () => {
  test("shows exactly the 3 published datasets", async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("auth", JSON.stringify({ signedIn: true, role: "user" }));
      localStorage.setItem("agamim-profile-v1", JSON.stringify({ name: "x", role: "y", rank: "סרן", hierarchy: "HFC", endDate: "2027-01-01" }));
    });
    await page.goto("/#/catalog");
    await expect(page.getByText("מוצגים 3 מתוך 3")).toBeVisible();
  });
});

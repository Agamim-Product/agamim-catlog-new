// Shared helpers for the Playwright tests.

const PROFILE = {
  name: "דנה כהן",
  role: "ראש צוות נתונים",
  rank: "סרן",
  hierarchy: "HFC",
  endDate: "2027-06-30"
};

/**
 * Starts the page already signed in (the app keeps its sign-in in sessionStorage under "auth").
 * Pass { profile: false } to leave the first-visit profile unset.
 */
async function signIn(page, { profile = true, role = "user" } = {}) {
  await page.addInitScript(
    ({ withProfile, p, r }) => {
      sessionStorage.setItem("auth", JSON.stringify({ signedIn: true, role: r }));
      if (withProfile && !localStorage.getItem("agamim-profile-v1")) {
        localStorage.setItem("agamim-profile-v1", JSON.stringify(p));
      }
    },
    { withProfile: profile, p: PROFILE, r: role }
  );
}

/** Opens the catalog and waits until the dataset list has rendered. */
async function openCatalog(page) {
  await page.goto("/#/catalog");
  await page.getByText(/מוצגים \d+ מתוך \d+/).waitFor();
}

/** Opens the "add dataset" side panel from the nav and returns the form's frame locator. */
async function openPanel(page) {
  await page.getByRole("navigation").getByRole("link", { name: /הוספת מאגר/ }).click();
  await page.locator("#agm-drawer").waitFor();
  return page.frameLocator("#agm-drawer iframe");
}

/** Walks the form (inside the panel or standalone) from table pick to the review screen. */
async function fillDataset(form, { table = "curated.public_shelters", purpose, owner, phone }) {
  await form.locator("#f-table").selectOption(table);
  await form.getByRole("button", { name: "המשך לפרטי המאגר" }).click();
  await form.locator("#f-purposeHe").fill(purpose);
  await form.locator("#f-ownerHe").fill(owner);
  await form.locator("#f-ownerPhone").fill(phone);
  await form.getByRole("button", { name: "המשך לסקירה" }).click();
}

module.exports = { PROFILE, signIn, openCatalog, openPanel, fillDataset };

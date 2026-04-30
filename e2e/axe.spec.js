import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TEST_PASSPHRASE = 'aurae2e-passphrase';
const E2E_QUERY = '?e2e=1';

async function waitForTestHook(page) {
  await page.waitForFunction(() => Boolean(window.__auraTest), null, { timeout: 10_000 });
}

async function freshLoad(page) {
  await page.goto(`/${E2E_QUERY}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/${E2E_QUERY}`);
  await waitForTestHook(page);
}

async function setupViaApi(page, passphrase = TEST_PASSPHRASE) {
  await page.evaluate(async (pw) => {
    await window.__auraTest.secure.setupNew(pw);
  }, passphrase);
}

async function unlockViaApi(page, passphrase = TEST_PASSPHRASE) {
  await page.evaluate(async (pw) => {
    await window.__auraTest.secure.unlock(pw);
  }, passphrase);
}

async function expectNoAxeViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test.describe('a11y — axe-core', () => {
  test('setup screen has no violations', async ({ page }) => {
    await freshLoad(page);
    await expect(page.getByRole('heading', { name: /Bescherm je gegevens/ })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('unlock screen has no violations', async ({ page }) => {
    await freshLoad(page);
    await setupViaApi(page);
    await page.goto(`/${E2E_QUERY}`);
    await waitForTestHook(page);
    await expect(page.getByRole('heading', { name: /Welkom terug/ })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('dashboard has no violations', async ({ page }) => {
    await freshLoad(page);
    await setupViaApi(page);
    await page.goto(`/${E2E_QUERY}`);
    await waitForTestHook(page);
    await unlockViaApi(page);
    await page.evaluate(() => {
      window.__auraTest.storage.saveProfile({
        name: 'Test',
        dob: '1995-01-01',
        cycleStart: '2026-04-01',
        avgCycleLength: 28,
        avgPeriodLength: 5,
      });
    });
    await page.goto(`/${E2E_QUERY}`);
    await waitForTestHook(page);
    await page.locator('#aura-pw-unlock').fill(TEST_PASSPHRASE);
    await page.getByRole('button', { name: /^Ontgrendelen$/ }).click();
    await expect(page.getByRole('heading', { name: /^Aura$/ })).toBeVisible({ timeout: 10_000 });
    await expectNoAxeViolations(page);
  });
});

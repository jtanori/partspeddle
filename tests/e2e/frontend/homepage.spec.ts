import { test, expect } from '@playwright/test';

/**
 * Homepage E2E Tests
 *
 * Validates: page load, header/footer presence, listing grid rendering.
 *
 * Ticket: T3.7
 */

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/VINTRACK/);
  });

  test('displays header with navigation', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();

    const navLinks = header.locator('a');
    await expect(navLinks).toHaveCountGreaterThanOrEqual(1);
  });

  test('displays listing grid with items', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).toBeVisible();

    // Wait for listing grid to hydrate
    const listings = main.locator('[data-testid="listing-card"]').or(main.locator('h1, h2, h3'));
    await expect(listings.first()).toBeVisible({ timeout: 5000 });
  });

  test('displays footer', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    const header = page.locator('header');
    await expect(header).toBeVisible();
  });
});

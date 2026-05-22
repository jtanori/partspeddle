import { test, expect } from '@playwright/test';

/**
 * Search E2E Tests
 *
 * Validates: search page load, query input, filter sidebar, results display.
 *
 * Ticket: T3.7
 */

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/search');
  });

  test('loads search page', async ({ page }) => {
    await expect(page).toHaveTitle(/VINTRACK/);

    const heading = page.locator('h1');
    await expect(heading).toContainText('Search');
  });

  test('displays search input', async ({ page }) => {
    const searchInput = page.locator('input[type="search"]').first();
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', /Search/i);
  });

  test('displays filter sidebar', async ({ page }) => {
    const filters = page.locator('text=Filters').first();
    await expect(filters).toBeVisible();
  });

  test('shows empty state initially', async ({ page }) => {
    // When no query and no Algolia index, should show empty state
    const emptyState = page.locator('text=No results').or(page.locator('text=Start typing'));
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });

  test('search input accepts text', async ({ page }) => {
    const searchInput = page.locator('input[type="search"]').first();
    await searchInput.fill('rolex');
    await expect(searchInput).toHaveValue('rolex');
  });

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    const searchInput = page.locator('input[type="search"]').first();
    await expect(searchInput).toBeVisible();
  });
});

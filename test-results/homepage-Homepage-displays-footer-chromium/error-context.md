# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: homepage.spec.ts >> Homepage >> displays footer
- Location: tests/e2e/frontend/homepage.spec.ts:37:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
Call log:
  - navigating to "http://localhost:3000/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Homepage E2E Tests
  5  |  *
  6  |  * Validates: page load, header/footer presence, listing grid rendering.
  7  |  *
  8  |  * Ticket: T3.7
  9  |  */
  10 | 
  11 | test.describe('Homepage', () => {
  12 |   test.beforeEach(async ({ page }) => {
> 13 |     await page.goto('/');
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
  14 |   });
  15 | 
  16 |   test('loads successfully', async ({ page }) => {
  17 |     await expect(page).toHaveTitle(/VINTRACK/);
  18 |   });
  19 | 
  20 |   test('displays header with navigation', async ({ page }) => {
  21 |     const header = page.locator('header');
  22 |     await expect(header).toBeVisible();
  23 | 
  24 |     const navLinks = header.locator('a');
  25 |     await expect(navLinks).toHaveCountGreaterThanOrEqual(1);
  26 |   });
  27 | 
  28 |   test('displays listing grid with items', async ({ page }) => {
  29 |     const main = page.locator('main');
  30 |     await expect(main).toBeVisible();
  31 | 
  32 |     // Wait for listing grid to hydrate
  33 |     const listings = main.locator('[data-testid="listing-card"]').or(main.locator('h1, h2, h3'));
  34 |     await expect(listings.first()).toBeVisible({ timeout: 5000 });
  35 |   });
  36 | 
  37 |   test('displays footer', async ({ page }) => {
  38 |     const footer = page.locator('footer');
  39 |     await expect(footer).toBeVisible();
  40 |   });
  41 | 
  42 |   test('is responsive on mobile', async ({ page }) => {
  43 |     await page.setViewportSize({ width: 375, height: 667 });
  44 |     await page.reload();
  45 | 
  46 |     const header = page.locator('header');
  47 |     await expect(header).toBeVisible();
  48 |   });
  49 | });
  50 | 
```
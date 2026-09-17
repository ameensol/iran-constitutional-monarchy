import { expect, test } from '@playwright/test';

test('public light theme', async ({ page }) => {
  await page.goto('/en');
  await expect(page).toHaveScreenshot('public-landing-light.png', { fullPage: true });
});

test('Persian landing hero composition', async ({ page }) => {
  await page.goto('/fa');
  await expect(page).toHaveScreenshot('landing-persian-hero.png');
});

test('simulator dark theme and reset dialog', async ({ page }) => {
  await page.goto('/en/simulate');
  await expect(page).toHaveScreenshot('simulator-dark.png', { fullPage: true });
  await page.getByRole('button', { name: 'Reset Lab' }).click();
  await expect(page).toHaveScreenshot('simulator-reset-dialog.png');
});

test('Persian RTL constitution', async ({ page }) => {
  await page.goto('/fa/constitution');
  await expect(page).toHaveScreenshot('constitution-persian-rtl.png', { fullPage: true });
});

test('Persian RTL simulator', async ({ page }) => {
  await page.goto('/fa/simulate');
  await expect(page).toHaveScreenshot('simulator-persian-rtl.png', { fullPage: true });
});

test('Persian RTL simulator on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fa/simulate');
  await expect(page).toHaveScreenshot('simulator-persian-mobile.png', { fullPage: true });
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
});

test('mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page).toHaveScreenshot('mobile-navigation.png');
});

test('design-system overlays', async ({ page }) => {
  await page.goto('/en/dev/design-system');
  await page.getByRole('button', { name: 'Open dialog' }).click();
  await expect(page).toHaveScreenshot('design-system-dialog.png');
});

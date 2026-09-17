import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function expectNoCriticalA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
}

test('landing launches Genesis without an account or wallet', async ({ page }) => {
  await page.goto('/en');
  await expect(page.getByRole('heading', { name: 'A constitution you can test.' })).toBeVisible();
  await page.getByRole('link', { name: /Start the 5-minute guided tour/ }).click();
  await expect(page).toHaveURL(/\/en\/simulate\/tours\/genesis$/);
  await expect(page.getByText('The Shah narrator is an authored narrative device for this tour.')).toBeVisible();
});

test('language switch preserves the route and applies Persian RTL', async ({ page }) => {
  await page.goto('/en/constitution');
  await page.getByRole('button', { name: 'فا' }).click();
  await expect(page).toHaveURL(/\/fa\/constitution$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'قانون اساسی', level: 1 })).toBeVisible();
  await expect(page.locator('.constitution-article')).toHaveCount(66);
});

test('Persian landing keeps its actions visible and constellation centered', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/fa');
  const actions = page.locator('.landing-hero__actions');
  const constellation = page.locator('.constellation');
  const core = page.locator('.constellation__core');
  const topNode = page.locator('.constellation__node').first();
  await expect(actions).toBeVisible();
  await expect(constellation).toBeVisible();
  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const actionsBox = rect('.landing-hero__actions');
    const constellationBox = rect('.constellation');
    const coreBox = rect('.constellation__core');
    const topNodeBox = rect('.constellation__node');
    const center = (box: DOMRect) => box.left + box.width / 2;
    return {
      actionsBottom: actionsBox.bottom,
      viewportHeight: window.innerHeight,
      coreOffset: Math.abs(center(coreBox) - center(constellationBox)),
      topNodeOffset: Math.abs(center(topNodeBox) - center(constellationBox)),
    };
  });
  expect(metrics.actionsBottom).toBeLessThan(metrics.viewportHeight);
  expect(metrics.coreOffset).toBeLessThanOrEqual(1);
  expect(metrics.topNodeOffset).toBeLessThanOrEqual(1);
  await expect(core).toContainText('مردم');
  await expect(topNode).toContainText('تاج');
});

test('simulator language switch preserves a nested view and saved state', async ({ page }) => {
  await page.goto('/en/simulate/institutions/court');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('constitution-lab-simulation') ?? '{}').state?.day);
  await page.getByRole('button', { name: 'فا' }).click();
  await expect(page).toHaveURL(/\/fa\/simulate\/institutions\/court$/);
  await expect(page.getByRole('heading', { name: 'دیوان عالی' })).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('constitution-lab-simulation') ?? '{}').state?.day);
  expect(after).toBe(before);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('simulation autosaves and Reset Lab clears progress', async ({ page }) => {
  await page.goto('/en/simulate');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('constitution-lab-simulation') ?? '{}');
    return typeof saved.state?.day;
  })).toBe('number');
  const startDay = await page.evaluate(() => JSON.parse(localStorage.getItem('constitution-lab-simulation') ?? '{}').state?.day ?? 0);
  await page.getByRole('button', { name: 'Step one day' }).click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('constitution-lab-simulation') ?? '{}').state?.day)).toBe(startDay + 1);
  await page.reload();
  await expect(page.getByText(new RegExp(`Day ${startDay + 1}, Year`))).toBeVisible();
  await page.getByRole('button', { name: 'Reset Lab' }).click();
  await expect(page.getByRole('dialog', { name: 'Reset the laboratory?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset Lab' }).click();
  await expect(page.getByText(new RegExp(`Day ${startDay}, Year`))).toBeVisible();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('constitution-lab-simulation') ?? '{}').state?.day)).toBe(startDay);
});

test('feedback remains an unsent local preview', async ({ page }) => {
  await page.goto('/en/community');
  await page.getByRole('textbox', { name: 'Message' }).fill('Local accessibility feedback');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Validate feedback' }).click();
  await expect(page.getByRole('status')).toContainText('Nothing was transmitted');
});

test('keyboard navigation, reduced motion, and 320px overflow guard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/en');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);
  const metrics = await page.evaluate(() => ({
    animation: getComputedStyle(document.querySelector('.public-page')!).animationDuration,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  expect(Number.parseFloat(metrics.animation)).toBeLessThanOrEqual(0.001);
  expect(metrics.overflow).toBe(false);
});

test('public routes have no critical axe violations', async ({ page }) => {
  for (const route of ['/en', '/en/learn', '/en/constitution', '/en/transparency', '/en/about', '/en/community']) {
    await page.goto(route);
    await expectNoCriticalA11yViolations(page);
  }
});

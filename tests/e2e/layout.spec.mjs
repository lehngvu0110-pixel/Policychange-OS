import { test, expect } from '@playwright/test';

// Không có thanh cuộn ngang ở màn hình hẹp, sáng và tối; menu điều hướng mở/đóng được.
for (const scheme of ['light', 'dark']) {
  test('bố cục ' + scheme + ' không tràn ngang', async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const route of ['tong-quan', 'thay-doi', 'hang-doi', 'so-kiem-toan', 'kho-tai-lieu', 'so-dang-ky', 'danh-gia']) {
      await page.goto('/index.html?offline=1#/' + route);
      await expect(page.locator('main h1')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, route).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
}

test('menu điều hướng trên màn hình hẹp', async ({ page }) => {
  await page.goto('/index.html?offline=1#/tong-quan');
  const menu = page.getByRole('button', { name: 'Mở menu điều hướng' });
  if (!(await menu.isVisible())) test.skip();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('link', { name: /Sổ kiểm toán/ }).click();
  await expect(page.locator('main h1')).toHaveText('Sổ kiểm toán');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

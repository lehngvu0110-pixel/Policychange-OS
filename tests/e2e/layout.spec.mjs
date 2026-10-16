import { test, expect } from '@playwright/test';
import { createFakeBackend } from './fake-backend.mjs';

test('email đăng nhập dài được rút gọn và sidebar không tràn ngang', async ({ page }) => {
  const email = 'tai-khoan-thu-nghiem-voi-ten-dang-nhap-rat-dai@example.edu.vn';
  await createFakeBackend().attach(page);
  await page.addInitScript(email => localStorage.setItem('policychange-os:session', JSON.stringify({
    email, access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600
  })), email);
  await page.goto('/index.html#/tong-quan');
  const menu = page.getByRole('button', { name: 'Mở menu điều hướng' });
  if (await menu.isVisible()) await menu.click();
  const account = page.locator('.account-email');
  await expect(account).toBeVisible();
  await expect(account).toHaveAttribute('title', email);
  expect(await account.evaluate(el => getComputedStyle(el).textOverflow)).toBe('ellipsis');
  expect(await account.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.locator('#sidebar').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
});

// Không có thanh cuộn ngang ở màn hình hẹp, sáng và tối; menu điều hướng mở/đóng được.
for (const scheme of ['light', 'dark']) {
  test('bố cục ' + scheme + ' không tràn ngang', async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const route of ['huong-dan', 'tong-quan', 'thay-doi', 'hang-doi', 'so-kiem-toan', 'kho-tai-lieu', 'so-dang-ky', 'danh-gia']) {
      await page.goto('/index.html?offline=1#/' + route);
      await expect(page.locator('main h1')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, route).toBeLessThanOrEqual(0);
    }
    await page.goto('/thu-nghiem.html');
    const formOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(formOverflow, 'thu-nghiem').toBeLessThanOrEqual(0);
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

test('hướng dẫn mở được trên màn hình hẹp và không tràn ngang', async ({ page }) => {
  await page.goto('/index.html?offline=1#/tong-quan');
  const top = page.getByRole('button', { name: 'Hướng dẫn và thuật ngữ' });
  if (await top.isVisible()) await top.click();
  else { await page.getByRole('button', { name: 'Mở menu điều hướng' }).click(); await page.getByRole('button', { name: 'Hướng dẫn & thuật ngữ' }).click(); }
  const dlg = page.getByRole('dialog', { name: 'Cách dùng PolicyChange OS' });
  await expect(dlg).toBeVisible();
  const overflow = await dlg.evaluate(d => d.scrollWidth - d.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await dlg.getByRole('button', { name: 'Đóng hướng dẫn' }).click();
  await expect(dlg).toBeHidden();
});

test('chữ lớn: không tràn ngang ở màn hình Hướng dẫn và Thay đổi quy định', async ({ page }) => {
  await page.goto('/index.html?offline=1#/huong-dan');
  await page.getByRole('button', { name: 'Bật chữ lớn' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-size', 'lg');
  for (const route of ['huong-dan', 'thay-doi', 'tong-quan']) {
    await page.goto('/index.html?offline=1#/' + route);
    await expect(page.locator('main h1')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, route).toBeLessThanOrEqual(0);
  }
});

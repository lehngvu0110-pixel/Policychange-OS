import { test, expect } from '@playwright/test';
import { createFakeBackend } from './fake-backend.mjs';

// Chế độ dùng chung với máy chủ giả lập (cùng js/policy-server.js như Edge Function thật).
test('dùng chung: trưởng phòng ban hành, vị trí U2 thành hồ sơ; trưởng phòng Thanh tra quyết trên hàng đợi', async ({ page }) => {
  const backend = createFakeBackend();
  await backend.attach(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/index.html#/thay-doi');
  await expect(page.locator('#connPill')).toContainText('Dùng chung');
  await page.selectOption('#personaSel', 'tp-dt');
  await page.fill('#reqText', 'Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.');
  await page.getByRole('button', { name: /Hiểu yêu cầu/ }).click();
  await page.getByRole('button', { name: 'Phân tích tác động' }).click();
  await page.getByRole('button', { name: 'Ban hành' }).click();
  await expect(page.locator('.toast').last()).toContainText('Hồ sơ CR-1 còn 3 vị trí');
  expect(backend.db.ledger).toHaveLength(6);

  // Người khác, cùng dữ liệu dùng chung.
  await page.selectOption('#personaSel', 'tp-tt');
  await page.goto('/index.html#/hang-doi');
  await expect(page.getByRole('button', { name: /Việc của tôi · 1/ })).toBeVisible();
  const card = page.locator('article.prop').filter({ hasText: 'QT-07' });
  await expect(card.locator('.tag.done')).toHaveText('CR-1');
  await card.getByRole('button', { name: /^A · Không/ }).click();
  await expect(page.locator('.toast').last()).toContainText('Đã giữ nguyên QT-07 dòng 2');
  expect(backend.db.ledger.at(-1).actor).toBe('Người · Trưởng phòng Thanh tra – Pháp chế (demo)');
  expect(backend.db.decisions).toHaveLength(1);
  await expect(page.getByRole('button', { name: /Việc của tôi · 0/ })).toBeVisible();

  // Hiệu trưởng quyết U3 và chuyên viên quyết U1 → hồ sơ đóng.
  await page.selectOption('#personaSel', 'ht');
  await page.locator('article.prop').filter({ hasText: 'QD-01' }).getByRole('button', { name: /^B · / }).click();
  await expect(page.locator('.toast').last()).toContainText('còn 1 vị trí');
  await page.selectOption('#personaSel', 'cv-dt');
  await page.locator('article.prop').filter({ hasText: 'HD-04' }).getByRole('button', { name: /^A · Có/ }).click();
  await expect(page.locator('.toast').last()).toContainText('đã xử lý xong');
  expect(backend.db.openChanges[0].status).toBe('closed');
  expect(errors).toEqual([]);
});

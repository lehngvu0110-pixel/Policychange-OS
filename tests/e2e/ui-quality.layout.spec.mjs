import { test, expect } from '@playwright/test';
import { createFakeBackend } from './fake-backend.mjs';

const request = 'Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.';

test('quyết định giữ nguyên, cảnh báo ban hành và bố cục có dữ liệu', async ({ page }, testInfo) => {
  await page.goto('/index.html?offline=1#/thay-doi');
  await page.fill('#reqText', request);
  await page.getByRole('button', { name: 'Phân tích tác động', exact: true }).click();
  await expect(page.locator('.verdict')).toContainText('3 câu hỏi');
  await expect(page.getByRole('link', { name: 'Trả lời việc của tôi' })).toBeVisible();
  await page.selectOption('#personaSel', 'cv-dt');
  await page.locator('#prop-P6').getByRole('button', { name: /^B · Không/ }).click();
  await expect(page.locator('#prop-P6 .diff > div').last()).toContainText('7 ngày');
  await page.selectOption('#personaSel', 'tp-dt');
  await expect(page.locator('.partial-notice')).toBeVisible();
  await expect(page.locator('.partial-notice')).toContainText('R-PK-01 vẫn có giá trị 7 ngày');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('workspace.png'), fullPage: true, scale: 'css' });
  await page.screenshot({ path: testInfo.outputPath('workspace-viewport.png'), scale: 'css' });
  await page.locator('#prop-P6').screenshot({ path: testInfo.outputPath('kept-decision.png'), scale: 'css', style: '.topbar,.commitbar,.toasts{visibility:hidden}' });
  await page.getByRole('button', { name: 'Ban hành', exact: true }).click();
  await expect(page.locator('.toast').last()).toContainText('Đã ban hành 6 thay đổi');
  await page.locator('.commitbar').getByRole('link', { name: 'Xem sổ kiểm toán' }).click();
  await expect(page.locator('.notice.ok')).toContainText('7 bản ghi');
  const patch = page.locator('tbody tr').filter({ hasText: 'PATCH' }).first();
  await expect(patch.locator('.ledger-basis > p').first()).not.toContainText('well_formed_input');
  await expect(patch.locator('.ledger-basis')).toContainText('Cấp ban hành: Trưởng đơn vị chủ quản');
  await expect(patch.locator('.ledger-technical')).not.toHaveAttribute('open');
  await expect(patch.locator('.diff')).toBeVisible();
  await patch.getByText('Chi tiết kỹ thuật', { exact: true }).click();
  await expect(patch.locator('.ledger-technical[open]')).toContainText('well_formed_input');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('ledger.png'), fullPage: true, scale: 'css' });
});

test('AI chậm có phản hồi rõ và không cho ban hành khi đang rà', async ({ page }) => {
  await createFakeBackend().attach(page);
  let releaseReview;
  const reviewGate = new Promise(resolve => { releaseReview = resolve; });
  let releaseExtraction;
  const extractionGate = new Promise(resolve => { releaseExtraction = resolve; });
  await page.route('**/functions/v1/ai-*', async route => {
    const body = route.request().postDataJSON();
    if (body.probe) return route.fulfill({ json: { available: true, model: 'test-model' } });
    if (route.request().url().endsWith('/ai-extract')) {
      await extractionGate;
      return route.fulfill({ json: { available: false, reason: 'Old-value evidence does not match the registered current value.' } });
    }
    await reviewGate;
    return route.fulfill({ json: { available: false, reason: 'AI không khả dụng.' } });
  });
  await page.goto('/index.html#/thay-doi');
  await expect(page.locator('#aiPill')).toContainText('test-model');
  await page.fill('#reqText', request);
  await page.getByRole('button', { name: 'Phân tích tác động', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đang đọc yêu cầu…', exact: true })).toBeDisabled();
  await expect(page.getByText('Đang đọc câu mô tả và đối chiếu quy định.', { exact: false })).toBeVisible();
  releaseExtraction();
  await expect(page.locator('.notice.ok')).toContainText('AI chưa xác nhận đúng giá trị hiện hành');
  await expect(page.getByText('AI đang rà soát các đề xuất.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ban hành', exact: true })).toBeDisabled();
  await expect(page.locator('#prop-P6 .choices')).toBeVisible();
  releaseReview();
  await expect(page.getByRole('button', { name: 'Ban hành', exact: true })).toBeEnabled();
});

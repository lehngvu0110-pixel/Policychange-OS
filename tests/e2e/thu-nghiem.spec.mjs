import { test, expect } from '@playwright/test';

// Phiếu dùng thử: gửi thẳng vào bảng user_test_responses (máy chủ giả lập ở đây), kèm số đo thời gian nếu đồng ý.
test('phiếu dùng thử: bắt điền mục bắt buộc, gửi đúng nội dung, kèm số đo thời gian, hiện lời cảm ơn', async ({ page }) => {
  /** @type {any[]} */ const sent = [];
  await page.route('**/rest/v1/user_test_responses', async route => {
    sent.push({ body: route.request().postDataJSON(), headers: route.request().headers() });
    await route.fulfill({ status: 201, body: '' });
  });
  await page.addInitScript(() => localStorage.setItem('policychange-os:timings', JSON.stringify([
    { at: '2026-10-13T10:00:00Z', source: 'local', actor: 'x', category: 'U1', docId: 'HD-04', positions: 1, ms: 12000 },
    { at: '2026-10-13T10:01:00Z', source: 'sandbox', actor: 'x', category: 'U1', docId: 'WEB', positions: 3, ms: 5000 }])));
  await page.goto('/thu-nghiem.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Nhờ anh/chị dùng thử');
  await expect(page.locator('#timingText')).toContainText('1 câu trả lời, trung vị 12 giây');

  await page.getByRole('button', { name: 'Gửi phiếu' }).click();
  await expect(page.locator('#msg')).toContainText('mục có dấu *');
  expect(sent).toHaveLength(0);

  await page.fill('#congViec', 'Thư ký văn phòng khoa');
  await page.getByRole('radio', { name: 'Thỉnh thoảng' }).check();
  for (const name of ['viec1', 'viec2', 'viec3']) await page.locator(`input[name="${name}"][value="duoc"]`).check();
  await page.locator('input[name="diemHieu"][value="4"]').check();
  await page.locator('input[name="diemDung"][value="3"]').check();
  await page.fill('#cau1', 'Câu hỏi U1 hơi dài.');
  await page.locator('input[name="ghiTen"][value="vai-tro"]').check();
  await page.getByRole('button', { name: 'Gửi phiếu' }).click();
  await expect(page.getByText('Em cảm ơn anh/chị nhiều ạ!')).toBeVisible();

  expect(sent).toHaveLength(1);
  const { body, headers } = sent[0];
  expect(headers.prefer).toBe('return=minimal');
  expect(body.answers).toMatchObject({ congViec: 'Thư ký văn phòng khoa', vanBan: 'thinh-thoang', viec1: 'duoc', diemHieu: '4', diemDung: '3', cau1: 'Câu hỏi U1 hơi dài.', ghiTen: 'vai-tro' });
  expect(body.timing).toMatchObject({ n: 1, medianMs: 12000 });
  expect(body.timing.rows[0]).toEqual({ category: 'U1', positions: 1, ms: 12000 });
  expect(JSON.stringify(body)).not.toContain('HD-04');
});

test('phiếu dùng thử: máy chủ lỗi thì báo rõ và vẫn sao chép được câu trả lời', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/rest/v1/user_test_responses', route => route.fulfill({ status: 500, body: '' }));
  await page.goto('/thu-nghiem.html');
  await page.fill('#congViec', 'Sinh viên năm 2');
  await page.getByRole('radio', { name: 'Không', exact: true }).first().check();
  for (const name of ['viec1', 'viec2', 'viec3']) await page.locator(`input[name="${name}"][value="vuong"]`).check();
  await page.locator('input[name="diemHieu"][value="2"]').check();
  await page.locator('input[name="diemDung"][value="2"]').check();
  await page.fill('#cau1', 'Không biết bấm đâu.');
  await page.locator('input[name="ghiTen"][value="khong"]').check();
  await page.getByRole('button', { name: 'Gửi phiếu' }).click();
  await expect(page.locator('#msg')).toContainText('Chưa gửi được');
  await expect(page.getByRole('button', { name: 'Gửi phiếu' })).toBeEnabled();
  await page.getByRole('button', { name: 'Sao chép câu trả lời' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Khó hiểu nhất: Không biết bấm đâu.');
});

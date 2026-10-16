import { test, expect } from '@playwright/test';

async function fillRequired(page) {
  await page.fill('#congViec', 'Chuyên viên đào tạo');
  for (const [name, value] of Object.entries({ vanBan: 'co', viec1: 'duoc', viec2: 'vuong', viec3: 'duoc', diemHieu: '4', diemDung: '3', ghiTen: 'khong' })) {
    await page.locator(`input[name="${name}"][value="${value}"]`).check();
  }
  await page.fill('#cau1', 'Cần hướng dẫn rõ hơn.');
}

test('phiếu lưu nháp sau tải lại, giữ lựa chọn riêng tư và cập nhật tiến độ', async ({ page }) => {
  await page.goto('/thu-nghiem.html');
  await fillRequired(page);
  await page.locator('#sendTiming').evaluate(el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect(page.locator('#answerProgress')).toHaveJSProperty('value', 9);
  await page.reload();
  await expect(page.locator('#congViec')).toHaveValue('Chuyên viên đào tạo');
  await expect(page.locator('#cau1')).toHaveValue('Cần hướng dẫn rõ hơn.');
  await expect(page.locator('input[name="viec2"][value="vuong"]')).toBeChecked();
  await expect(page.locator('#sendTiming')).not.toBeChecked();
  await expect(page.locator('#draftStatus')).toContainText('Đã khôi phục');
  await expect(page.locator('#progressText')).toContainText('9/9');
});

test('báo thiếu ngay tại câu hỏi, sửa xong gỡ lỗi và thang điểm dùng được bằng bàn phím', async ({ page }) => {
  let requests = 0;
  await page.route('**/rest/v1/user_test_responses', async route => { requests++; await route.fulfill({ status: 201, body: '' }); });
  await page.goto('/thu-nghiem.html');
  await page.getByRole('button', { name: 'Gửi phiếu', exact: true }).click();
  await expect(page.locator('.field-error')).toHaveCount(9);
  await expect(page.locator('#congViec')).toBeFocused();
  await expect(page.locator('#congViec')).toHaveAttribute('aria-describedby', 'congViec-error');
  await page.fill('#congViec', 'Sinh viên');
  await expect(page.locator('#congViec')).not.toHaveAttribute('aria-invalid');
  await expect(page.locator('.field-error')).toHaveCount(8);
  const first = page.locator('#scaleHieu input').first();
  await first.focus();
  await first.press('Space');
  await first.press('ArrowRight');
  await expect(page.locator('#scaleHieu input[value="2"]')).toBeChecked();
  expect(requests).toBe(0);
});

test('gửi một lần và chuyển focus đến xác nhận khi thành công', async ({ page }) => {
  let requests = 0;
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  await page.route('**/rest/v1/user_test_responses', async route => { requests++; await gate; await route.fulfill({ status: 201, body: '' }); });
  await page.goto('/thu-nghiem.html');
  await fillRequired(page);
  await page.getByRole('button', { name: 'Gửi phiếu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đang gửi…', exact: true })).toBeDisabled();
  await expect(page.locator('#congViec')).toBeDisabled();
  await page.locator('#f').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  finish();
  await expect(page.locator('#thanks')).toBeVisible();
  await expect(page.locator('#thanks')).toBeFocused();
  await expect(page.locator('#surveyWorkspace')).toBeHidden();
  expect(requests).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('policychange-os:test-draft'))).toBeNull();
});

test('mạng treo quá 15 giây mở lại nút gửi và giữ nguyên câu trả lời', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/rest/v1/user_test_responses', async route => { await gate; await route.fulfill({ status: 201, body: '' }).catch(() => {}); });
  await page.goto('/thu-nghiem.html');
  await fillRequired(page);
  await page.clock.install();
  await page.getByRole('button', { name: 'Gửi phiếu', exact: true }).click();
  await expect(page.locator('#f')).toHaveAttribute('aria-busy', 'true');
  await page.clock.fastForward(15001);
  await expect(page.locator('#msg')).toContainText('Chưa nhận được xác nhận gửi sau 15 giây');
  await expect(page.getByRole('button', { name: 'Gửi phiếu', exact: true })).toBeEnabled();
  await expect(page.locator('#congViec')).toHaveValue('Chuyên viên đào tạo');
  await expect(page.locator('#congViec')).toBeEnabled();
  await expect(page.locator('#thanks')).toBeHidden();
  release();
});

test('clipboard bị chặn vẫn có nội dung để sao chép thủ công', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Denied')) } }));
  await page.goto('/thu-nghiem.html');
  await page.fill('#congViec', 'Thư ký khoa');
  await page.getByRole('button', { name: 'Sao chép câu trả lời', exact: true }).click();
  await expect(page.locator('#copyFallback')).toBeVisible();
  await expect(page.locator('#copyText')).toHaveValue(/Công việc: Thư ký khoa/);
  await expect(page.locator('#copyText')).toBeFocused();
});

for (const scheme of ['light', 'dark']) {
  test('phiếu ' + scheme + ': đọc rõ thang điểm và không tràn ngang', async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/thu-nghiem.html?fbclid=test');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Mở ứng dụng/ })).toHaveAttribute('href', /offline=1/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const positions = await page.locator('#scaleHieu .opt').evaluateAll(els => els.map(el => ({ top: el.getBoundingClientRect().top, width: el.getBoundingClientRect().width })));
    expect(new Set(positions.map(p => p.top)).size).toBe(1);
    expect(positions.every(p => p.width >= 44)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('survey.png'), scale: 'css', fullPage: true });
    await page.locator('#cham-diem').screenshot({ path: testInfo.outputPath('ratings.png'), scale: 'css' });
  });
}

import { test, expect } from '@playwright/test';

// Căn cứ pháp lý, hiệu lực và lịch sử phiên bản: chạy ở chế độ Ngoại tuyến với kho văn bản MÔ PHỎNG.
const APP = '/index.html?offline=1';
const REQUEST = 'Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.';

async function open(page, route) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(APP + '#/' + route);
  await expect(page.locator('#connPill')).toContainText('Ngoại tuyến');
  return errors;
}
async function runSample(page) {
  await page.getByRole('button', { name: 'Khám phá văn bản liên quan' }).click();
  await expect(page.getByRole('heading', { name: 'Danh sách văn bản' })).toBeVisible();
}
const row = (page, text) => page.locator('tbody tr').filter({ hasText: text });

test('khám phá nhiều tầng trên văn bản mẫu: nhãn mô phỏng, kết quả dang dở, tiếp tục được', async ({ page }) => {
  const errors = await open(page, 'phap-ly');
  await expect(page.locator('main h1')).toHaveText('Căn cứ pháp lý');
  await expect(page.locator('#lgMode option[value="live"]')).toBeDisabled();
  await runSample(page);
  await expect(page.locator('.notice.sandbox')).toContainText('Dữ liệu mô phỏng');
  await expect(page.getByText('Kết quả chưa đầy đủ.')).toBeVisible();
  await expect(page.getByText(/Chạm giới hạn độ sâu/)).toBeVisible();
  // Văn bản tìm qua nhiều tầng và qua metadata ngược.
  await expect(row(page, '22/2018/QH99')).toContainText('Chưa xác minh được');
  await expect(row(page, '60/2024/NĐ-MP')).toContainText('Chưa xác minh được');
  await expect(row(page, '50/2021/NĐ-MP')).toContainText('Hết hiệu lực một phần');
  await expect(row(page, '15/2026/TT-BMP')).toContainText('Chưa có hiệu lực');
  await expect(row(page, '33/2019/TT-BMP')).toContainText('Chưa xác minh được');
  await expect(row(page, '05/2020/QĐ-BMP')).toContainText('Chưa xác minh được');
  await expect(row(page, '01/2005/TT-BMP')).toContainText('Chưa tra (giới hạn)');
  await expect(page.locator('#legalGraph svg [data-action="legal-node"]').first()).toBeVisible();
  // Đường dẫn mô phỏng không bao giờ thành liên kết bấm được.
  await expect(page.locator('a[href^="fixture:"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Tiếp tục khám phá' }).click();
  await expect(page.getByText('Kết quả chưa đầy đủ.')).toBeVisible();
  await expect(page.getByText(/Còn tham chiếu chưa tìm được/)).toBeVisible();
  await expect(row(page, '01/2005/TT-BMP')).not.toContainText('Chưa tra');
  expect(errors).toEqual([]);
});

test('câu chèn lệnh trong văn bản tải về không đổi kết luận; chi tiết có bằng chứng và chuỗi thay thế', async ({ page }) => {
  await open(page, 'phap-ly');
  await runSample(page);
  await row(page, '10/2016/TT-BMP').getByRole('button', { name: 'Chi tiết' }).click();
  const detail = page.locator('#legalDetail');
  await expect(detail).toContainText('Hết hiệu lực / bị thay thế');
  await expect(detail).toContainText('Bị thay thế bởi 08/2021/TT-BMP');
  await expect(detail).toContainText('mô phỏng, không có đường dẫn thật');
  await expect(detail).not.toContainText('Còn hiệu lực');
});

test('đổi ngày xét hiệu lực thì kết luận đổi theo', async ({ page }) => {
  await open(page, 'phap-ly');
  await runSample(page);
  await page.fill('#lgAsOf', '2020-01-01');
  await page.locator('#lgAsOf').dispatchEvent('change');
  await expect(row(page, '08/2021/TT-BMP')).toContainText('Chưa có hiệu lực');
  await expect(row(page, '10/2016/TT-BMP')).toContainText('Chưa xác minh được');
});

test('chi tiết giữ lỗi và trang ứng viên chưa đối chiếu', async ({ page }) => {
  await open(page, 'phap-ly');
  await page.evaluate(() => {
    const original = window.PolicyChangeLegalFixtures.createFixtureAdapter;
    window.PolicyChangeLegalFixtures.createFixtureAdapter = opts => {
      const adapter = original(opts), resolve = adapter.resolve;
      adapter.resolve = async ref => {
        const result = await resolve(ref);
        if (result.doc) result.doc.retrievalFailures = [{ code: 'http_403', url: 'https://vbpl.vn/synthetic-candidate', reason: 'Trang ứng viên mô phỏng từ chối truy cập.' }];
        return result;
      };
      return adapter;
    };
  });
  await runSample(page);
  await row(page, '11/2012/QH99').getByRole('button', { name: 'Chi tiết' }).click();
  await expect(page.locator('#legalDetail')).toContainText('Trang ứng viên chưa xác minh');
  await expect(page.locator('#legalDetail')).toContainText('http_403');
  await expect(page.locator('#legalDetail')).toContainText('từ chối truy cập');
});

test('cảnh báo hiệu lực chuyển người xem lại trước khi ban hành, không đổi kết quả phân xử', async ({ page }) => {
  await open(page, 'phap-ly');
  await runSample(page);
  await page.goto(APP + '#/thay-doi');
  await page.fill('#reqText', REQUEST);
  await page.getByRole('button', { name: 'Phân tích tác động' }).click();
  await expect(page.getByRole('heading', { name: /Kết quả phân xử/ })).toBeVisible();
  const before = await page.locator('article.prop').count();
  await expect(page.getByText('Cảnh báo hiệu lực văn bản căn cứ')).toBeVisible();
  await expect(page.getByText(/Phạm vi tra cứu: Chưa xác minh được/)).toBeVisible();
  const commit = page.getByRole('button', { name: 'Ban hành' });
  await expect(commit).toBeDisabled();
  await page.check('#legalAck');
  await expect(commit).toBeEnabled();
  expect(await page.locator('article.prop').count()).toBe(before);
  await page.goto(APP + '#/phap-ly');
  await page.fill('#lgAsOf', '2020-01-01');
  await page.locator('#lgAsOf').dispatchEvent('change');
  await page.goto(APP + '#/thay-doi');
  await expect(page.locator('#legalAck')).not.toBeChecked();
  await expect(commit).toBeDisabled();
  await page.check('#legalAck');
  await commit.click();
  await expect(page.getByText(/Đã ban hành \d+ thay đổi/).first()).toBeVisible();
});

test('lịch sử phiên bản: ban hành tạo bản mới, so sánh, khôi phục bằng hoàn tác và vẫn giữ lịch sử', async ({ page }) => {
  await open(page, 'thay-doi');
  await page.fill('#reqText', REQUEST);
  await page.getByRole('button', { name: 'Phân tích tác động' }).click();
  await expect(page.getByRole('heading', { name: /Kết quả phân xử/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ban hành' }).click();
  await expect(page.getByText(/Đã ban hành \d+ thay đổi/).first()).toBeVisible();

  await page.goto(APP + '#/kho-tai-lieu');
  const doc = page.locator('details.doc').filter({ hasText: 'QT-02' });
  await doc.locator('summary').click();
  await doc.getByRole('button', { name: 'Lịch sử phiên bản' }).click();
  const panel = page.locator('#historyPanel');
  await expect(panel).toContainText('Lịch sử phiên bản · QT-02');
  await expect(panel).toContainText('Lịch sử khớp với nội dung hiện tại');
  await expect(panel.locator('tbody tr')).toHaveCount(3);
  await expect(panel).toContainText('AI · động cơ tiền định');
  await expect(panel).toContainText('prover xác nhận');
  // So sánh bản gốc với hiện tại: thấy từ bị thay.
  await expect(panel.locator('.diff .old').first()).toContainText('7');
  await expect(panel.locator('.diff .new').first()).toContainText('5');

  await panel.locator('tbody tr').last().getByRole('button', { name: 'Khôi phục' }).click();
  await expect(page.getByText(/Đã khôi phục QT-02 về bản 0/).first()).toBeVisible();
  await expect(panel.locator('tbody tr')).toHaveCount(5);
  await expect(panel).toContainText('đã thu hồi');
  await page.goto(APP + '#/so-kiem-toan');
  await expect(page.locator('tbody')).toContainText('HOÀN TÁC bản ghi');
  await expect(page.getByText(/Chuỗi hợp lệ/)).toBeVisible();
});

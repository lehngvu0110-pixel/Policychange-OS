import { test, expect } from '@playwright/test';

const APP = '/index.html?offline=1';
const REQUEST = 'Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.';

async function open(page, route = 'tong-quan') {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(APP + '#/' + route);
  await expect(page.locator('#connPill')).toContainText('Ngoại tuyến');
  return errors;
}
async function persona(page, id) { await page.selectOption('#personaSel', id); }
async function analyze(page) {
  await page.goto(APP + '#/thay-doi');
  await page.fill('#reqText', REQUEST);
  await page.getByRole('button', { name: /Hiểu yêu cầu/ }).click();
  await expect(page.locator('.notice.ok')).toContainText('R-PK-01');
  await page.getByRole('button', { name: 'Phân tích tác động' }).click();
  await expect(page.getByRole('heading', { name: /Kết quả phân xử/ })).toBeVisible();
}

test('mọi màn hình mở được, không lỗi JavaScript', async ({ page }) => {
  const errors = await open(page);
  for (const [route, heading] of [['thay-doi', 'Thay đổi quy định'], ['hang-doi', 'Hàng đợi duyệt'], ['so-kiem-toan', 'Sổ kiểm toán'],
    ['kho-tai-lieu', 'Kho tài liệu'], ['so-dang-ky', /Sổ đăng ký/], ['danh-gia', 'Đánh giá độ chính xác'], ['tong-quan', /Quy định đổi một chỗ/]]) {
    await page.goto(APP + '#/' + route);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('phân tích → quyết định đúng thẩm quyền → ban hành → tải lại vẫn còn → hoàn tác', async ({ page }) => {
  await open(page);
  await analyze(page);
  await expect(page.locator('.stat').filter({ hasText: 'Vị trí bị ảnh hưởng' })).toContainText('9');
  await expect(page.locator('.graph svg')).toBeVisible();

  // Chuyên viên quyết được U1 thuộc Cổng thông tin sinh viên, nhưng không được ban hành thay đổi cấp 2.
  await persona(page, 'cv-dt');
  const u1 = page.locator('#prop-P6');
  await u1.getByRole('button', { name: /^B · Không/ }).click();
  await expect(u1).toContainText('Không — giữ nguyên');
  await expect(page.getByRole('button', { name: 'Ban hành' })).toBeDisabled();
  await expect(page.locator('.commitbar')).toContainText('không được ban hành');

  // U2 thuộc Phòng Thanh tra – Pháp chế: vai trò khác bị khoá.
  const u2 = page.locator('#prop-P9');
  await expect(u2.locator('.lock')).toContainText('Phòng Thanh tra');

  await persona(page, 'tp-dt');
  await page.getByRole('button', { name: 'Ban hành' }).click();
  await expect(page.locator('.toast').last()).toContainText('Đã ban hành 6 thay đổi');

  await page.goto(APP + '#/so-kiem-toan');
  await expect(page.locator('.notice.ok')).toContainText('Chuỗi hợp lệ · 7 bản ghi');
  await page.reload();
  await expect(page.locator('.notice.ok')).toContainText('Chuỗi hợp lệ · 7 bản ghi');

  const firstPatch = page.locator('tbody tr').filter({ hasText: 'PATCH' }).last();
  await firstPatch.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(page.locator('.notice.ok')).toContainText('8 bản ghi');
  await expect(page.locator('tbody tr').first()).toContainText('HOÀN TÁC bản ghi #1');
});

test('hàng đợi lọc theo vai trò; mục vượt thẩm quyền bị khoá kèm lý do', async ({ page }) => {
  await open(page);
  await analyze(page);
  await persona(page, 'tp-tc');
  await page.goto(APP + '#/hang-doi');
  await expect(page.getByRole('button', { name: /Việc của tôi · 0/ })).toBeVisible();
  await page.getByRole('button', { name: /Tất cả đang chờ · 3/ }).click();
  await expect(page).toHaveURL(/tab=all/);
  await expect(page.locator('article.prop .lock')).toHaveCount(3);
  await persona(page, 'ht');
  await page.getByRole('button', { name: /Việc của tôi/ }).click();
  await expect(page.locator('article.prop.U3 .choices')).toBeVisible();
});

test('Verify 9/9 và báo cáo tập độc lập', async ({ page }) => {
  await open(page, 'danh-gia');
  await page.getByRole('button', { name: 'Chạy Verify' }).click();
  await expect(page.locator('.notice').first()).toContainText('9/9 ca đạt');
  await page.getByRole('button', { name: 'Chạy tập mù 40 ca' }).click();
  await expect(page.locator('.stat').filter({ hasText: 'Tự sửa sai' })).toContainText('0');
  await expect(page.locator('.stat').filter({ hasText: 'Tỉ lệ bỏ sót' })).toContainText('0/23');
  await page.getByRole('button', { name: 'Tập phát triển 48 ca' }).click();
  await expect(page.locator('.stat').filter({ hasText: 'Tỉ lệ bỏ sót' })).toContainText('7,4');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải báo cáo CSV' }).click();
  expect((await download).suggestedFilename()).toBe('bao-cao-danh-gia.csv');
});

test('minh hoạ chạy trên bản sao tạm và thoát ra nguyên trạng', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Chạy', exact: true }).first().click();
  await expect(page.locator('#connPill')).toContainText('Minh hoạ');
  await expect(page.locator('.notice.sandbox')).toBeVisible();
  await expect(page.locator('article.prop')).toContainText('17/07/2025');
  await expect(page.locator('article.prop .tag.done')).toBeVisible();
  await page.getByRole('button', { name: 'Thoát minh hoạ' }).first().click();
  await expect(page.locator('#connPill')).toContainText('Ngoại tuyến');
  await page.goto(APP + '#/so-kiem-toan');
  await expect(page.locator('.empty')).toContainText('Sổ đang trống');
});

test('yêu cầu phạm vi toàn cục bị từ chối, kho không đổi', async ({ page }) => {
  await open(page, 'thay-doi');
  await page.fill('#reqText', 'Đổi tất cả các thời hạn 7 ngày thành 5 ngày.');
  await page.getByRole('button', { name: /Hiểu yêu cầu/ }).click();
  await expect(page.locator('.notice.error')).toContainText('Từ chối xử lý');
});

test('học từ phản hồi: trưởng đơn vị thêm neo, quy định cập nhật và ghi sổ', async ({ page }) => {
  await open(page, 'so-dang-ky');
  await persona(page, 'tp-dt');
  await page.fill('#anchor-R-PK-01', 'lưu bài thi');
  await page.locator('#anchor-R-PK-01').press('Enter');
  await expect(page.locator('.chip', { hasText: 'lưu bài thi' })).toBeVisible();
  await persona(page, 'cv-dt');
  await expect(page.locator('#anchor-R-PK-01')).toHaveCount(0);
  await page.goto(APP + '#/so-kiem-toan');
  await expect(page.locator('tbody')).toContainText('THÊM NEO R-PK-01');
});

test('câu giám khảo tự nghĩ ra: sai đại lượng, quy đổi tuần, không dấu → đều hỏi người, không dòng nào tự sửa', async ({ page }) => {
  await open(page, 'kho-tai-lieu');
  await persona(page, 'tp-dt');
  await page.fill('#ndTitle', 'Câu giám khảo');
  await page.fill('#ndBody', ['Kết quả phúc khảo được thông báo sau 7 ngày.', 'Sinh viên có một tuần để nộp đơn phúc khảo.', 'Han nop don phuc khao la 7 ngay.'].join('\n'));
  await page.getByRole('button', { name: 'Nạp vào kho' }).click();
  await expect(page.getByText(/Đã thêm .* vào kho./).first()).toBeVisible();
  await analyze(page);
  const judge = page.locator('article.prop').filter({ hasText: 'Câu giám khảo' });
  await expect(judge).toHaveCount(3);
  await expect(judge.filter({ hasText: 'U1' })).toHaveCount(3);
  await expect(judge.filter({ hasText: /quy đổi theo tuần/ })).toHaveCount(1);
  await expect(judge.filter({ hasText: /gõ không dấu/ })).toHaveCount(1);
});

// ---------- Hồi quy theo báo cáo kiểm thử 02/10/2026 ----------
test('F02: câu mới bị từ chối thì không còn kết quả cũ và nút Ban hành', async ({ page }) => {
  await open(page);
  await analyze(page);
  await expect(page.getByRole('button', { name: 'Ban hành' })).toBeEnabled();
  await page.fill('#reqText', 'Đổi tất cả các thời hạn 7 ngày thành 5 ngày.');
  await page.getByRole('button', { name: /Hiểu yêu cầu/ }).click();
  await expect(page.locator('.notice.error')).toContainText('Từ chối xử lý');
  await expect(page.getByRole('heading', { name: /Kết quả phân xử/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ban hành' })).toHaveCount(0);
  await expect(page.locator('#newVal')).toHaveValue('');
});

test('F02: sửa câu yêu cầu sau khi phân tích → khoá Ban hành tới khi phân tích lại', async ({ page }) => {
  await open(page);
  await analyze(page);
  await persona(page, 'tp-dt');
  await page.fill('#reqText', 'Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 3 ngày, do Trưởng phòng Đào tạo ban hành.');
  await expect(page.getByRole('button', { name: 'Ban hành' })).toBeDisabled();
  await expect(page.locator('[data-form-guard]')).toBeVisible();
  await page.fill('#reqText', REQUEST);
  await expect(page.getByRole('button', { name: 'Ban hành' })).toBeEnabled();
  await expect(page.locator('[data-form-guard]')).toBeHidden();
});

test('F07: sau chính lần ban hành của mình không hiện cảnh báo “kho đã thay đổi”', async ({ page }) => {
  await open(page);
  await analyze(page);
  await persona(page, 'tp-dt');
  await page.getByRole('button', { name: 'Ban hành' }).click();
  await expect(page.locator('.toast').last()).toContainText('Đã ban hành');
  await expect(page.getByText('Kho hoặc sổ đăng ký đã thay đổi sau lần phân tích này')).toHaveCount(0);
});

test('F06: “từ 7 xuống 5 ngày” được hiểu, kèm lưu ý đơn vị dùng chung', async ({ page }) => {
  await open(page, 'thay-doi');
  await page.fill('#reqText', 'Rút thời hạn nộp đơn phúc khảo từ 7 xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.');
  await page.getByRole('button', { name: /Hiểu yêu cầu/ }).click();
  await expect(page.locator('.notice.ok')).toContainText('R-PK-01');
  await expect(page.locator('.notice.ok')).toContainText('câu chỉ ghi đơn vị một lần');
  await expect(page.locator('#newVal')).toHaveValue('5 ngày');
});

test('ghé minh hoạ giữa chừng rồi thoát: phân tích, quyết định và biểu mẫu trở lại nguyên vẹn, vẫn ban hành được', async ({ page }) => {
  await open(page);
  await analyze(page);
  await persona(page, 'cv-dt');
  await page.locator('#prop-P6').getByRole('button', { name: /^B · Không/ }).click();
  for (const demo of ['demo-review', 'demo-refuse']) {
    await page.goto(APP + '#/tong-quan');
    await page.locator('[data-action="' + demo + '"]').click();
    await expect(page.locator('.notice.sandbox')).toBeVisible();
    await page.getByRole('button', { name: 'Thoát minh hoạ' }).first().click();
    await expect(page.locator('#connPill')).toContainText('Ngoại tuyến');
  }
  await page.goto(APP + '#/thay-doi');
  await expect(page.locator('#reqText')).toHaveValue(REQUEST);
  await expect(page.locator('#prop-P6')).toContainText('Không — giữ nguyên');
  await expect(page.locator('[data-form-guard]')).toBeHidden();
  await persona(page, 'tp-dt');
  await page.getByRole('button', { name: 'Ban hành' }).click();
  await expect(page.locator('.toast').last()).toContainText('Đã ban hành 6 thay đổi');
});

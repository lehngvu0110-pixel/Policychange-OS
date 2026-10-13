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

test('Minh hoạ 4: một câu ở ba nơi → một câu hỏi, trả lời một lần, đo thời gian quyết định', async ({ page }) => {
  await open(page);
  await page.locator('[data-action="demo-group"]').click();
  await expect(page.locator('.notice.sandbox')).toBeVisible();
  await expect(page).toHaveURL(/#\/hang-doi/);
  const card = page.locator('article.prop').filter({ hasText: 'Câu này xuất hiện ở 3 vị trí' });
  await expect(card).toHaveCount(1);
  await expect(page.locator('article.prop.U1')).toHaveCount(1);
  // Trên màn hình kết quả, hai vị trí đi kèm chỉ dẫn về câu hỏi chung; bấm chỉ dẫn không rời màn hình.
  await page.goto(APP + '#/thay-doi');
  await expect(page.getByText('3 vị trí cần người được gộp còn 1 câu hỏi')).toBeVisible();
  await page.locator('[data-action="scroll-prop"]').first().click();
  await expect(page).toHaveURL(/#\/thay-doi/);
  await page.goto(APP + '#/hang-doi');
  await card.getByRole('button', { name: /^B · Không/ }).click();
  await page.getByRole('button', { name: /Đã quyết/ }).click();
  await expect(page.locator('article.prop')).toHaveCount(3);
  await expect(page.locator('article.prop').first()).toContainText('quyết chung 3 vị trí');
  await page.getByRole('button', { name: 'Thoát minh hoạ' }).first().click();
  await expect(page.locator('#connPill')).toContainText('Ngoại tuyến');
});

test('đo thời gian quyết định hiện trên Hàng đợi và tải được CSV', async ({ page }) => {
  await open(page);
  await analyze(page);
  await persona(page, 'cv-dt');
  await page.locator('#prop-P6').getByRole('button', { name: /^B · Không/ }).click();
  await page.goto(APP + '#/hang-doi');
  await expect(page.locator('.notice.info')).toContainText('Thời gian trả lời câu hỏi');
  await expect(page.locator('.notice.info')).toContainText('1 câu trả lời cho 1 vị trí');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải CSV' }).click();
  expect((await download).suggestedFilename()).toBe('thoi-gian-quyet-dinh.csv');
});

test('nạp tài liệu từ tệp .docx: điền sẵn biểu mẫu, nạp vào kho rồi phân tích được', async ({ page }) => {
  await open(page, 'kho-tai-lieu');
  await persona(page, 'tp-dt');
  await page.setInputFiles('#ndFile', new URL('./mau-phuc-khao.docx', import.meta.url).pathname);
  await expect(page.getByText(/Đã đọc 4 dòng từ “mau-phuc-khao.docx”/)).toBeVisible();
  await expect(page.locator('#ndTitle')).toHaveValue('mau-phuc-khao');
  await expect(page.locator('#ndBody')).toHaveValue(/Tạm ứng \| 10 triệu đồng/);
  await page.getByRole('button', { name: 'Nạp vào kho' }).click();
  await expect(page.getByText(/Đã thêm .* vào kho./).first()).toBeVisible();
  await analyze(page);
  await expect(page.locator('article.prop').filter({ hasText: 'mau-phuc-khao' })).toHaveCount(1);
});

test('tệp không hỗ trợ bị từ chối với thông báo rõ ràng', async ({ page }) => {
  await open(page, 'kho-tai-lieu');
  await page.setInputFiles('#ndFile', { name: 'quy-dinh.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(page.locator('.toast').last()).toContainText('Chỉ nhận tệp .docx, .txt hoặc .md');
});

// ---------- Giao diện dễ hiểu (13/10/2026) ----------
test('kết quả mở đầu bằng một câu tóm tắt và ai cần trả lời gì; việc cần người nằm trên cùng', async ({ page }) => {
  await open(page);
  await analyze(page);
  const verdict = page.locator('.verdict');
  await expect(verdict).toContainText('Máy tự sửa 6 chỗ chắc chắn. Còn 3 câu hỏi cần người trả lời.');
  await expect(verdict.locator('.who li')).toHaveCount(3);
  await expect(verdict.locator('.who li').filter({ hasText: 'Cổng thông tin sinh viên' })).toContainText('1 câu');
  // Vai trò hiện tại (Trưởng phòng Đào tạo) không trả lời được U2 của Phòng Thanh tra – Pháp chế.
  await expect(verdict.locator('.who li').filter({ hasText: 'Phòng Thanh tra' }).locator('.you')).toHaveCount(0);
  await expect(page.locator('.stepper [aria-current="step"]')).toContainText('Trả lời câu hỏi');
  // Ba thẻ đầu tiên là ba câu hỏi; thẻ tự sửa nằm sau.
  const cards = page.locator('article.prop');
  for (const i of [0, 1, 2]) await expect(cards.nth(i).locator('.question')).toBeVisible();
  await expect(cards.nth(3).locator('.tag.auto')).toBeVisible();
  // Căn cứ kỹ thuật thu gọn mặc định, mở được.
  const more = cards.nth(3).locator('details.more');
  await expect(more.locator('.why').first()).toBeHidden();
  await more.locator('summary').click();
  await expect(more).toContainText('14/14 điều kiện');
  // Giải thích U1/U2/U3 ngay trên màn hình kết quả.
  await page.getByText('U1 / U2 / U3 nghĩa là gì?').click();
  await expect(page.locator('.kinds-help .kind')).toHaveCount(4);
});

test('trả lời hết câu hỏi thì bước hiện tại chuyển sang Ban hành', async ({ page }) => {
  await open(page);
  await analyze(page);
  await persona(page, 'ht');
  for (const id of ['P6', 'P9']) await page.locator('#prop-' + id).getByRole('button', { name: /^B · / }).click();
  await page.locator('article.prop.U3').getByRole('button', { name: /^B · / }).click();
  await expect(page.locator('.verdict')).toContainText('Không cần hỏi ai');
  await expect(page.locator('.stepper [aria-current="step"]')).toContainText('Ban hành');
});

test('hướng dẫn & thuật ngữ mở từ thanh trên, đóng bằng Esc', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Hướng dẫn và thuật ngữ' }).click();
  const dlg = page.getByRole('dialog', { name: 'Cách dùng PolicyChange OS' });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.kind')).toHaveCount(4);
  await expect(dlg.locator('dt', { hasText: 'Neo đại lượng' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
});

test('Tổng quan: độ chính xác tính lại trên cả hai tập mù, không sửa sai, không bỏ sót', async ({ page }) => {
  await open(page);
  const rows = page.locator('table.mini tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('40 ca');
  await expect(rows.nth(1)).toContainText('36 ca');
  await expect(page.locator('table.mini b.bad')).toHaveCount(0);
  await expect(page.locator('.kinds .kind')).toHaveCount(4);
});

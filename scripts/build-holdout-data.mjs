// Nhúng các tập đánh giá CSV vào js/*.js để màn hình "Đánh giá" chạy được cả khi mở bằng file://
// (trình duyệt chặn fetch tệp cục bộ). Chạy lại mỗi khi sửa CSV: npm run build:holdout
//   bench/holdout.csv → js/holdout-data.js (PolicyChangeHoldoutCsv) — tập phát triển 48 ca
//   bench/blind.csv   → js/blind-data.js   (PolicyChangeBlindCsv)   — tập mù 40 ca, đã đóng băng
//   bench/blind2.csv  → js/blind2-data.js  (PolicyChangeBlind2Csv)  — tập mù số 2, 36 ca, đã đóng băng
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const [name, global, out] of [['holdout', 'PolicyChangeHoldoutCsv', 'holdout-data.js'], ['blind', 'PolicyChangeBlindCsv', 'blind-data.js'], ['blind2', 'PolicyChangeBlind2Csv', 'blind2-data.js']]) {
  const csv = readFileSync(join(root, 'bench', name + '.csv'), 'utf8');
  const js = '// Tệp sinh tự động từ bench/' + name + '.csv — đừng sửa tay (npm run build:holdout).\n' +
    '(function (root) { var csv = ' + JSON.stringify(csv) + ';\n' +
    '  if (typeof module === "object" && module.exports) module.exports = csv;\n' +
    '  if (root) root.' + global + ' = csv;\n' +
    '})(typeof globalThis === "object" ? globalThis : this);\n';
  writeFileSync(join(root, 'js', out), js);
  console.log('js/' + out + ' ← bench/' + name + '.csv (' + csv.split('\n').length + ' dòng)');
}

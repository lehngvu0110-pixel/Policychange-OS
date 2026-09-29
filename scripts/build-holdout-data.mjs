// Nhúng bench/holdout.csv vào js/holdout-data.js để màn hình "Đánh giá" chạy được cả khi mở bằng file://
// (trình duyệt chặn fetch tệp cục bộ). Chạy lại mỗi khi sửa holdout.csv: npm run build:holdout
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csv = readFileSync(join(root, 'bench', 'holdout.csv'), 'utf8');
const out = '// Tệp sinh tự động từ bench/holdout.csv — đừng sửa tay (npm run build:holdout).\n' +
  '(function (root) { var csv = ' + JSON.stringify(csv) + ';\n' +
  '  if (typeof module === "object" && module.exports) module.exports = csv;\n' +
  '  if (root) root.PolicyChangeHoldoutCsv = csv;\n' +
  '})(typeof globalThis === "object" ? globalThis : this);\n';
writeFileSync(join(root, 'js', 'holdout-data.js'), out);
console.log('js/holdout-data.js ← bench/holdout.csv (' + csv.split('\n').length + ' dòng)');

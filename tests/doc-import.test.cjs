'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const DocImport = require('../js/doc-import.js');

/** Dựng một tệp zip tối giản (đủ cho .docx) với các mục cho trước. */
function zip(entries, method = 8) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(text, 'utf8');
    const data = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
}

const DOCUMENT = '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' +
  '<w:p><w:r><w:t>Điều 1. Sinh viên nộp đơn phúc khảo trong </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">7 ngày</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p>' +
  '<w:p></w:p>' +
  '<w:p><w:r><w:t>Hạn mức tạm ứng &lt;= 10 triệu &amp; cần hai chữ ký</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>Dòng A</w:t><w:br/><w:t>Dòng B</w:t><w:tab/><w:t>cột 2</w:t></w:r></w:p>' +
  '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Tạm ứng</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>10 triệu đồng</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
  '<w:p><w:del><w:r><w:delText>đã xoá 7 ngày</w:delText></w:r></w:del><w:r><w:t>Giữ lại</w:t></w:r></w:p>' +
  '</w:body></w:document>';

test('đọc .docx: mỗi đoạn một dòng, gộp các run, giải mã ký tự, bỏ phần đã xoá', async () => {
  for (const method of [8, 0]) {
    const bytes = zip([['[Content_Types].xml', '<Types/>'], ['word/document.xml', DOCUMENT]], method);
    const res = await DocImport.readDocument('Quy_dinh_phuc_khao.docx', bytes);
    assert.equal(res.format, 'docx');
    assert.equal(res.title, 'Quy dinh phuc khao');
    assert.deepEqual(res.lines, [
      'Điều 1. Sinh viên nộp đơn phúc khảo trong 7 ngày.',
      'Hạn mức tạm ứng <= 10 triệu & cần hai chữ ký',
      'Dòng A', 'Dòng B cột 2',
      'Tạm ứng | 10 triệu đồng',
      'Giữ lại'
    ]);
  }
});

test('đọc .txt và .md; chuẩn hoá NFC; bỏ BOM và dấu đầu mục', async () => {
  const decomposed = 'Nộp đơn phúc khảo trong 7 ngày'.normalize('NFD');
  const txt = await DocImport.readDocument('faq.txt', new TextEncoder().encode('﻿' + decomposed + '\r\n\r\n  Dòng hai  '));
  assert.deepEqual(txt.lines, ['Nộp đơn phúc khảo trong 7 ngày', 'Dòng hai']);
  const md = await DocImport.readDocument('huong-dan.md', new TextEncoder().encode('# Tiêu đề\n- Mục một 24 tín chỉ\n- [ ] Việc cần làm\n> Trích dẫn'));
  assert.deepEqual(md.lines, ['Tiêu đề', 'Mục một 24 tín chỉ', 'Việc cần làm', 'Trích dẫn']);
});

test('từ chối định dạng lạ, tệp quá lớn và .docx hỏng với thông báo tiếng Việt', async () => {
  await assert.rejects(DocImport.readDocument('a.pdf', new Uint8Array(4)), /Chỉ nhận tệp/);
  await assert.rejects(DocImport.readDocument('a.txt', new Uint8Array(DocImport.MAX_BYTES + 1)), /lớn hơn 5 MB/);
  await assert.rejects(DocImport.readDocument('a.docx', new TextEncoder().encode('không phải zip')), /không phải .docx/);
  await assert.rejects(DocImport.readDocument('a.docx', zip([['word/other.xml', '<x/>']])), /word\/document.xml/);
});

test('đánh dấu xoá rỗng <w:del/> không nuốt chữ; bảng lồng, hộp văn bản và phần di chuyển không làm lặp hay mất dòng', () => {
  const xml = '<w:body>' +
    '<w:p><w:pPr><w:rPr><w:del w:id="1" w:author="A"/></w:rPr></w:pPr><w:r><w:t>Dòng một 7 ngày.</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Dòng hai.</w:t></w:r></w:p>' +
    '<w:p><w:del w:id="2"><w:r><w:delText>đã xoá</w:delText></w:r></w:del><w:r><w:t>Dòng ba.</w:t></w:r></w:p>' +
    '<w:p><w:moveFrom><w:r><w:t>bị chuyển đi</w:t></w:r></w:moveFrom></w:p>' +
    '<w:p><w:r><mc:AlternateContent><mc:Choice><w:t>Hộp chữ</w:t></mc:Choice><mc:Fallback><w:t>Hộp chữ</w:t></mc:Fallback></mc:AlternateContent></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Ngoài</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Trong</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:tc>' +
    '<w:tc><w:p><w:r><w:t>10 triệu</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '<w:p><w:r><w:t>Dòng cuối.</w:t></w:r></w:p></w:body>';
  const lines = DocImport.documentXmlToLines(xml).map(l => l.trim()).filter(Boolean);
  assert.deepEqual(lines, ['Dòng một 7 ngày.', 'Dòng hai.', 'Dòng ba.', 'Hộp chữ', 'Ngoài Trong | 10 triệu', 'Dòng cuối.']);
});

test('XML hỏng (nhiều thẻ không đóng) vẫn đọc nhanh, không treo', () => {
  const xml = '<w:p>' + '<w:t>x'.repeat(50000) + '</w:p>';
  const t0 = Date.now();
  DocImport.documentXmlToLines(xml);
  assert.ok(Date.now() - t0 < 1000, 'đọc tuyến tính');
});

test('.docx đặt mật khẩu bị từ chối rõ ràng; quá nhiều dòng thì báo cắt bớt', async () => {
  const bytes = zip([['word/document.xml', '<w:p><w:r><w:t>a</w:t></w:r></w:p>']]);
  const cd = Buffer.from(bytes).indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes[cd + 8] |= 1;
  await assert.rejects(DocImport.readDocument('a.docx', bytes), /mật khẩu/);
  const many = await DocImport.readDocument('a.txt', new TextEncoder().encode(Array.from({ length: DocImport.MAX_LINES + 5 }, (_, i) => 'Dòng ' + i).join('\n')));
  assert.equal(many.lines.length, DocImport.MAX_LINES);
  assert.equal(many.truncated, true);
});

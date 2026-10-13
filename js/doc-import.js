// @ts-check
/**
 * Đọc tài liệu từ tệp để nạp vào kho: .txt, .md, .docx. Chạy hoàn toàn trên trình duyệt (và Node ≥ 18 để kiểm thử),
 * không gửi tệp đi đâu, không cần thư viện ngoài: .docx là tệp zip, giải nén bằng DecompressionStream('deflate-raw').
 * Kết quả chỉ để điền sẵn biểu mẫu "Nạp tài liệu"; người dùng xem lại rồi mới bấm Nạp vào kho.
 */
(function attachDocImport(/** @type {any} */ root, /** @type {() => any} */ factory) {
  const api = factory();
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeDocImport = api;
})(typeof globalThis === 'object' ? globalThis : this, function createDocImport() {
  'use strict';

  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_LINES = 2000;
  const MAX_XML_BYTES = 20 * 1024 * 1024;

  /** @param {string} s */
  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
      const k = e.toLowerCase();
      if (k === 'amp') return '&'; if (k === 'lt') return '<'; if (k === 'gt') return '>';
      if (k === 'quot') return '"'; if (k === 'apos') return "'";
      const code = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    });
  }

  /** Thẻ mà nội dung bên trong không phải chữ đang hiển thị: phần đã xoá (theo dõi thay đổi), mã trường, phần được di
   * chuyển đi, và bản thay thế (mc:Fallback) của hộp văn bản — nếu đọc cả hai bản thì chữ bị lặp. */
  const SKIP = new Set(['w:del', 'w:delText', 'w:instrText', 'w:moveFrom', 'mc:Fallback']);

  /**
   * word/document.xml → các dòng. Đọc tuần tự từng thẻ một lần (tuyến tính, không có biểu thức chính quy quay lui):
   * mỗi đoạn văn (w:p) là một dòng, ngắt dòng mềm (w:br) tách dòng, mỗi hàng bảng (w:tr) là một dòng "ô 1 | ô 2" để
   * cụm từ neo ở cột trái và con số ở cột phải nằm cùng dòng.
   * @param {string} xml
   */
  function documentXmlToLines(xml) {
    /** @type {string[]} */ const out = [];
    /** @type {{ cells:string[], cell:string[] }[]} */ const rows = [];
    let para = '', inText = false, skip = 0;
    const emit = (/** @type {string} */ text) => {
      if (rows.length) { const row = rows[rows.length - 1]; row.cell.push(text.replace(/\n/g, ' ')); }
      else for (const part of text.split('\n')) out.push(part);
    };
    const re = /<(\/?)([A-Za-z][\w.-]*:[A-Za-z][\w.-]*)\b[^>]*?(\/?)>|([^<]+)|<[^>]*>?/g;
    /** @type {RegExpExecArray|null} */ let m;
    while ((m = re.exec(String(xml || ''))) !== null) {
      if (m[4] !== undefined) { if (inText && !skip) para += decodeEntities(m[4]); continue; }
      const tag = m[2];
      if (!tag) continue;
      const closing = m[1] === '/', selfClosing = m[3] === '/';
      if (SKIP.has(tag)) { if (!selfClosing) skip += closing ? (skip > 0 ? -1 : 0) : 1; continue; }
      if (skip) continue;
      if (tag === 'w:t') { inText = !closing && !selfClosing; continue; }
      if (tag === 'w:tab' && !closing) { para += '\t'; continue; }
      if ((tag === 'w:br' || tag === 'w:cr') && !closing) { para += '\n'; continue; }
      if (tag === 'w:p' && (closing || selfClosing)) { emit(para); para = ''; continue; }
      if (tag === 'w:tr' && !closing && !selfClosing) { rows.push({ cells: [], cell: [] }); continue; }
      if (tag === 'w:tc' && closing && rows.length) { const row = rows[rows.length - 1]; row.cells.push(row.cell.join(' ').trim()); row.cell = []; continue; }
      if (tag === 'w:tr' && closing && rows.length) {
        const row = /** @type {{ cells:string[], cell:string[] }} */ (rows.pop());
        emit(row.cells.filter(Boolean).join(' | '));
      }
    }
    if (para) emit(para);
    return out;
  }

  /** @param {Uint8Array} bytes @param {number} at */
  const u16 = (bytes, at) => bytes[at] | (bytes[at + 1] << 8);
  /** @param {Uint8Array} bytes @param {number} at */
  const u32 = (bytes, at) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

  /** Giải nén, dừng ngay khi vượt giới hạn (chống tệp "bom zip" khai man kích thước). @param {Uint8Array} data */
  async function inflateRaw(data) {
    if (typeof DecompressionStream !== 'function') throw new Error('Trình duyệt này chưa hỗ trợ giải nén .docx; hãy lưu tệp dạng .txt.');
    const stream = new Blob([/** @type {BlobPart} */ (/** @type {unknown} */ (data))]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    /** @type {Uint8Array[]} */ const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_XML_BYTES) { await reader.cancel(); throw new Error('Nội dung tệp .docx quá lớn sau khi giải nén.'); }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }

  /** Lấy một tệp trong zip theo tên (đọc mục lục ở cuối tệp). @param {Uint8Array} bytes @param {string} name */
  async function unzipEntry(bytes, name) {
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Tệp không phải .docx hợp lệ.');
    const count = u16(bytes, eocd + 10);
    let p = u32(bytes, eocd + 16);
    const decoder = new TextDecoder('utf-8');
    for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
      if (u32(bytes, p) !== 0x02014b50) break;
      const flags = u16(bytes, p + 8);
      const method = u16(bytes, p + 10);
      const compSize = u32(bytes, p + 20);
      const rawSize = u32(bytes, p + 24);
      const nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), commentLen = u16(bytes, p + 32);
      const local = u32(bytes, p + 42);
      const entryName = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      if (entryName === name) {
        if (flags & 1) throw new Error('Tệp .docx đang được đặt mật khẩu; hãy bỏ mật khẩu rồi thử lại.');
        if (compSize === 0xFFFFFFFF || rawSize === 0xFFFFFFFF) throw new Error('Tệp .docx quá lớn (định dạng zip64) chưa được hỗ trợ.');
        if (rawSize > MAX_XML_BYTES) throw new Error('Nội dung tệp .docx quá lớn sau khi giải nén.');
        if (u32(bytes, local) !== 0x04034b50) throw new Error('Tệp .docx bị hỏng.');
        const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
        const data = bytes.subarray(start, start + compSize);
        if (method === 0) return data;
        if (method === 8) return inflateRaw(data);
        throw new Error('Kiểu nén trong .docx chưa được hỗ trợ.');
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('Không thấy nội dung văn bản (word/document.xml) trong tệp.');
  }

  /** @param {string[]} raw */
  function cleanLines(raw) {
    const all = raw.map(line => line.normalize('NFC').replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { lines: all.slice(0, MAX_LINES), truncated: all.length > MAX_LINES };
  }

  /** Dòng markdown: bỏ dấu đầu mục và tiêu đề, giữ nguyên nội dung. @param {string} text */
  function markdownToLines(text) {
    return String(text).split(/\r?\n/).map(l => l.replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|>\s?)/, ''));
  }

  /**
   * @param {string} fileName
   * @param {ArrayBuffer|Uint8Array} buffer
   * @returns {Promise<{ title:string, lines:string[], truncated:boolean, format:'txt'|'md'|'docx' }>}
   */
  async function readDocument(fileName, buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length > MAX_BYTES) throw new Error('Tệp lớn hơn 5 MB.');
    const name = String(fileName || 'tai-lieu');
    const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
    const title = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim() || 'Tài liệu nạp từ tệp';
    const format = (ext || '').toLowerCase();
    if (format === 'docx') {
      const xml = new TextDecoder('utf-8').decode(await unzipEntry(bytes, 'word/document.xml'));
      return { title, ...cleanLines(documentXmlToLines(xml)), format: 'docx' };
    }
    if (format === 'txt' || format === 'md' || format === 'markdown') {
      const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
      return { title, ...cleanLines(format === 'txt' ? text.split(/\r?\n/) : markdownToLines(text)), format: format === 'txt' ? 'txt' : 'md' };
    }
    throw new Error('Chỉ nhận tệp .docx, .txt hoặc .md. Với .pdf hay .doc, hãy lưu lại thành .docx hoặc .txt.');
  }

  return Object.freeze({ readDocument, documentXmlToLines, decodeEntities, MAX_BYTES, MAX_LINES });
});

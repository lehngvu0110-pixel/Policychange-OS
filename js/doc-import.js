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

  /** Mỗi đoạn văn (w:p) của word/document.xml thành một dòng; ngắt dòng mềm (w:br) cũng tách dòng. @param {string} xml */
  function documentXmlToLines(xml) {
    const body = String(xml || '').replace(/<w:(?:del|instrText|delText)\b[\s\S]*?<\/w:(?:del|instrText|delText)>/g, '');
    // Một hàng bảng thành một dòng "ô 1 | ô 2", để cụm từ neo (cột trái) và con số (cột phải) nằm cùng dòng.
    const flattened = body.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, row => {
      const cells = (row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || []).map(cell => paragraphsOf(cell).join(' ').trim());
      const text = cells.filter(Boolean).join(' | ').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      return '<w:p><w:r><w:t>' + text + '</w:t></w:r></w:p>';
    });
    return paragraphsOf(flattened);
  }

  /** @param {string} xml */
  function paragraphsOf(xml) {
    /** @type {string[]} */ const out = [];
    for (const para of xml.split(/<\/w:p>/)) {
      let text = '';
      const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\b[^>]*\/>/g;
      /** @type {RegExpExecArray|null} */ let m;
      while ((m = re.exec(para)) !== null) {
        if (m[1] !== undefined) text += decodeEntities(m[1]);
        else if (m[0].startsWith('<w:tab')) text += '\t';
        else text += '\n';
      }
      for (const part of text.split('\n')) out.push(part);
    }
    return out;
  }

  /** @param {Uint8Array} bytes @param {number} at */
  const u16 = (bytes, at) => bytes[at] | (bytes[at + 1] << 8);
  /** @param {Uint8Array} bytes @param {number} at */
  const u32 = (bytes, at) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

  /** @param {Uint8Array} data */
  async function inflateRaw(data) {
    if (typeof DecompressionStream !== 'function') throw new Error('Trình duyệt này chưa hỗ trợ giải nén .docx; hãy lưu tệp dạng .txt.');
    const stream = new Blob([/** @type {BlobPart} */ (/** @type {unknown} */ (data))]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
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
      const method = u16(bytes, p + 10);
      const compSize = u32(bytes, p + 20);
      const nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), commentLen = u16(bytes, p + 32);
      const local = u32(bytes, p + 42);
      const entryName = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      if (entryName === name) {
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
    return raw.map(line => line.normalize('NFC').replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, MAX_LINES);
  }

  /** Dòng markdown: bỏ dấu đầu mục và tiêu đề, giữ nguyên nội dung. @param {string} text */
  function markdownToLines(text) {
    return String(text).split(/\r?\n/).map(l => l.replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|>\s?)/, ''));
  }

  /**
   * @param {string} fileName
   * @param {ArrayBuffer|Uint8Array} buffer
   * @returns {Promise<{ title:string, lines:string[], format:'txt'|'md'|'docx' }>}
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
      return { title, lines: cleanLines(documentXmlToLines(xml)), format: 'docx' };
    }
    if (format === 'txt' || format === 'md' || format === 'markdown') {
      const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
      return { title, lines: cleanLines(format === 'txt' ? text.split(/\r?\n/) : markdownToLines(text)), format: format === 'txt' ? 'txt' : 'md' };
    }
    throw new Error('Chỉ nhận tệp .docx, .txt hoặc .md. Với .pdf hay .doc, hãy lưu lại thành .docx hoặc .txt.');
  }

  return Object.freeze({ readDocument, documentXmlToLines, decodeEntities, MAX_BYTES, MAX_LINES });
});

// @ts-check
/**
 * Sổ nhật ký kiểm toán: chuỗi băm SHA-256, chỉ ghi thêm.
 * Mỗi bản ghi băm trên nội dung của chính nó nối với băm của bản ghi liền trước,
 * nên sửa lén một bản ghi bất kỳ làm gãy toàn bộ phần phía sau.
 * Client và Edge Function dùng chung module này để băm giống hệt nhau.
 */
(function attachPolicyLedger(root, factory) {
  const g = /** @type {any} */ (root || {});
  // @ts-ignore -- CommonJS require khi chạy trong Node.
  const sha = typeof module === 'object' && module.exports ? require('./sha256.js') : g.PolicyChangeSha256;
  const api = factory(sha);
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeLedger = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyLedger(Sha) {
  'use strict';

  /**
   * @typedef {{
   *   seq:number, ts:string, actor:string, docId:string, lineIndex?:number|null, action:string,
   *   from:string, to:string, basis:string, propId?:string|null, revertsSeq?:number|null,
   *   prevHash:string, hash:string, [key:string]:any
   * }} LedgerRecord
   * @typedef {Omit<LedgerRecord,'seq'|'prevHash'|'hash'>} LedgerEntry
   */

  const GENESIS = '0'.repeat(64);

  /** @param {Partial<LedgerRecord>} e */
  function payload(e) {
    return JSON.stringify([e.seq, e.ts, e.actor, e.docId, e.lineIndex ?? null, e.action,
      e.from, e.to, e.basis, e.propId ?? null, e.revertsSeq ?? null, e.prevHash]);
  }

  /** @param {Partial<LedgerRecord>} e */
  function hashOf(e) { return Sha.sha256Hex(payload(e)); }

  /**
   * Tạo bản ghi nối tiếp một đuôi chuỗi cho trước (dùng được khi chỉ biết seq + hash cuối, như ở máy chủ).
   * @param {{ seq:number, hash:string } | null} tail
   * @param {LedgerEntry} entry
   * @returns {LedgerRecord}
   */
  function createRecord(tail, entry) {
    const record = /** @type {LedgerRecord} */ ({ seq: (tail ? tail.seq : 0) + 1, ...entry, prevHash: tail ? tail.hash : GENESIS });
    record.hash = hashOf(record);
    return record;
  }

  /**
   * Nối một bản ghi vào mảng sổ (thay đổi mảng) và trả về bản ghi đó.
   * @param {LedgerRecord[]} ledger @param {LedgerEntry} entry
   */
  function append(ledger, entry) {
    const last = ledger.length ? ledger[ledger.length - 1] : null;
    const record = createRecord(last ? { seq: last.seq, hash: last.hash } : null, entry);
    ledger.push(record);
    return record;
  }

  /**
   * @param {ReadonlyArray<LedgerRecord>} ledger
   * @param {{ seq:number, hash:string } | null} [base] đuôi chuỗi trước bản ghi đầu tiên (khi chỉ kiểm một đoạn)
   */
  function verify(ledger, base) {
    let prev = base ? base.hash : GENESIS;
    let expectedSeq = base ? base.seq + 1 : 1;
    for (const e of ledger) {
      if (e.seq !== expectedSeq || e.prevHash !== prev || e.hash !== hashOf(e)) return false;
      prev = e.hash;
      expectedSeq++;
    }
    return true;
  }

  /** @param {ReadonlyArray<LedgerRecord>} ledger @param {number} seq */
  function isReverted(ledger, seq) {
    return ledger.some(e => e.revertsSeq === seq && e.action === 'HOÀN TÁC bản ghi #' + seq);
  }

  /** @param {ReadonlyArray<LedgerRecord>} ledger */
  function tailOf(ledger) {
    const last = ledger.length ? ledger[ledger.length - 1] : null;
    return last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: GENESIS };
  }

  return Object.freeze({ GENESIS, payload, hashOf, createRecord, append, verify, isReverted, tailOf });
});

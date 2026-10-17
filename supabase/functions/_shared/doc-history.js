// @ts-check
/**
 * Lịch sử phiên bản của một tài liệu trong kho, dựng lại từ sổ kiểm toán SHA-256 sẵn có.
 *
 * Không có bảng phiên bản riêng: mỗi lần nội dung đổi (PATCH, HOÀN TÁC) đã có một bản ghi băm trong sổ với
 * nội dung trước/sau của dòng. Module này đi ngược từ nội dung hiện tại qua các bản ghi đó để dựng ảnh chụp
 * của từng phiên bản, nên lịch sử không thể lệch khỏi sổ và không cần ghi lại sổ.
 * Đề xuất chưa áp dụng chỉ đọc từ phân tích hiện tại và không bao giờ được trình bày như một phiên bản.
 * Khôi phục mô phỏng các hoàn tác rồi ghi toàn bộ trong một giao dịch, giữ nguyên sổ cũ.
 */
(function attachDocHistory(/** @type {any} */ root, /** @type {() => any} */ factory) {
  const api = factory();
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeDocHistory = api;
})(typeof globalThis === 'object' ? globalThis : this, function createDocHistory() {
  'use strict';

  /** @param {any} r */ const isPatch = r => String(r.action || '').startsWith('PATCH');
  /** @param {any} r */ const isRevert = r => String(r.action || '').startsWith('HOÀN TÁC') && r.revertsSeq != null;
  /** @param {any} r */ const isCreate = r => String(r.action || '').startsWith('THÊM TÀI LIỆU');
  /** @param {any} r */ const isKept = r => String(r.action || '').startsWith('GIỮ NGUYÊN');
  /** @param {any} r */ const isRejected = r => String(r.action || '').startsWith('TỪ CHỐI SỬA');

  /** @param {string} v */
  function unbump(v) {
    const m = String(v).match(/^(\d+)\.(\d+)$/);
    return m && Number(m[2]) > 0 ? m[1] + '.' + (Number(m[2]) - 1) : v;
  }

  /** @param {string} actor */
  function actorKind(actor) { return /^AI\b/.test(String(actor || '')) ? 'ai' : 'human'; }

  /** @param {any} r */
  function approvalOf(r) {
    const basis = String(r.basis || '');
    if (isRevert(r)) return (/khôi phục bản \d+/.test(basis) ? 'Khôi phục phiên bản · ' : '') + 'Thu hồi thay đổi #' + r.revertsSeq + ' (ghi thêm, bản ghi gốc giữ nguyên)';
    if (isCreate(r)) return 'Nạp vào kho có kiểm soát';
    const proof = basis.match(/deterministic proof (\S+)/);
    if (/được con người duyệt sau bằng chứng ngữ nghĩa/.test(basis)) return 'Người rà soát duyệt sau khi xem bằng chứng ngữ nghĩa' + (proof ? ' · prover ' + proof[1] : '');
    if (actorKind(r.actor) === 'ai') return 'Tự động trong thẩm quyền' + (proof ? ' · prover xác nhận (' + proof[1] + ')' : '');
    const decision = basis.match(/(U[123]) — ([^·]+)/);
    return 'Người có thẩm quyền duyệt' + (decision ? ' · ' + decision[1] + ': ' + decision[2].trim() : '');
  }

  /** @param {any} r */
  function changeIdOf(r) { const m = String(r.basis || '').match(/hồ sơ (CR-\d+)/); return m ? m[1] : null; }

  /**
   * @param {{ id:string, version?:string, lines:string[] }} doc tài liệu ở trạng thái hiện tại
   * @param {ReadonlyArray<any>} ledger toàn bộ sổ của workspace
   * @param {{ chainOk?: boolean }} [opts] kết quả kiểm chuỗi băm (do nơi gọi chạy Ledger.verify)
   */
  function build(doc, ledger, opts = {}) {
    const recs = ledger.filter(r => r.docId === doc.id);
    const revertedBy = new Map();
    for (const r of ledger) if (isRevert(r)) revertedBy.set(r.revertsSeq, r.seq);
    const contentRecs = recs.filter(r => (isPatch(r) || isRevert(r)) && Number.isInteger(r.lineIndex));
    const created = recs.find(isCreate) || null;
    const problems = /** @type {string[]} */ ([]);

    // Đi ngược từ nội dung hiện tại.
    let lines = doc.lines.slice();
    let version = doc.version || '';
    /** @type {any[]} */ const revs = [];
    for (let i = contentRecs.length - 1; i >= 0; i--) {
      const r = contentRecs[i];
      const li = r.lineIndex;
      if (li < 0 || li >= lines.length) problems.push('Bản ghi #' + r.seq + ' trỏ tới dòng ' + (li + 1) + ' không tồn tại.');
      else if (lines[li] !== r.to) problems.push('Bản ghi #' + r.seq + ': nội dung dòng ' + (li + 1) + ' không khớp với sổ. Có thể tài liệu đã bị sửa ngoài quy trình.');
      revs.unshift({
        seq: r.seq, ts: r.ts, actor: r.actor, actorKind: actorKind(r.actor), action: r.action, kind: isRevert(r) ? 'revert' : 'patch',
        lineIndex: li, from: r.from, to: r.to, basis: r.basis, changeId: changeIdOf(r), approval: approvalOf(r),
        revertsSeq: r.revertsSeq ?? null, revertedBy: revertedBy.get(r.seq) ?? null, hash: r.hash, prevHash: r.prevHash,
        version, lines: lines.slice()
      });
      if (li >= 0 && li < lines.length) lines[li] = r.from;
      version = unbump(version);
    }
    const base = {
      seq: created ? created.seq : null, ts: created ? created.ts : null, actor: created ? created.actor : null,
      actorKind: created ? actorKind(created.actor) : 'system', action: created ? created.action : 'Bản trong kho ban đầu',
      kind: created ? 'created' : 'base', lineIndex: null, from: null, to: null, basis: created ? created.basis : 'Nội dung có sẵn khi tạo workspace, trước mọi bản ghi trong sổ',
      changeId: null, approval: created ? approvalOf(created) : 'Dữ liệu gốc của workspace', revertsSeq: null, revertedBy: null,
      hash: created ? created.hash : null, prevHash: created ? created.prevHash : null, version, lines: lines.slice()
    };
    const revisions = [base, ...revs].map((r, n) => ({ ...r, n, current: false }));
    revisions[revisions.length - 1].current = true;

    const events = recs.filter(r => isKept(r) || isRejected(r)).map(r => ({
      seq: r.seq, ts: r.ts, actor: r.actor, actorKind: actorKind(r.actor), kind: isKept(r) ? 'kept' : 'rejected', action: r.action,
      lineIndex: Number.isInteger(r.lineIndex) ? r.lineIndex : null, line: r.from, basis: r.basis, changeId: changeIdOf(r), hash: r.hash,
      label: isKept(r) ? 'Giữ nguyên sau rà soát' : 'Từ chối sửa'
    }));
    return { docId: doc.id, revisions, events, integrity: { ok: problems.length === 0 && opts.chainOk !== false, chainOk: opts.chainOk !== false, problems } };
  }

  /** Tách theo từ, giữ khoảng trắng để ghép lại đúng. @param {string} s */
  const tokens = s => String(s || '').split(/(\s+)/).filter(t => t !== '');

  /**
   * So sánh theo từ (LCS). Trả về các đoạn same/add/del.
   * @param {string} a @param {string} b
   */
  function diffWords(a, b) {
    const x = tokens(a), y = tokens(b);
    if (x.length * y.length > 250000) return [{ type: 'del', text: a }, { type: 'add', text: b }];
    const m = x.length, n = y.length;
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    /** @type {{type:'same'|'add'|'del', text:string}[]} */ const out = [];
    /** @param {'same'|'add'|'del'} type @param {string} text */
    const push = (type, text) => { const last = out[out.length - 1]; if (last && last.type === type) last.text += text; else out.push({ type, text }); };
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (x[i] === y[j]) { push('same', x[i]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', x[i++]);
      else push('add', y[j++]);
    }
    while (i < m) push('del', x[i++]);
    while (j < n) push('add', y[j++]);
    return out;
  }

  /**
   * So sánh hai phiên bản theo dòng (LCS), dòng bị thay ghép thành một mục "change" kèm so sánh theo từ.
   * @param {string[]} a @param {string[]} b
   */
  function diffLines(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    /** @type {any[]} */ const raw = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) { raw.push({ type: 'same', a: a[i], b: b[j], ai: i, bi: j }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { raw.push({ type: 'del', a: a[i], ai: i }); i++; }
      else { raw.push({ type: 'add', b: b[j], bi: j }); j++; }
    }
    while (i < m) { raw.push({ type: 'del', a: a[i], ai: i }); i++; }
    while (j < n) { raw.push({ type: 'add', b: b[j], bi: j }); j++; }
    /** @type {any[]} */ const out = [];
    for (let k = 0; k < raw.length; k++) {
      const r = raw[k], nx = raw[k + 1];
      if (r.type === 'del' && nx && nx.type === 'add') { out.push({ type: 'change', a: r.a, b: nx.b, ai: r.ai, bi: nx.bi, words: diffWords(r.a, nx.b) }); k++; }
      else out.push(r);
    }
    const stats = { changed: out.filter(o => o.type === 'change').length, added: out.filter(o => o.type === 'add').length, removed: out.filter(o => o.type === 'del').length };
    return { ops: out, stats };
  }

  /**
   * Kế hoạch khôi phục về phiên bản n: danh sách bản ghi PATCH cần hoàn tác, mới nhất trước.
   * Mô phỏng trên bản sao để chắc kết quả trùng đúng ảnh chụp phiên bản đích.
   * @param {ReturnType<typeof build>} history @param {number} n
   */
  function restorePlan(history, n) {
    const revs = history.revisions;
    const target = revs[n];
    if (!target) return { ok: false, undoSeqs: [], reason: 'Không có phiên bản này.' };
    if (target.current) return { ok: false, undoSeqs: [], reason: 'Đây đã là phiên bản hiện tại.' };
    if (!history.integrity.ok) return { ok: false, undoSeqs: [], reason: 'Lịch sử không khớp với sổ kiểm toán; cần kiểm tra trước khi khôi phục.' };
    const later = revs.slice(n + 1);
    // Một thay đổi có hiệu lực ở phiên bản đích đã bị thu hồi sau đó: muốn quay lại phải ban hành lại, không phải hoàn tác.
    const inEffect = new Set(revs.slice(1, n + 1).filter(r => r.kind === 'patch').map(r => r.seq));
    const revived = later.find(r => r.kind === 'revert' && inEffect.has(r.revertsSeq));
    if (revived) return { ok: false, undoSeqs: [], reason: 'Phiên bản này chứa thay đổi #' + revived.revertsSeq + ' đã bị thu hồi ở bản ghi #' + revived.seq + '. Muốn quay lại cần ban hành lại thay đổi đó qua quy trình phân tích, không khôi phục bằng hoàn tác được.' };
    const undoSeqs = later.filter(r => r.kind === 'patch' && r.revertedBy == null).map(r => r.seq).reverse();
    const lines = revs[revs.length - 1].lines.slice();
    for (const seq of undoSeqs) {
      const r = later.find(x => x.seq === seq);
      if (!r || lines[r.lineIndex] !== r.to) return { ok: false, undoSeqs: [], reason: 'Không mô phỏng được việc hoàn tác bản ghi #' + seq + '.' };
      lines[r.lineIndex] = r.from;
    }
    if (lines.join('\n') !== target.lines.join('\n')) return { ok: false, undoSeqs: [], reason: 'Hoàn tác các thay đổi sau không cho ra đúng phiên bản này.' };
    if (!undoSeqs.length) return { ok: false, undoSeqs: [], reason: 'Nội dung hiện tại đã trùng phiên bản này.' };
    return { ok: true, undoSeqs, reason: '' };
  }

  /**
   * Đề xuất trong phân tích hiện tại chạm vào tài liệu này mà chưa áp dụng. Chỉ để hiển thị, không phải phiên bản.
   * @param {string} docId @param {any} current S.current
   */
  function proposals(docId, current) {
    if (!current || !Array.isArray(current.props)) return [];
    return current.props.filter((/** @type {any} */ p) => p.docId === docId && !p.applied).map((/** @type {any} */ p) => {
      let status;
      if (p.decided && !p.accepted) status = 'Đã từ chối, sẽ không áp dụng';
      else if (p.semanticHold && !p.semanticHoldReviewed) status = 'Chờ rà soát bằng chứng ngữ nghĩa';
      else if (p.semanticHold && p.semanticHoldReviewed && !p.semanticHoldApproved) status = 'Người rà soát giữ nguyên';
      else if (p.outcome === 'ESCALATE' && !p.decided) status = 'Chờ người có thẩm quyền quyết (' + p.category + ')';
      else if (p.outcome === 'ESCALATE') status = 'Đã duyệt, chờ ban hành';
      else status = 'Chờ ban hành; prover kiểm lại lúc ban hành';
      return { id: p.id, lineIndex: p.lineIndex, from: p.line, to: p.newLine, outcome: p.outcome, category: p.category || null, status,
        words: diffWords(p.line, p.newLine) };
    });
  }

  return Object.freeze({ build, diffLines, diffWords, restorePlan, proposals, actorKind });
});

'use strict';
// Lệnh kiểm chứng một phát: npm run verify
// Mỗi dòng là MỘT ĐIỀU của QT-KSTL-01 v2.0 (docs/QT-KSTL-01_Quy-trinh-kiem-soat-tai-lieu.md) và một phép thử chạy được.
// In bảng ĐẠT/TRƯỢT; mã thoát ≠ 0 nếu có điều trượt — CI chạy lệnh này.
//   node scripts/verify.cjs           bảng đầy đủ
//   node scripts/verify.cjs --json    kết quả dạng JSON
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');
const Workflow = require('../js/policy-workflow.js');
const Ledger = require('../js/policy-ledger.js');
const Authz = require('../js/policy-authz.js');
const Server = require('../js/policy-server.js');
const Semantic = require('../js/semantic-discovery.js');
const Learning = require('../js/policy-learning.js');
const Evaluation = require('../js/policy-evaluation.js');

const ROOT = path.join(__dirname, '..');
const NOW = () => '2026-10-01T08:00:00.000Z';
const registry = () => Engine.cloneRegistry(Data.SEED_REGISTRY);
const docs = () => Engine.cloneDocs(Data.SEED_DOCUMENTS);
const fresh = () => ({ registry: registry(), docs: docs(), current: null, ledger: [] });
/** Phân tích một dòng lẻ cho một quy định. */
function one(ruleId, newValue, line, issuerTier = 3, tier = 1) {
  const reg = registry();
  const rule = reg.find(r => r.id === ruleId);
  return Engine.analyze({ rule, oldValue: rule.value, newValue, issuerTier }, [{ id: 'V', title: 'v', owner: 'o', tier, version: '1.0', lines: [line] }], reg).props[0];
}
const label = p => !p ? 'NONE' : p.outcome === 'AUTO_PATCH' ? 'AUTO' : p.category;

/** @type {{ clause:string, title:string, run:() => { ok:boolean, detail:string } }[]} */
const CHECKS = [
  { clause: '§3.1', title: 'Không có trong sổ thì không xử lý', run() {
    const r = Engine.parseFreeText('Đổi hạn mức 99 triệu thành 50 triệu, Trưởng phòng ban hành.', registry());
    const b = Workflow.buildChange(registry(), 'R-KHONG-CO', '5 ngày', 2);
    return { ok: !r.ok && 'error' in b, detail: 'giá trị lạ → từ chối; mã quy định lạ → ' + ('error' in b ? 'từ chối' : 'nhận') };
  } },
  { clause: '§3.2', title: 'Trùng giá trị không phải trùng quy định (→ U2)', run() {
    const p = one('R-PK-01', '5 ngày', 'Đơn khiếu nại được phản hồi trong 7 ngày.');
    return { ok: label(p) === 'U2', detail: 'đổi R-PK-01, dòng của R-KN-01 cùng 7 ngày → ' + label(p) };
  } },
  { clause: '§4.1', title: 'Không sửa lên trên (→ U3) và máy chủ chặn người thiếu cấp', run() {
    const p = one('R-PK-01', '5 ngày', 'Sinh viên nộp đơn phúc khảo trong 7 ngày.', 2, 3);
    const ctx = { workspace: { id: 'demo', mode: 'demo', ledger_seq: 0, ledger_tail: '0'.repeat(64) }, member: Server.demoMember('cv-dt'),
      registry: registry(), docs: docs(), ledger: [], openChanges: [], decisions: [], now: NOW };
    const plan = Server.planCommit(ctx, { change: { ruleId: 'R-PK-01', newValue: '5 ngày', issuerTier: 2 } });
    return { ok: label(p) === 'U3' && plan.status === 403, detail: 'tài liệu cấp 3, ban hành cấp 2 → ' + label(p) + '; chuyên viên khai cấp 2 → HTTP ' + plan.status };
  } },
  { clause: '§5.1–5.4', title: 'Bộ Verify của đề bài: 4 ca bắt buộc + 5 ca Escalation', run() {
    const env = { registry: registry(), seedDocuments: Data.SEED_DOCUMENTS };
    const res = [...Data.SUITE_REQUIRED, ...Data.SUITE_ESCALATION].map(tc => Workflow.runVerifyCase(tc, env));
    return { ok: res.every(r => r.ok), detail: res.filter(r => r.ok).length + '/' + res.length + ' ca đạt' + (res.some(r => !r.ok) ? ' · trượt: ' + res.filter(r => !r.ok).map(r => r.id).join(', ') : '') };
  } },
  { clause: '§5.3.a', title: 'Con số không có neo → U1, cấm suy đoán', run() {
    const p = one('R-PK-01', '5 ngày', 'Hồ sơ được xử lý trong 7 ngày.');
    return { ok: label(p) === 'U1', detail: '“Hồ sơ được xử lý trong 7 ngày.” → ' + label(p) };
  } },
  { clause: '§5.3.b', title: 'Giá trị viết khác dạng → nhận ra nhưng luôn hỏi người', run() {
    const cases = [['R-KN-01', '10 ngày', 'Đơn tố cáo được giải quyết trong vòng một tuần.'], ['R-DK-01', '30 tín chỉ', 'Đăng ký học phần không quá hai mươi bốn tín chỉ.'],
      ['R-KN-01', '5 ngày', 'Don khieu nai duoc tra loi trong 7 ngay.'], ['R-TC-01', '15 triệu', 'Trưởng đơn vị duyệt tạm ứng đến mười triệu đồng.']];
    const got = cases.map(([r, v, l]) => label(one(r, v, l)));
    const trap = label(one('R-PK-01', '5 ngày', 'Tra cứu kết quả sau mười bảy ngày.'));
    return { ok: got.every(x => x === 'U1') && trap === 'NONE', detail: 'một tuần / hai mươi bốn / không dấu / mười triệu → ' + got.join(', ') + ' · “mười bảy ngày” → ' + trap };
  } },
  { clause: '§5.3.c', title: 'Đúng chủ đề nhưng con số đo việc khác → U1', run() {
    const cases = [['R-PK-01', 'Kết quả phúc khảo được thông báo cho sinh viên sau 7 ngày.'], ['R-PK-01', 'Bài thi đã phúc khảo được lưu tại khoa thêm 7 ngày.'],
      ['R-TC-01', 'Tổng dư tạm ứng của một đơn vị không vượt 10 triệu đồng mỗi quý.']];
    const got = cases.map(([r, l]) => label(one(r, r === 'R-PK-01' ? '5 ngày' : '15 triệu', l)));
    return { ok: got.every(x => x === 'U1'), detail: 'thông báo kết quả / thời gian lưu / tổng dư theo quý → ' + got.join(', ') };
  } },
  { clause: '§5.4', title: 'Tự sửa chỉ khi có neo chủ đề + neo đại lượng, qua prover 14 điều kiện', run() {
    const st = fresh();
    const built = Workflow.buildChange(st.registry, 'R-PK-01', '5 ngày', 3);
    Workflow.startAnalysis(st, built.change);
    const autos = st.current.props.filter(p => p.outcome === 'AUTO_PATCH');
    const proofs = autos.map(p => Workflow.prove(st, p));
    const ok = autos.length > 0 && proofs.every(pr => pr.allowed && pr.checks.length === 14 && pr.checks.some(c => c.id === 'registered_measure_cue' || c.name === 'registered_measure_cue'));
    return { ok, detail: autos.length + ' dòng tự sửa trên kho mẫu, mỗi dòng ' + (proofs[0] ? proofs[0].checks.length : 0) + '/14 điều kiện đạt' };
  } },
  { clause: '§5.6', title: 'AI chỉ được làm kết quả thận trọng hơn', run() {
    const st = fresh();
    const built = Workflow.buildChange(st.registry, 'R-PK-01', '5 ngày', 2);
    Workflow.startAnalysis(st, built.change);
    const u1 = st.current.props.find(p => p.category === 'U1');
    const claim = { ruleId: 'R-PK-01', documentId: u1.docId, lineIndex: u1.lineIndex, quote: '7 ngày', start: u1.line.indexOf('7 ngày'), end: u1.line.indexOf('7 ngày') + 6,
      relation: 'supports', explanation: 'AI khẳng định thuộc quy định', evidence: [{ quote: '7 ngày', start: u1.line.indexOf('7 ngày'), end: u1.line.indexOf('7 ngày') + 6 }] };
    const after = Semantic.applyEvidenceToProps(st.current.props, [claim]).find(p => p.id === u1.id);
    return { ok: after.outcome === 'ESCALATE' && after.category === 'U1', detail: 'AI nói “supports” cho một dòng U1 → vẫn ' + label(after) };
  } },
  { clause: '§6', title: 'Mỗi hồ sơ: một câu hỏi, hai lựa chọn, đủ mã tài liệu, dòng, trích dẫn, giá trị cũ → mới', run() {
    const st = fresh();
    const built = Workflow.buildChange(st.registry, 'R-PK-01', '5 ngày', 2);
    Workflow.startAnalysis(st, built.change);
    const esc = st.current.props.filter(p => p.outcome === 'ESCALATE');
    const bad = esc.filter(p => {
      const q = Engine.escalationQuestion(p, st.current.change, st.registry);
      return !q.q || !q.a || !q.b || q.a === q.b || !q.q.includes(p.docId) || !q.q.includes('dòng ' + (p.lineIndex + 1)) || !q.q.includes(p.line.trim()) ||
        !q.q.includes(st.current.change.oldValue) || !q.q.includes(st.current.change.newValue) || !p.plain || /xem xét lại/i.test(q.q);
    });
    return { ok: esc.length >= 3 && !bad.length, detail: esc.length + ' hồ sơ U1/U2/U3, ' + (esc.length - bad.length) + ' câu hỏi đạt chuẩn' };
  } },
  { clause: '§7', title: 'Sổ kiểm toán SHA-256 chỉ ghi thêm; hoàn tác là bản ghi mới; từ chối cũng ghi', run() {
    const st = fresh();
    Workflow.startAnalysis(st, Workflow.buildChange(st.registry, 'R-PK-01', '5 ngày', 2).change);
    const u2 = st.current.props.find(p => p.category === 'U2');
    Workflow.decide(st, u2.id, 'a');
    const c = Workflow.commit(st, { now: NOW, humanActor: () => 'Người · Trưởng phòng Thanh tra – Pháp chế' });
    const patch = st.ledger.find(e => e.action.startsWith('PATCH'));
    const before = st.ledger.length;
    const u = Workflow.undo(st, patch.seq, { now: NOW, humanActor: () => 'Người · Trưởng phòng Đào tạo' });
    const refusal = st.ledger.some(e => /TỪ CHỐI/.test(e.action));
    const tampered = st.ledger.map(e => ({ ...e }));
    tampered[0].to = tampered[0].to + ' (sửa lén)';
    const ok = c.ok && u.ok && st.ledger.length === before + 1 && refusal && Ledger.verify(st.ledger) && !Ledger.verify(tampered);
    return { ok, detail: st.ledger.length + ' bản ghi · chuỗi hợp lệ · sửa lén một bản ghi → chuỗi báo hỏng · có bản ghi từ chối' };
  } },
  { clause: '§8', title: 'Chuyên viên chỉ duyệt văn bản thuộc phạm vi của mình', run() {
    const st = fresh();
    Workflow.startAnalysis(st, Workflow.buildChange(st.registry, 'R-PK-01', '5 ngày', 2).change);
    const u1 = st.current.props.find(p => p.category === 'U1');
    const u2 = st.current.props.find(p => p.category === 'U2');
    const own = Authz.canDecide(Server.demoMember('cv-dt'), u1, st.current.change, st.registry).ok;
    const other = Authz.canDecide(Server.demoMember('tp-tc'), u1, st.current.change, st.registry).ok;
    const u2byStaff = Authz.canDecide(Server.demoMember('cv-dt'), u2, st.current.change, st.registry).ok;
    return { ok: own && !other && !u2byStaff, detail: 'CV Đào tạo quyết U1 của mình: ' + own + ' · TP Tài chính quyết U1 đó: ' + other + ' · CV quyết U2: ' + u2byStaff };
  } },
  { clause: '§9', title: 'Học từ phản hồi: chỉ đề xuất, người duyệt mới áp dụng', run() {
    const fb = (d, line) => ({ ruleId: 'R-PK-01', category: 'U1', docId: d, lineIndex: 0, line, answer: 'accept' });
    const reg = registry();
    const s = Learning.suggestAnchors([fb('A', 'Phiếu đăng ký phúc khảo gửi về khoa trong thời gian 7 ngày.'), fb('B', 'Phúc khảo: phiếu đăng ký gửi về khoa chậm nhất 7 ngày.')], reg);
    const unchanged = JSON.stringify(reg) === JSON.stringify(registry());
    const hit = s.find(x => x.phrase === 'phiếu đăng ký');
    return { ok: !!hit && hit.field === 'measures' && unchanged, detail: 'đề xuất “' + (hit ? hit.phrase : '—') + '” (' + (hit ? hit.field : '—') + '); sổ đăng ký không tự đổi' };
  } },
  { clause: '§10', title: 'Tập mù 40 ca: 0 tự sửa sai, 0 bỏ sót', run() {
    const { cases } = Evaluation.parseCsv(fs.readFileSync(path.join(ROOT, 'bench', 'blind.csv'), 'utf8'));
    const r = Evaluation.evaluate(cases, { registry: Data.SEED_REGISTRY });
    const pct = x => (x * 100).toFixed(1).replace('.', ',') + '%';
    return { ok: r.wrongEdits === 0 && r.misses === 0, detail: 'sửa sai ' + r.wrongEdits + '/' + r.autoActions + ' · bỏ sót ' + r.misses + '/' + r.expectedEscalate +
      ' · báo lên thừa ' + r.overEscalations + '/' + (r.expectedAuto + r.expectedNone) + ' (' + pct(r.overEscalationRate) + ', theo dõi, chưa đặt ngưỡng)' };
  } }
];

const results = CHECKS.map(c => {
  try { return { clause: c.clause, title: c.title, ...c.run() }; }
  catch (e) { return { clause: c.clause, title: c.title, ok: false, detail: 'Lỗi khi chạy: ' + (e && e.message) }; }
});
if (process.argv.includes('--json')) { console.log(JSON.stringify(results, null, 2)); process.exit(results.every(r => r.ok) ? 0 : 1); }
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
console.log('PolicyChange OS · kiểm chứng theo QT-KSTL-01 v2.0\n');
for (const r of results) console.log((r.ok ? '  ĐẠT  ' : '  TRƯỢT') + '  ' + pad(r.clause, 9) + r.title + '\n' + ' '.repeat(17) + r.detail);
const passed = results.filter(r => r.ok).length;
console.log('\n' + passed + '/' + results.length + ' điều đạt.');
process.exit(passed === results.length ? 0 : 1);

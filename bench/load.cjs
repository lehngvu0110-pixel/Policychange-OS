'use strict';
// Kiểm thử tải cục bộ (không mạng): đo động cơ, prover và bước lập kế hoạch ghi của máy chủ khi kho và sổ kiểm toán lớn dần.
// Chạy: node bench/load.cjs [--json]. Kho được nhân bản từ dữ liệu mẫu tổng hợp; số đo phụ thuộc máy chạy.
const { performance } = require('node:perf_hooks');
const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');
const Ledger = require('../js/policy-ledger.js');
const Workflow = require('../js/policy-workflow.js');
const Server = require('../js/policy-server.js');

function corpus(copies) {
  const docs = [];
  for (let i = 0; i < copies; i++) for (const d of Data.SEED_DOCUMENTS) docs.push({ ...d, id: d.id + '-' + i, lines: [...d.lines] });
  return docs;
}
function ledgerOf(n) {
  const ledger = [];
  for (let i = 0; i < n; i++) Ledger.append(ledger, { ts: '2026-10-01T00:00:00.000Z', actor: 'tải', docId: 'X', lineIndex: 0, action: 'GHI CHÚ', from: 'a', to: 'a', basis: 'kiểm thử tải', propId: null });
  return ledger;
}
const time = fn => { const t = performance.now(); const out = fn(); return { ms: +(performance.now() - t).toFixed(1), out }; };

const rows = [];
for (const copies of [1, 10, 50, 200]) {
  const registry = Engine.cloneRegistry(Data.SEED_REGISTRY);
  const docs = corpus(copies);
  const lines = docs.reduce((s, d) => s + d.lines.length, 0);
  const state = { registry, docs, current: null, ledger: [] };
  const change = Workflow.buildChange(registry, 'R-PK-01', '5 ngày', 2).change;
  const analyze = time(() => Workflow.startAnalysis(state, change, ''));
  const prove = time(() => state.current.props.filter(p => p.outcome === 'AUTO_PATCH').map(p => Workflow.prove(state, p).allowed));
  rows.push({ kind: 'engine', docs: docs.length, lines, positions: state.current.props.length, analyzeMs: analyze.ms, proveAllMs: prove.ms,
    proved: prove.out.filter(Boolean).length });
}
for (const n of [100, 1000, 5000, 10000]) {
  const ledger = ledgerOf(n);
  const tail = Ledger.tailOf(ledger);
  const ctx = { workspace: { id: 'load', mode: 'demo', ledger_seq: tail.seq, ledger_tail: tail.hash }, member: Server.demoMember('tp-dt'),
    registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), ledger, now: () => '2026-10-01T00:00:00.000Z' };
  const verify = time(() => Ledger.verify(ledger));
  const plan = time(() => Server.planCommit(ctx, { change: { ruleId: 'R-PK-01', newValue: '5 ngày', issuerTier: 2 } }));
  rows.push({ kind: 'server', ledger: n, verifyMs: verify.ms, planCommitMs: plan.ms, ok: plan.out.ok, records: plan.out.ok ? plan.out.rpc.p_records.length : 0 });
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
console.log('Động cơ + prover theo kích thước kho');
for (const r of rows.filter(x => x.kind === 'engine')) console.log(`  ${String(r.docs).padStart(5)} tài liệu · ${String(r.lines).padStart(6)} dòng · ${String(r.positions).padStart(5)} vị trí → phân tích ${r.analyzeMs} ms, prover ${r.proved} bản vá ${r.proveAllMs} ms`);
console.log('Máy chủ lập kế hoạch ban hành theo độ dài sổ kiểm toán (kiểm lại toàn chuỗi SHA-256 mỗi lần ghi)');
for (const r of rows.filter(x => x.kind === 'server')) console.log(`  ${String(r.ledger).padStart(6)} bản ghi → kiểm chuỗi ${r.verifyMs} ms, planCommit ${r.planCommitMs} ms (${r.ok ? r.records + ' bản ghi mới' : 'từ chối'})`);

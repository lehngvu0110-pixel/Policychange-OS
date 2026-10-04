'use strict';
// Phát lại các lần đo lớp AI thật (bench/ai-run-2026-10-01.json, bench/ai-run-2026-10-04.json) qua ĐÚNG bộ kiểm tra bằng chứng và luồng giữ lại của sản phẩm
// (Evaluation.evaluateWithSemantics → SemanticDiscovery.validateCandidates/applyEvidenceToProps). Không gọi mạng.
// Chạy: node bench/ai-replay.cjs
const fs = require('node:fs');
const path = require('node:path');
const Evaluation = require('../js/policy-evaluation.js');
const Data = require('../js/policy-data.js');
const Semantic = require('../js/semantic-discovery.js');

// Mỗi tệp là một lần đo thật; gộp nhãn quan hệ theo khoá "<tập>:<mã ca>".
const runs = ['ai-run-2026-10-01.json', 'ai-run-2026-10-04.json'].map(f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')));
const run = { model: runs[0].model, relations: Object.assign({}, ...runs.map(r => r.relations)) };
const pct = x => (x * 100).toFixed(1) + '%';
(async () => {
  for (const set of ['blind', 'holdout', 'blind2']) {
    const { cases } = Evaluation.parseCsv(fs.readFileSync(path.join(__dirname, set + '.csv'), 'utf8'));
    let missing = 0;
    const results = [];
    for (const c of cases) {
      const adapter = { async discover(payload) {
        const rec = run.relations[set + ':' + c.id];
        if (!rec) { missing++; return { available: false }; }
        return { available: true, output: { schemaVersion: 1, candidates: payload.candidates.map(x => ({
          ruleId: x.ruleId, documentId: x.documentId, lineIndex: x.lineIndex, quote: x.line, start: 0, end: x.line.length,
          relation: rec[0], explanation: rec[1], evidence: [{ quote: x.line, start: 0, end: x.line.length }] })) } };
      } };
      results.push(await Evaluation.evaluateWithSemantics([c], { registry: Data.SEED_REGISTRY, semantic: Semantic, adapter }));
    }
    const base = Evaluation.evaluate(cases, { registry: Data.SEED_REGISTRY });
    // Mỗi ca chạy riêng kèm AI; gộp lại theo actual của lần chạy đó.
    const rows = results.map(r => r.rows[0]);
    const wrongEdits = rows.filter(r => r.actual === 'AUTO' && r.expected !== 'AUTO').length;
    const autos = rows.filter(r => r.actual === 'AUTO').length;
    const misses = rows.filter(r => r.kind === 'miss').length;
    const over = rows.filter(r => r.kind === 'over').length;
    const held = rows.filter(r => r.actual === 'HOLD');
    console.log(set + '.csv · ' + run.model + (missing ? ' · thiếu bản ghi cho ' + missing + ' ca' : ''));
    console.log('  chỉ động cơ : sửa sai ' + base.wrongEdits + '/' + base.autoActions + ' · bỏ sót ' + base.misses + '/' + base.expectedEscalate + ' · báo lên thừa ' + base.overEscalations + '/' + (base.expectedAuto + base.expectedNone) + ' (' + pct(base.overEscalationRate) + ')');
    console.log('  + lớp AI    : sửa sai ' + wrongEdits + '/' + autos + ' · bỏ sót ' + misses + '/' + base.expectedEscalate + ' · báo lên thừa ' + over + '/' + (base.expectedAuto + base.expectedNone) + ' · AI giữ lại: ' + (held.map(h => h.id + ' (kỳ vọng ' + h.expected + ')').join(', ') || 'không'));
  }
})();

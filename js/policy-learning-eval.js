// @ts-check
/**
 * Thí nghiệm "học neo có giảm báo lên thừa không?" — đo trung thực vòng học từ phản hồi (yêu cầu nâng cao #1 của Đề A).
 *
 * 1. Chạy động cơ trên TẬP HỌC. Mỗi dòng bị đẩy lên U1 được "người phụ trách" trả lời đúng theo nhãn của ca:
 *    nhãn AUTO → "Có, thuộc quy định"; nhãn U1 hoặc NONE → "Không". Đây là MÔ PHỎNG một người trả lời đúng,
 *    không phải phản hồi của người thật.
 * 2. Lấy đề xuất neo (Learning.suggestAnchors, cần ≥ 2 câu “Có” cùng chứa một cụm), giả định trưởng đơn vị duyệt hết.
 * 3. Chấm TẬP ĐO trước và sau khi thêm neo. Tập đo không tham gia bước 1–2, nên con số không bị "học tủ".
 *
 * Dùng chung cho bench/learning-sim.cjs (Node) và màn hình Đánh giá (trình duyệt).
 */
(function attachLearningEval(/** @type {any} */ root, /** @type {(...args:any[]) => any} */ factory) {
  const api = factory();
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeLearningEval = api;
})(typeof globalThis === 'object' ? globalThis : this, function createLearningEval() {
  'use strict';

  /**
   * @param {{ train: any[], test: any[], registry: any[], Engine: any, Learning: any, Workflow: any, Evaluation: any, minSupport?: number, limit?: number }} input
   */
  function run(input) {
    const { Engine, Learning, Workflow, Evaluation } = input;
    const base = Engine.cloneRegistry(input.registry);
    const before = Evaluation.evaluate(input.test, { registry: Engine.cloneRegistry(base) });
    /** @type {any[]} */ const feedback = [];
    input.train.forEach((/** @type {any} */ c, /** @type {number} */ i) => {
      const r = Evaluation.classify(c, base);
      if (r.actual !== 'U1') return;
      const answer = c.expected === 'AUTO' ? 'accept' : (c.expected === 'U1' || c.expected === 'NONE') ? 'reject' : null;
      if (!answer) return;
      feedback.push({ ruleId: c.ruleId, category: 'U1', docId: 'TRAIN-' + (c.id || i), lineIndex: 0, line: c.line, answer });
    });
    const suggestions = Learning.suggestAnchors(feedback, base, { minSupport: input.minSupport || 2, limit: input.limit || 3 });
    const state = { registry: base, docs: [], current: null, ledger: [] };
    const applied = suggestions.filter((/** @type {any} */ s) => Workflow.addAnchor(state, s.ruleId, s.phrase,
      { now: () => '1970-01-01T00:00:00.000Z', actor: 'Người · trưởng đơn vị (mô phỏng)', field: s.field }).ok)
      .map((/** @type {any} */ s) => ({ ruleId: s.ruleId, phrase: s.phrase, field: s.field, support: s.support }));
    const after = Evaluation.evaluate(input.test, { registry: state.registry });
    const pick = (/** @type {any} */ r) => ({ total: r.total, wrongEdits: r.wrongEdits || 0, misses: r.misses, expectedEscalate: r.expectedEscalate,
      overEscalations: r.overEscalations, notEscalatable: r.expectedAuto + (r.expectedNone || 0), overEscalationRate: r.overEscalationRate, correct: r.correct });
    return {
      feedback: { total: feedback.length, accept: feedback.filter(f => f.answer === 'accept').length, reject: feedback.filter(f => f.answer === 'reject').length },
      anchors: applied, before: pick(before), after: pick(after)
    };
  }

  /**
   * Các cách chia học / đo hợp lệ (tập đo không bao giờ nằm trong tập học).
   * @param {{ dev: any[], blind1: any[], blind2: any[] }} sets
   */
  function splits(sets) {
    return [
      { train: 'Tập phát triển', test: 'Tập mù số 1', trainCases: sets.dev, testCases: sets.blind1 },
      { train: 'Tập phát triển', test: 'Tập mù số 2', trainCases: sets.dev, testCases: sets.blind2 },
      { train: 'Tập phát triển + tập mù số 2', test: 'Tập mù số 1', trainCases: sets.dev.concat(sets.blind2), testCases: sets.blind1 },
      { train: 'Tập phát triển + tập mù số 1', test: 'Tập mù số 2', trainCases: sets.dev.concat(sets.blind1), testCases: sets.blind2 }
    ];
  }

  return Object.freeze({ run, splits });
});

// Máy chủ Supabase giả lập trong bộ nhớ cho E2E chế độ dùng chung: PostgREST (chỉ đọc) + policy-api.
// Dùng ĐÚNG js/policy-server.js như Edge Function, chỉ thay Postgres bằng mảng trong bộ nhớ.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Engine = require('../../js/policy-engine.js');
const Data = require('../../js/policy-data.js');
const Ledger = require('../../js/policy-ledger.js');
const Server = require('../../js/policy-server.js');

export function createFakeBackend() {
  const db = {
    workspace: { id: 'demo', name: 'Trình diễn · dữ liệu tổng hợp', mode: 'demo', ledger_seq: 0, ledger_tail: Ledger.GENESIS },
    registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS),
    ledger: [], feedback: [], openChanges: [], decisions: []
  };
  const rows = {
    workspaces: () => [db.workspace],
    policies: () => db.registry.map((r, i) => ({ ...r, position: i })),
    documents: () => db.docs.map((d, i) => ({ ...d, position: i })),
    audit_log: () => db.ledger.map(e => ({ seq: e.seq, ts: e.ts, actor: e.actor, doc_id: e.docId, line_index: e.lineIndex ?? null, action: e.action,
      from_text: e.from, to_text: e.to, basis: e.basis, prop_id: e.propId ?? null, reverts_seq: e.revertsSeq ?? null, prev_hash: e.prevHash, hash: e.hash })),
    feedback_events: () => db.feedback,
    open_changes: () => db.openChanges.map(c => ({ id: c.id, rule_id: c.ruleId, old_value: c.oldValue, new_value: c.newValue, issuer_tier: c.issuerTier,
      request_text: c.requestText, created_by: c.createdBy, status: c.status, held: c.held })),
    change_decisions: () => db.decisions.map(d => ({ change_id: d.changeId, doc_id: d.docId, line_index: d.lineIndex, line: d.line, act: d.act,
      accepted: d.accepted, decided_by: d.decidedBy }))
  };

  function apply(rpc) {
    if (rpc.p_expected_seq !== db.workspace.ledger_seq || rpc.p_expected_tail !== db.workspace.ledger_tail) throw new Error('ledger_conflict');
    for (const u of rpc.p_doc_updates) {
      const d = db.docs.find(x => x.id === u.id);
      if (d.lines[u.lineIndex] !== u.from) throw new Error('stale_line');
      d.lines[u.lineIndex] = u.to; d.version = u.version;
    }
    for (const u of rpc.p_policy_updates) { const r = db.registry.find(x => x.id === u.id); r.value = u.value; r.aliases = [...u.aliases]; }
    for (const doc of rpc.p_new_documents) db.docs.push({ ...doc, lines: [...doc.lines] });
    for (const rec of rpc.p_records) { const { actorUser, ...r } = rec; db.ledger.push(r); }
    for (const f of rpc.p_feedback) db.feedback.push({ rule_id: f.ruleId, category: f.category, doc_id: f.docId, line_index: f.lineIndex, line: f.line, answer: f.answer, actor: f.actor });
    const oc = rpc.p_open_change;
    if (oc) db.openChanges = db.openChanges.filter(c => c.id !== oc.id).concat({ ...oc });
    for (const d of rpc.p_decisions || []) db.decisions.push({ ...d });
    if (rpc.p_close_change) db.openChanges.forEach(c => { if (c.id === rpc.p_close_change) c.status = 'closed'; });
    const tail = Ledger.tailOf(db.ledger);
    db.workspace.ledger_seq = tail.seq; db.workspace.ledger_tail = tail.hash;
  }

  function policyApi(body) {
    const member = Server.demoMember(String(body.persona || ''));
    if (!member) return [401, { error: 'unauthorized', message: 'Hãy chọn một vai trò trình diễn.' }];
    if (body.action === 'whoami') return [200, { member, workspace: { id: 'demo', mode: 'demo' } }];
    if (body.action === 'reset_demo') {
      Object.assign(db, { registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), ledger: [], feedback: [], openChanges: [], decisions: [] });
      db.workspace.ledger_seq = 0; db.workspace.ledger_tail = Ledger.GENESIS;
      return [200, { message: 'Đã khôi phục workspace trình diễn về dữ liệu mẫu.' }];
    }
    const ctx = { workspace: { ...db.workspace }, member, registry: Engine.cloneRegistry(db.registry), docs: Engine.cloneDocs(db.docs),
      ledger: db.ledger.map(e => ({ ...e })), openChanges: db.openChanges.map(c => ({ ...c })), decisions: db.decisions.map(d => ({ ...d })),
      now: () => new Date().toISOString() };
    const planners = { commit: Server.planCommit, decide: Server.planDecide, undo: Server.planUndo, add_anchor: Server.planAnchor, add_document: Server.planAddDocument };
    const plan = planners[body.action] ? planners[body.action](ctx, body) : null;
    if (!plan) return [400, { error: 'unknown_action', message: 'Thao tác không hỗ trợ.' }];
    if (!plan.ok) return [plan.status, { error: plan.error, message: plan.message, details: plan.details ?? null }];
    try { apply(plan.rpc); } catch (e) { return [409, { error: e.message, message: 'Có người vừa cập nhật workspace. Hãy tải lại.' }]; }
    return [200, { ...plan.body, member: { displayName: member.displayName, tier: member.tier } }];
  }

  /** Gắn vào một Playwright page. */
  async function attach(page) {
    await page.route('https://rsenhrsrzylubjavkqxs.supabase.co/**', async route => {
      const url = new URL(route.request().url());
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.slice('/rest/v1/'.length);
        return json(200, rows[table] ? rows[table]() : []);
      }
      if (url.pathname === '/functions/v1/policy-api') { const [s, b] = policyApi(route.request().postDataJSON() || {}); return json(s, b); }
      if (url.pathname.startsWith('/functions/v1/ai-')) return json(200, { available: false, reason: 'Máy chủ chưa cấu hình OPENAI_API_KEY; hệ thống dùng động cơ tiền định.' });
      return json(404, {});
    });
  }
  return { db, attach };
}

// PolicyChange OS · legal-discover: tra cứu một văn bản pháp luật theo số hiệu, chỉ từ nguồn trong allowlist.
//
// POST { action: "status" }                         → { configured, provider, sources, reason? }
// POST { action: "resolve", ref: { canonicalId, raw } }
//      → { status: "found", doc, cached } | { status: "not_found", reason } | { status: "error", reason, retryable }
//        | { status: "unavailable", reason }   (máy chủ chưa cấu hình nhà cung cấp tìm kiếm, hết hạn mức...)
// POST { action: "save_run", workspace, persona?, run } → lưu kết quả khám phá vào legal_discovery_runs
//
// Khoá nhà cung cấp tìm kiếm chỉ nằm trong Secrets của Edge Function, không bao giờ trả về trình duyệt:
//   LEGAL_SEARCH_PROVIDER = "google" | "brave"
//   LEGAL_SEARCH_API_KEY  = khoá của nhà cung cấp
//   LEGAL_SEARCH_CX       = mã Programmable Search Engine (chỉ với google)
//   LEGAL_DAILY_LIMIT (mặc định 200), LEGAL_CLIENT_LIMIT (mặc định 60)
//
// An toàn: chỉ tải https từ host trong allowlist, kiểm lại từng bước chuyển hướng, giới hạn 2 MB và 8 giây mỗi trang.
// Trang tải về là dữ liệu không tin cậy: chỉ bóc chữ và đọc bằng biểu thức chính quy (js/legal-page.js),
// không đưa vào mô hình ngôn ngữ, không thực thi. Trang phải chứa đúng số hiệu được hỏi mới được nhận.
import "../_shared/legal-refs.js";
import "../_shared/legal-page.js";
import "../_shared/legal-fetch.js";
import "../_shared/legal-discovery.js";
import "../_shared/legal-status.js";
import { Server } from "../_shared/modules.ts";
import "../_shared/legal-research.js";
import { CORS_HEADERS, json, readJson } from "../_shared/http.ts";
import { adminClient, clientKey } from "../_shared/quota.ts";

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const Refs = g.PolicyChangeLegalRefs;
const Page = g.PolicyChangeLegalPage;
const Fetch = g.PolicyChangeLegalFetch;
const Research = g.PolicyChangeLegalResearch;

const ID_RE = /^\d{1,5}\/(\d{4}\/)?[A-Z0-9]{1,10}(-[A-Z0-9]{1,12}){0,3}$/;
const lastCall = new Map<string, number>();

function provider(): { name: string; key: string; cx: string } | null {
  const name = (Deno.env.get("LEGAL_SEARCH_PROVIDER") || "").toLowerCase();
  const key = Deno.env.get("LEGAL_SEARCH_API_KEY") || "";
  const cx = Deno.env.get("LEGAL_SEARCH_CX") || "";
  if (name === "google" && key && cx) return { name, key, cx };
  if (name === "brave" && key) return { name, key, cx: "" };
  return null;
}

/** Giãn cách tối thiểu giữa hai lần gọi cùng một host (trong một phiên bản hàm). */
async function politeWait(url: string, signal?: AbortSignal) {
  const host = new URL(url).hostname;
  const next = Math.max(Date.now(), (lastCall.get(host) || 0) + 600);
  if (next - Date.now() > 6000) throw new Error("source_busy");
  lastCall.set(host, next);
  const wait = next - Date.now();
  if (signal?.aborted) throw new Error("cancelled");
  if (wait > 0) await new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new Error("cancelled")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, wait);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

async function search(p: { name: string; key: string; cx: string }, number: string, signal: AbortSignal): Promise<any> {
  const sites = Refs.SOURCES.filter((s: any) => s.tier === "primary").map((s: any) => "site:" + s.host).join(" OR ");
  const q = '"' + number + '" (' + sites + ")";
  const ctrl = new AbortController();
  const cancel = () => ctrl.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    let links: string[] = [];
    if (p.name === "google") {
      const u = "https://www.googleapis.com/customsearch/v1?num=10&key=" + encodeURIComponent(p.key) + "&cx=" + encodeURIComponent(p.cx) + "&q=" + encodeURIComponent(q);
      const res = await fetch(u, { signal: ctrl.signal, redirect: "error" });
      if (!res.ok) { await res.body?.cancel(); return { status: "error", code: "provider_http_" + res.status, reason: "Nhà cung cấp tìm kiếm trả mã " + res.status + ".", retryable: Fetch.retryable("http_" + res.status) }; }
      const read = await Fetch.readLimited(res, 1024 * 1024, ctrl.signal);
      if (!read.ok) return { status: "error", code: "provider_too_large", reason: "Phản hồi tìm kiếm vượt giới hạn.", retryable: false };
      const data = JSON.parse(read.text);
      if (!Array.isArray(data?.items) && data?.searchInformation?.totalResults !== "0") return { status: "error", code: "provider_parse", reason: "Không đọc được danh sách kết quả tìm kiếm.", retryable: false };
      links = Array.isArray(data?.items) ? data.items.map((i: any) => String(i?.link || "")) : [];
    } else {
      const u = "https://api.search.brave.com/res/v1/web/search?count=10&q=" + encodeURIComponent(q);
      const res = await fetch(u, { signal: ctrl.signal, redirect: "error", headers: { "X-Subscription-Token": p.key, Accept: "application/json" } });
      if (!res.ok) { await res.body?.cancel(); return { status: "error", code: "provider_http_" + res.status, reason: "Nhà cung cấp tìm kiếm trả mã " + res.status + ".", retryable: Fetch.retryable("http_" + res.status) }; }
      const read = await Fetch.readLimited(res, 1024 * 1024, ctrl.signal);
      if (!read.ok) return { status: "error", code: "provider_too_large", reason: "Phản hồi tìm kiếm vượt giới hạn.", retryable: false };
      const data = JSON.parse(read.text);
      if (!Array.isArray(data?.web?.results)) return { status: "error", code: "provider_parse", reason: "Không đọc được danh sách kết quả tìm kiếm.", retryable: false };
      links = Array.isArray(data?.web?.results) ? data.web.results.map((i: any) => String(i?.url || "")) : [];
    }
    // Chỉ giữ link thuộc allowlist; nguồn chính thức trước, theo thứ tự ưu tiên trong SOURCES.
    const rank = (u: string) => { const s = Refs.sourceFor(u); return s ? Refs.SOURCES.indexOf(Refs.SOURCES.find((x: any) => x.host === s.host)) : 99; };
    return { links: [...new Set(links.filter((u) => Refs.sourceFor(u)).map(u => Refs.normalizeUrl(u)))].sort((a, b) => rank(a) - rank(b)).slice(0, 10) };
  } catch {
    return { status: "error", code: signal.aborted ? "cancelled" : ctrl.signal.aborted ? "provider_timeout" : "provider_failure", reason: "Không đọc được phản hồi nhà cung cấp tìm kiếm.", retryable: !signal.aborted };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolve(req: Request, ref: any) {
  const admin = adminClient();
  const id = Refs.canonicalId(String(ref?.canonicalId || ref?.raw || ""));
  if (!ID_RE.test(id) || id.length > 80 || (ref?.raw && Refs.canonicalId(ref.raw) !== id)) return { status: "error", code: "invalid_id", reason: "Số hiệu không đúng định dạng hoặc mâu thuẫn nên không tra cứu.", retryable: false };

  const cached = await admin.from("legal_documents").select("*").eq("canonical_id", id).gt("cache_until", new Date().toISOString()).maybeSingle();
  if (cached.error) return { status: "error", code: "cache_error", reason: "Không đọc được bộ nhớ đệm máy chủ.", retryable: true };
  const cachedDoc = Research.cacheDoc(cached.data, new Date().toISOString());
  if (cachedDoc) return { status: "found", doc: cachedDoc, cached: true };

  const p = provider();
  if (!p) return { status: "unavailable", reason: "Máy chủ chưa cấu hình nhà cung cấp tìm kiếm (LEGAL_SEARCH_PROVIDER). Không tra cứu trực tuyến được." };
  const limit = Number(Deno.env.get("LEGAL_DAILY_LIMIT") || "200");
  const clientLimit = Number(Deno.env.get("LEGAL_CLIENT_LIMIT") || "60");
  const { data: allowed, error: qErr } = await admin.rpc("consume_legal_fetch_quota", { p_limit: limit, p_client: await clientKey(req), p_client_limit: clientLimit });
  if (qErr || allowed !== true) return { status: "unavailable", reason: "Đã hết hạn mức tra cứu trong ngày." };

  const ctrl = new AbortController();
  const cancel = () => ctrl.abort();
  req.signal.addEventListener("abort", cancel, { once: true });
  if (req.signal.aborted) cancel();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  try {
    const result = await search(p, id, ctrl.signal);
    if (ctrl.signal.aborted) return { status: "error", code: req.signal.aborted ? "cancelled" : "timeout", reason: "Yêu cầu tra cứu đã dừng.", retryable: !req.signal.aborted };
    if (result.status === "error") return result;
    const resolved = await Research.resolveCandidates(result.links, id, { fetchImpl: fetch, signal: ctrl.signal, beforeFetch: politeWait, now: () => new Date().toISOString() });
    if (ctrl.signal.aborted) return { status: "error", code: req.signal.aborted ? "cancelled" : "timeout", reason: "Yêu cầu tra cứu đã dừng.", retryable: !req.signal.aborted };
    if (resolved.status === "found") {
      const doc = resolved.doc;
      const retrievedAt = new Date().toISOString();
      const { error: cacheError } = await admin.from("legal_documents").upsert({
        canonical_id: id, number: doc.number, kind: doc.kind, title: doc.title, issuer: doc.issuer,
        issue_date: doc.issueDate, effective_from: doc.effectiveFrom, expires_on: doc.expiresOn, official_status: doc.officialStatus,
        sources: doc.sources, relations: doc.relations, body_text: doc.text, content_sha256: await sha256Hex(doc.text),
        retrieved_at: retrievedAt, cache_until: new Date(Date.now() + 7 * 86400_000).toISOString(),
        evidence: { parserVersion: Page.PARSER_VERSION, identity: doc.identity, coverage: doc.coverage, limitations: doc.limitations, retrievalFailures: doc.retrievalFailures || [], suspension: doc.suspension || null },
      });
      return { ...resolved, cached: false, cacheStored: !cacheError, cacheWarning: cacheError ? "Đã đọc nguồn nhưng chưa lưu được bằng chứng máy chủ; chưa thể lưu kết quả nghiên cứu. Kiểm tra migration và thử lại." : null };
    }
    return resolved;
  } finally { clearTimeout(timer); req.signal.removeEventListener("abort", cancel); }
}

async function saveRun(req: Request, body: any) {
  const admin = adminClient();
  const { data: ws } = await admin.from("workspaces").select("id, mode").eq("id", String(body.workspace || "")).maybeSingle();
  if (!ws) return json(404, { error: "workspace_not_found", message: "Không có workspace này." });
  let member: any = null;
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.split(".").length === 3) {
    const { data: u } = await admin.auth.getUser(token);
    if (u?.user && !u.user.is_anonymous) {
      const { data: row } = await admin.from("members").select("display_name, tier, units").eq("workspace_id", ws.id).eq("user_id", u.user.id).maybeSingle();
      if (row) member = { displayName: row.display_name, tier: row.tier, units: row.units, userId: u.user.id };
    }
  }
  if (!member && ws.mode === "demo") member = Server.demoMember(String(body.persona || ""));
  if (!member) return json(401, { error: "unauthorized", message: "Chỉ thành viên workspace mới lưu được kết quả tra cứu." });
  if (![1, 2, 3].includes(member.tier) || !Array.isArray(member.units) || !member.units.length) return json(403, { error: "forbidden", message: "Vai trò không có quyền lưu nghiên cứu." });
  const run = body.run;
  if (!Research.validateRun(run)) return json(400, { error: "bad_run", message: "Chỉ nhận nội dung đầu vào, nhãn, ngày đánh giá và giới hạn; không nhận đồ thị hay kết luận từ máy khách." });
  const rebuilt = await Research.rebuildRun(run, async (id: string) => {
    const cached = await admin.from("legal_documents").select("*").eq("canonical_id", id).maybeSingle();
    if (cached.error) throw new Error("cache_error");
    return cached.data;
  }, () => new Date().toISOString(), req.signal);
  if (!rebuilt.stats.found) return json(422, { error: "no_verified_evidence", message: "Chưa có văn bản với định danh và bằng chứng nguồn đã xác minh trên máy chủ. Hãy tra cứu lại trước khi lưu." });
  if (new TextEncoder().encode(JSON.stringify(rebuilt)).byteLength > 450000) return json(413, { error: "too_large", message: "Kết quả quá lớn để lưu; hãy giảm phạm vi tra cứu." });
  const { data, error } = await admin.from("legal_discovery_runs").insert({
    workspace_id: ws.id, created_by: Server.actorLabel(member).slice(0, 160), created_user: member.userId || null, start_label: run.startLabel,
    as_of: run.asOf, adapter: rebuilt.adapter, live: true, state: rebuilt.state,
    stop_reasons: rebuilt.stopReasons, limits: rebuilt.limits, stats: rebuilt.stats,
    graph: rebuilt.graph, assessments: rebuilt.assessments, trust_version: 1, evidence_sha256: rebuilt.evidenceHash, validated_at: rebuilt.validatedAt,
  }).select("id").single();
  if (error) return json(500, { error: "db_error", message: "Không lưu được kết quả tra cứu." });
  return json(200, { id: data.id, state: rebuilt.state, message: "Đã lưu kết quả máy chủ tái dựng từ bằng chứng nguồn; đây là thông tin tham khảo, không phải chứng nhận pháp lý." });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const parsed = await readJson(req, 600_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const action = String(body.action || "");
  if (action === "status") {
    const p = provider();
    return json(200, {
      configured: !!p, provider: p ? p.name : null, sources: Refs.SOURCES.map((s: any) => ({ host: s.host, name: s.name, tier: s.tier })),
      reason: p ? null : "Máy chủ chưa cấu hình nhà cung cấp tìm kiếm. Bộ nhớ đệm vẫn dùng được nếu đã có văn bản.",
    });
  }
  if (action === "resolve") {
    try { return json(200, await resolve(req, body.ref)); }
    catch { return json(200, { status: "error", reason: "Lỗi máy chủ khi tra cứu.", retryable: true }); }
  }
  if (action === "save_run") {
    try { return await saveRun(req, body); }
    catch { return json(500, { error: "save_failed", message: "Không xác nhận được việc lưu kết quả; hãy tải lại trước khi thử lại." }); }
  }
  return json(400, { error: "unknown_action", message: "Thao tác không hỗ trợ." });
});

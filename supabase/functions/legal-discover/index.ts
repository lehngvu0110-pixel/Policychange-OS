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
import { Server } from "../_shared/modules.ts";
import { CORS_HEADERS, json, readJson } from "../_shared/http.ts";
import { adminClient, clientKey } from "../_shared/quota.ts";

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const Refs = g.PolicyChangeLegalRefs;
const Page = g.PolicyChangeLegalPage;
const Fetch = g.PolicyChangeLegalFetch;

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
async function politeWait(url: string) {
  const host = new URL(url).hostname;
  const wait = (lastCall.get(host) || 0) + 600 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall.set(host, Date.now());
}

async function search(p: { name: string; key: string; cx: string }, number: string): Promise<string[] | null> {
  const sites = Refs.SOURCES.filter((s: any) => s.tier === "primary").map((s: any) => "site:" + s.host).join(" OR ");
  const q = '"' + number + '" (' + sites + ")";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    let links: string[] = [];
    if (p.name === "google") {
      const u = "https://www.googleapis.com/customsearch/v1?num=10&key=" + encodeURIComponent(p.key) + "&cx=" + encodeURIComponent(p.cx) + "&q=" + encodeURIComponent(q);
      const res = await fetch(u, { signal: ctrl.signal });
      if (!res.ok) return null;
      const data = await res.json();
      links = Array.isArray(data?.items) ? data.items.map((i: any) => String(i?.link || "")) : [];
    } else {
      const u = "https://api.search.brave.com/res/v1/web/search?count=10&q=" + encodeURIComponent(q);
      const res = await fetch(u, { signal: ctrl.signal, headers: { "X-Subscription-Token": p.key, Accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      links = Array.isArray(data?.web?.results) ? data.web.results.map((i: any) => String(i?.url || "")) : [];
    }
    // Chỉ giữ link thuộc allowlist; nguồn chính thức trước, theo thứ tự ưu tiên trong SOURCES.
    const rank = (u: string) => { const s = Refs.sourceFor(u); return s ? Refs.SOURCES.indexOf(Refs.SOURCES.find((x: any) => x.host === s.host)) : 99; };
    return [...new Set(links.filter((u) => Refs.sourceFor(u)))].sort((a, b) => rank(a) - rank(b)).slice(0, 3);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function rowToDoc(r: any) {
  return {
    canonicalId: r.canonical_id, number: r.number, kind: r.kind, title: r.title, issuer: r.issuer,
    issueDate: r.issue_date, effectiveFrom: r.effective_from, expiresOn: r.expires_on, officialStatus: r.official_status,
    sources: r.sources || [], relations: r.relations || [], text: r.body_text || "", synthetic: false,
  };
}

async function resolve(req: Request, ref: any) {
  const admin = adminClient();
  const id = Refs.canonicalId(String(ref?.canonicalId || ref?.raw || "")).slice(0, 80);
  if (!ID_RE.test(id)) return { status: "not_found", reason: "Số hiệu không đúng định dạng nên không tra cứu." };

  const cached = await admin.from("legal_documents").select("*").eq("canonical_id", id).gt("cache_until", new Date().toISOString()).maybeSingle();
  if (cached.data) return { status: "found", doc: rowToDoc(cached.data), cached: true };

  const p = provider();
  if (!p) return { status: "unavailable", reason: "Máy chủ chưa cấu hình nhà cung cấp tìm kiếm (LEGAL_SEARCH_PROVIDER). Không tra cứu trực tuyến được." };
  const limit = Number(Deno.env.get("LEGAL_DAILY_LIMIT") || "200");
  const clientLimit = Number(Deno.env.get("LEGAL_CLIENT_LIMIT") || "60");
  const { data: allowed, error: qErr } = await admin.rpc("consume_legal_fetch_quota", { p_limit: limit, p_client: await clientKey(req), p_client_limit: clientLimit });
  if (qErr || allowed !== true) return { status: "unavailable", reason: "Đã hết hạn mức tra cứu trong ngày." };

  const number = String(ref?.raw || id).slice(0, 80);
  const links = await search(p, number);
  if (links === null) return { status: "error", reason: "Nhà cung cấp tìm kiếm không phản hồi.", retryable: true };
  if (!links.length) return { status: "not_found", reason: "Không tìm thấy trên các nguồn trong danh sách cho phép." };

  let lastReason = "Không đọc được trang nguồn.";
  let retryable = false;
  for (const link of links) {
    await politeWait(link);
    const got = await Fetch.safeFetch(link, { fetchImpl: (u: string, init: any) => fetch(u, init) });
    if (!got.ok) { lastReason = got.reason; retryable = retryable || got.code === "timeout" || got.code === "network"; continue; }
    const retrievedAt = new Date().toISOString();
    const parsed = Page.parse({ html: got.body, url: got.url, requestedId: number, retrievedAt, source: got.source });
    if (!parsed.ok) { lastReason = parsed.reason; continue; }
    const doc = parsed.doc;
    if (doc.canonicalId !== id) { lastReason = "Trang trả về văn bản khác số hiệu."; continue; }
    await admin.from("legal_documents").upsert({
      canonical_id: id, number: doc.number, kind: doc.kind, title: doc.title, issuer: doc.issuer,
      issue_date: doc.issueDate, effective_from: doc.effectiveFrom, expires_on: doc.expiresOn, official_status: doc.officialStatus,
      sources: doc.sources, relations: doc.relations, body_text: doc.text, content_sha256: await sha256Hex(doc.text),
      retrieved_at: retrievedAt, cache_until: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });
    return { status: "found", doc, cached: false };
  }
  return retryable ? { status: "error", reason: lastReason, retryable: true } : { status: "not_found", reason: lastReason };
}

async function saveRun(req: Request, body: any) {
  const admin = adminClient();
  const { data: ws } = await admin.from("workspaces").select("id, mode").eq("id", String(body.workspace || "")).maybeSingle();
  if (!ws) return json(404, { error: "workspace_not_found", message: "Không có workspace này." });
  let who = "";
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.split(".").length === 3) {
    const { data: u } = await admin.auth.getUser(token);
    if (u?.user && !u.user.is_anonymous) {
      const { data: row } = await admin.from("members").select("display_name").eq("workspace_id", ws.id).eq("user_id", u.user.id).maybeSingle();
      if (row) who = row.display_name;
    }
  }
  if (!who && ws.mode === "demo") { const m = Server.demoMember(String(body.persona || "")); if (m) who = Server.actorLabel(m); }
  if (!who) return json(401, { error: "unauthorized", message: "Chỉ thành viên workspace mới lưu được kết quả tra cứu." });
  const run = body.run || {};
  // Không lưu kết quả mô phỏng vào CSDL: chỉ kết quả tra cứu thật mới có giá trị làm bằng chứng.
  if (run.live !== true) return json(400, { error: "synthetic", message: "Kết quả dữ liệu mô phỏng không được lưu vào workspace." });
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(run.asOf || "")) ? run.asOf : null;
  if (!asOf || (run.state !== "complete" && run.state !== "partial")) return json(400, { error: "bad_run", message: "Kết quả tra cứu không hợp lệ." });
  const { data, error } = await admin.from("legal_discovery_runs").insert({
    workspace_id: ws.id, created_by: who.slice(0, 160), start_label: String(run.startLabel || "").slice(0, 200) || "Văn bản đầu vào",
    as_of: asOf, adapter: String(run.adapter || "").slice(0, 80), live: true, state: run.state,
    stop_reasons: Array.isArray(run.stopReasons) ? run.stopReasons.map(String).slice(0, 5) : [],
    limits: run.limits && typeof run.limits === "object" ? run.limits : {}, stats: run.stats && typeof run.stats === "object" ? run.stats : {},
    graph: run.graph && typeof run.graph === "object" ? run.graph : {}, assessments: run.assessments && typeof run.assessments === "object" ? run.assessments : {},
  }).select("id").single();
  if (error) return json(500, { error: "db_error", message: "Không lưu được kết quả tra cứu." });
  return json(200, { id: data.id, message: "Đã lưu kết quả tra cứu vào workspace." });
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
  if (action === "save_run") return await saveRun(req, body);
  return json(400, { error: "unknown_action", message: "Thao tác không hỗ trợ." });
});

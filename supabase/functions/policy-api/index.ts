// PolicyChange OS · policy-api — mọi thao tác GHI đều đi qua đây.
//
// POST { action, workspace, persona?, ... }
//   action = "whoami" | "commit" | "decide" | "undo" | "add_anchor" | "add_document" | "reset_demo"
//
// Người gọi:
//   * workspace live  → bắt buộc JWT đăng nhập hợp lệ + có trong bảng members (cấp, đơn vị do quản trị cấp).
//   * workspace demo  → nếu không đăng nhập, dùng vai trò trình diễn (persona) do client chọn;
//                       sổ kiểm toán ghi rõ "(demo)". Quy tắc phân quyền vẫn áp dụng đầy đủ.
//
// Máy chủ tự chạy lại động cơ + prover trên dữ liệu trong CSDL (js/policy-server.js), rồi ghi bằng hàm SQL
// apply_change trong MỘT giao dịch có khoá workspace. Client không có quyền ghi trực tiếp vào bảng nào.
import { Data, Server } from "../_shared/modules.ts";
import { CORS_HEADERS, json, readJson } from "../_shared/http.ts";
import { adminClient } from "../_shared/quota.ts";

const CONFLICTS: Record<string, string> = {
  ledger_conflict: "Có người vừa cập nhật workspace. Hãy tải lại và phân tích lại.",
  stale_line: "Một dòng tài liệu đã bị sửa kể từ lúc phân tích. Hãy tải lại và phân tích lại.",
  chain_mismatch: "Chuỗi kiểm toán không khớp; thao tác đã bị huỷ.",
  policy_conflict: "Sổ đăng ký vừa được người khác cập nhật. Hãy tải lại.",
  document_exists: "Mã tài liệu đã tồn tại. Hãy tải lại.",
  decision_conflict: "Vị trí này vừa được người khác quyết. Hãy tải lại.",
  change_closed: "Hồ sơ đã được đóng. Hãy tải lại.",
  change_exists: "Có người vừa mở hồ sơ cho thay đổi này. Hãy tải lại.",
  change_missing: "Hồ sơ không còn tồn tại. Hãy tải lại.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed", message: "Chỉ nhận POST." });
  const parsed = await readJson(req, 400_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const action = String(body.action || "");
  const admin = adminClient();

  const { data: workspace, error: wsError } = await admin
    .from("workspaces").select("id, mode, ledger_seq, ledger_tail").eq("id", String(body.workspace || "demo")).maybeSingle();
  if (wsError) return json(500, { error: "db_error", message: "Không đọc được workspace." });
  if (!workspace) return json(404, { error: "workspace_not_found", message: "Không có workspace này." });

  // ---------- Xác định người gọi ----------
  let member: any = null;
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.split(".").length === 3) {
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (user && !user.is_anonymous) {
      const { data: row } = await admin.from("members").select("display_name, tier, units")
        .eq("workspace_id", workspace.id).eq("user_id", user.id).maybeSingle();
      if (row) member = { id: user.id, userId: user.id, displayName: row.display_name, tier: row.tier, units: row.units };
    }
  }
  if (!member && workspace.mode === "demo") member = Server.demoMember(String(body.persona || ""));
  if (!member) {
    return json(401, { error: "unauthorized", message: workspace.mode === "live"
      ? "Workspace thí điểm yêu cầu đăng nhập và được quản trị cấp quyền."
      : "Hãy chọn một vai trò trình diễn." });
  }
  if (action === "whoami") return json(200, { member, workspace: { id: workspace.id, mode: workspace.mode } });

  if (action === "reset_demo") {
    if (workspace.mode !== "demo") return json(403, { error: "forbidden", message: "Chỉ khôi phục được workspace trình diễn." });
    const { error } = await admin.rpc("reset_demo_workspace", {
      p_workspace: workspace.id, p_policies: Data.SEED_REGISTRY, p_documents: Data.SEED_DOCUMENTS,
    });
    if (error) return json(500, { error: "db_error", message: "Không khôi phục được dữ liệu mẫu." });
    return json(200, { message: "Đã khôi phục workspace trình diễn về dữ liệu mẫu." });
  }

  // ---------- Nạp trạng thái hiện tại ----------
  // PostgREST trả tối đa 1.000 dòng mỗi lần: đọc theo trang để không bao giờ thấy một sổ kiểm toán bị cắt cụt.
  const readAll = async (table: string, order: string) => {
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const page = await admin.from(table).select("*").eq("workspace_id", workspace.id).order(order).range(from, from + 999);
      if (page.error) return { data: null, error: page.error };
      rows.push(...page.data);
      if (page.data.length < 1000) return { data: rows, error: null };
    }
  };
  const [policies, documents, audit, openChanges, decisions] = await Promise.all([
    readAll("policies", "position"), readAll("documents", "position"), readAll("audit_log", "seq"),
    readAll("open_changes", "created_at"), readAll("change_decisions", "created_at"),
  ]);
  if (!policies.data || !documents.data || !audit.data || !openChanges.data || !decisions.data) {
    return json(500, { error: "db_error", message: "Không nạp được dữ liệu workspace." });
  }
  const ctx = {
    workspace, member,
    registry: policies.data.map(Server.fromDbPolicy),
    docs: documents.data.map(Server.fromDbDocument),
    ledger: audit.data.map(Server.fromDbRecord),
    openChanges: openChanges.data.map(Server.fromDbOpenChange),
    decisions: decisions.data.map(Server.fromDbDecision),
    now: () => new Date().toISOString(),
  };

  let plan: any;
  if (action === "commit") plan = Server.planCommit(ctx, body);
  else if (action === "decide") plan = Server.planDecide(ctx, body);
  else if (action === "undo") plan = Server.planUndo(ctx, body);
  else if (action === "add_anchor") plan = Server.planAnchor(ctx, body);
  else if (action === "add_document") plan = Server.planAddDocument(ctx, body);
  else return json(400, { error: "unknown_action", message: "Thao tác không hỗ trợ." });

  if (!plan.ok) return json(plan.status, { error: plan.error, message: plan.message, details: plan.details ?? null });

  const { data: written, error } = await admin.rpc("apply_change", plan.rpc);
  if (error) {
    const code = Object.keys(CONFLICTS).find((key) => String(error.message || "").includes(key));
    return code
      ? json(409, { error: code, message: CONFLICTS[code] })
      : json(500, { error: "db_error", message: "Ghi dữ liệu thất bại; không có thay đổi nào được lưu." });
  }
  return json(200, { ...plan.body, member: { displayName: member.displayName, tier: member.tier }, ledger: written });
});

// POST { requestText, registry } → { available, output?, model?, reason? }
// output tuân theo hợp đồng của js/policy-ai.js; trình duyệt vẫn validate lại trước khi dùng.
import "../_shared/openai-mapping.js";
// deno-lint-ignore no-explicit-any
const Mapping = (globalThis as any).PolicyChangeOpenAIMapping;
import { CORS_HEADERS, json, readJson } from "../_shared/http.ts";
import { callStructured, openAIConfigured, openAIModel } from "../_shared/openai.ts";
import { consumeAIQuota } from "../_shared/quota.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const parsed = await readJson(req, 60_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  if (body.probe === true) {
    return json(200, openAIConfigured()
      ? { available: true, output: null, model: openAIModel(), probe: true }
      : { available: false, reason: "Máy chủ chưa cấu hình OPENAI_API_KEY; hệ thống dùng động cơ tiền định." });
  }
  const requestText = typeof body.requestText === "string" ? body.requestText : "";
  const registry = Array.isArray(body.registry) ? body.registry : [];
  if (!requestText.trim() || requestText.length > Mapping.LIMITS.requestChars || !registry.length || registry.length > Mapping.LIMITS.registryRules) {
    return json(200, { available: false, reason: "Yêu cầu hoặc sổ đăng ký vượt giới hạn cho phép." });
  }
  if (!openAIConfigured()) return json(200, { available: false, reason: "Máy chủ chưa cấu hình OPENAI_API_KEY; hệ thống dùng động cơ tiền định." });
  if (!(await consumeAIQuota(req))) return json(200, { available: false, reason: "Đã hết hạn mức gọi AI trong ngày; hệ thống dùng động cơ tiền định." });

  const result = await callStructured(Mapping.extractMessages({ requestText, registry }), "policy_change_extraction", Mapping.EXTRACT_SCHEMA, 400);
  if (!result.ok) return json(200, { available: false, reason: result.reason });
  return json(200, { available: true, output: Mapping.toExtractContract(result.content, requestText), model: result.model });
});

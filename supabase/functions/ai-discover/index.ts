// POST { schemaVersion, requestText, targetPolicy, candidates:[{ruleId,documentId,lineIndex,line}] }
// → { available, output?, dropped?, model?, reason? }. output tuân theo hợp đồng js/semantic-discovery.js.
import "../_shared/openai-mapping.js";
// deno-lint-ignore no-explicit-any
const Mapping = (globalThis as any).PolicyChangeOpenAIMapping;
import { CORS_HEADERS, json, readJson } from "../_shared/http.ts";
import { callStructured, openAIConfigured } from "../_shared/openai.ts";
import { consumeAIQuota } from "../_shared/quota.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const parsed = await readJson(req, 120_000);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (!payload.targetPolicy || typeof payload.targetPolicy.ruleId !== "string" || !candidates.length ||
      candidates.length > Mapping.LIMITS.candidates ||
      candidates.some((c: any) => typeof c?.line !== "string" || c.line.length > Mapping.LIMITS.lineChars)) {
    return json(200, { available: false, reason: "Tập ứng viên rỗng hoặc vượt giới hạn cho phép." });
  }
  if (!openAIConfigured()) return json(200, { available: false, reason: "Máy chủ chưa cấu hình OPENAI_API_KEY; giữ nguyên kết quả tiền định." });
  if (!(await consumeAIQuota(req))) return json(200, { available: false, reason: "Đã hết hạn mức gọi AI trong ngày; giữ nguyên kết quả tiền định." });

  const result = await callStructured(Mapping.discoverMessages(payload), "semantic_evidence", Mapping.DISCOVER_SCHEMA, 1500);
  if (!result.ok) return json(200, { available: false, reason: result.reason });
  const { output, dropped } = Mapping.toDiscoverContract(result.content, payload);
  return json(200, { available: true, output, dropped, model: result.model });
});

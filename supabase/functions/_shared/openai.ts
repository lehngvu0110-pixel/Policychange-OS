// Gọi mô hình ngôn ngữ qua API Chat Completions chuẩn OpenAI với Structured Outputs (json_schema, strict).
// Khoá API chỉ đọc từ biến môi trường của Edge Function; không bao giờ trả về trình duyệt.
//
// Nhà cung cấp chọn bằng Secrets, không cần sửa mã:
//   * OpenAI (mặc định):  OPENAI_API_KEY = sk-...                      [OPENAI_MODEL, mặc định gpt-4o-mini]
//   * Google Gemini (có gói miễn phí, dùng endpoint tương thích OpenAI):
//       AI_API_KEY  = khoá từ Google AI Studio
//       AI_BASE_URL = https://generativelanguage.googleapis.com/v1beta/openai
//       AI_MODEL    = gemini-3.5-flash-lite (mặc định khi AI_BASE_URL trỏ tới Gemini)
//   * Nhà cung cấp tương thích OpenAI khác: đặt AI_API_KEY + AI_BASE_URL + AI_MODEL tương ứng.

export type OpenAIResult =
  | { ok: true; content: string; model: string }
  | { ok: false; reason: string };

function apiKey(): string {
  return Deno.env.get("AI_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
}

function baseUrl(): string {
  return (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "");
}

function isGemini(): boolean {
  return /generativelanguage\.googleapis\.com/.test(baseUrl());
}

export function openAIConfigured(): boolean {
  return !!apiKey();
}

export function openAIModel(): string {
  return Deno.env.get("AI_MODEL") || Deno.env.get("OPENAI_MODEL") || (isGemini() ? "gemini-3.5-flash-lite" : "gpt-4o-mini");
}

export async function callStructured(
  messages: { role: string; content: string }[],
  schemaName: string,
  schema: unknown,
  maxTokens: number,
  timeoutMs = 9000,
): Promise<OpenAIResult> {
  const key = apiKey();
  if (!key) return { ok: false, reason: "Máy chủ chưa cấu hình khoá AI (OPENAI_API_KEY hoặc AI_API_KEY); hệ thống dùng động cơ tiền định." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), isGemini() ? Math.max(timeoutMs, 15000) : timeoutMs);
  try {
    const response = await fetch(baseUrl() + "/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: openAIModel(),
        messages,
        temperature: 0,
        // Mô hình Gemini có thể dùng một phần hạn mức token để "suy nghĩ" trước khi trả JSON: nới rộng để không cụt.
        max_tokens: isGemini() ? maxTokens * 4 : maxTokens,
        response_format: { type: "json_schema", json_schema: { name: schemaName, schema, strict: true } },
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const raw = Array.isArray(data) ? data[0] : data;
      const detail = raw?.error?.message ? String(raw.error.message).slice(0, 200) : `HTTP ${response.status}`;
      return { ok: false, reason: `Nhà cung cấp AI trả lỗi: ${detail}` };
    }
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) return { ok: false, reason: "Mô hình từ chối xử lý yêu cầu." };
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) return { ok: false, reason: "Mô hình không trả về nội dung." };
    return { ok: true, content, model: String(data.model || openAIModel()) };
  } catch (error) {
    return { ok: false, reason: (error as Error)?.name === "AbortError" ? "AI hết thời gian chờ." : "Không gọi được nhà cung cấp AI." };
  } finally {
    clearTimeout(timer);
  }
}

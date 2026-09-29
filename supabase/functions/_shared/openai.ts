// Gọi OpenAI Chat Completions với Structured Outputs (json_schema, strict).
// Khoá API chỉ đọc từ biến môi trường của Edge Function; không bao giờ trả về trình duyệt.

export type OpenAIResult =
  | { ok: true; content: string; model: string }
  | { ok: false; reason: string };

export function openAIConfigured(): boolean {
  return !!Deno.env.get("OPENAI_API_KEY");
}

export function openAIModel(): string {
  return Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
}

export async function callStructured(
  messages: { role: string; content: string }[],
  schemaName: string,
  schema: unknown,
  maxTokens: number,
  timeoutMs = 9000,
): Promise<OpenAIResult> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return { ok: false, reason: "Máy chủ chưa cấu hình OPENAI_API_KEY; hệ thống dùng động cơ tiền định." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: openAIModel(),
        messages,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_schema", json_schema: { name: schemaName, schema, strict: true } },
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const detail = data?.error?.message ? String(data.error.message).slice(0, 200) : `HTTP ${response.status}`;
      return { ok: false, reason: `Nhà cung cấp AI trả lỗi: ${detail}` };
    }
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) return { ok: false, reason: "Mô hình từ chối xử lý yêu cầu." };
    const content = choice?.message?.content;
    if (typeof content !== "string") return { ok: false, reason: "Mô hình không trả về nội dung." };
    return { ok: true, content, model: String(data.model || openAIModel()) };
  } catch (error) {
    return { ok: false, reason: (error as Error)?.name === "AbortError" ? "AI hết thời gian chờ." : "Không gọi được nhà cung cấp AI." };
  } finally {
    clearTimeout(timer);
  }
}

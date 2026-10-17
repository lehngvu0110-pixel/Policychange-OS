export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function readJson(req: Request, maxBytes: number): Promise<{ ok: true; value: any } | { ok: false; response: Response }> {
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader?.cancel().catch(() => {}); reject(new Error("timeout")); }, 10000); });
  try {
    if (reader) for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { void reader.cancel().catch(() => {}); return { ok: false, response: json(413, { error: "too_large", message: "Yêu cầu quá lớn." }) }; }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: json(408, { error: "request_timeout", message: "Không đọc được yêu cầu trong thời gian cho phép." }) };
  } finally { clearTimeout(timer); reader?.releaseLock(); }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  const raw = new TextDecoder().decode(data);
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
    return { ok: true, value };
  } catch {
    return { ok: false, response: json(400, { error: "bad_json", message: "Nội dung yêu cầu không phải JSON hợp lệ." }) };
  }
}

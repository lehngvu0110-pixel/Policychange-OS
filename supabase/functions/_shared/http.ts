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
  const raw = await req.text();
  if (raw.length > maxBytes) return { ok: false, response: json(413, { error: "too_large", message: "Yêu cầu quá lớn." }) };
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
    return { ok: true, value };
  } catch {
    return { ok: false, response: json(400, { error: "bad_json", message: "Nội dung yêu cầu không phải JSON hợp lệ." }) };
  }
}

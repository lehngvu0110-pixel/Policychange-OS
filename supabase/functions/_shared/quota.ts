import { createClient } from "npm:@supabase/supabase-js@2";

export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Mã máy khách = SHA-256 (rút gọn) của IP người gọi; không lưu IP thô. */
async function clientKey(req: Request): Promise<string | null> {
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (!ip) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("policychange-os:" + ip));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/**
 * Trừ một lượt trong hạn mức AI: trần chung mỗi ngày (AI_DAILY_LIMIT, mặc định 300) và trần mỗi máy khách
 * (AI_CLIENT_LIMIT, mặc định 40). Lỗi CSDL thì từ chối (an toàn về chi phí).
 */
export async function consumeAIQuota(req: Request): Promise<boolean> {
  const limit = Number(Deno.env.get("AI_DAILY_LIMIT") || "300");
  const clientLimit = Number(Deno.env.get("AI_CLIENT_LIMIT") || "40");
  const { data, error } = await adminClient().rpc("consume_ai_quota", {
    p_limit: limit, p_client: await clientKey(req), p_client_limit: clientLimit,
  });
  return !error && data === true;
}

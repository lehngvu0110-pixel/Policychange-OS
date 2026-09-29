import { createClient } from "npm:@supabase/supabase-js@2";

export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Trừ một lượt trong hạn mức AI của ngày. Lỗi CSDL thì từ chối (an toàn về chi phí). */
export async function consumeAIQuota(): Promise<boolean> {
  const limit = Number(Deno.env.get("AI_DAILY_LIMIT") || "300");
  const { data, error } = await adminClient().rpc("consume_ai_quota", { p_limit: limit });
  return !error && data === true;
}

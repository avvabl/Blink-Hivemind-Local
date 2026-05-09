import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | undefined;

function client(): SupabaseClient {
  return (_client ??= createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ));
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string) {
    return (client() as unknown as Record<string, unknown>)[prop];
  },
});

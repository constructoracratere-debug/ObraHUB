import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client.
 *
 * Used in Client Components to read/refresh the auth session and to make
 * data queries that respect Row Level Security (the anon key is safe to
 * expose — access is gated by RLS policies at the database level).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

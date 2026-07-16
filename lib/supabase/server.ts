import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase server client for Server Components, Route Handlers and Server Actions.
 *
 * In Next.js 16 `cookies()` is async and must be awaited. Cookie writes are only
 * allowed inside Server Actions / Route Handlers, so `setAll` is wrapped in a
 * try/catch — the real session refresh happens in the proxy (`updateSession`).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where `set` is not allowed.
            // Safe to ignore — `updateSession` in the proxy refreshes the session.
          }
        },
      },
    },
  );
}

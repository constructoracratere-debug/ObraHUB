import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges the magic-link code (returned in the URL by Supabase Auth) for a
 * session, then redirects to the home page. This is the destination of the
 * `emailRedirectTo` set in the login page.
 *
 * On mobile, email apps often open links in an in-app browser (a different
 * cookie context than the main browser). If the code can't be exchanged we
 * redirect to login with an error hint rather than looping silently.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { origin } = requestUrl;
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  // No code at all — someone hit /auth/callback directly.
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Code expired, already-used, or wrong context. Send to login with a hint
    // so the user sees a clear message instead of a silent loop.
    console.error("Auth code exchange failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

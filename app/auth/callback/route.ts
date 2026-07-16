import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges the magic-link code (returned in the URL by Supabase Auth) for a
 * session, then redirects to the home page. This is the destination of the
 * `emailRedirectTo` set in the login page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Code missing or exchange failed — send to login with an error hint.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}

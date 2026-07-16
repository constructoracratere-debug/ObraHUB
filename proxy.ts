import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 Proxy (formerly "middleware").
 *
 * Renamed in v16 — see node_modules/next/dist/docs/.../proxy.md.
 * Runs `updateSession` on every request to keep the Supabase auth session fresh.
 * The proxy defaults to the Node.js runtime (runtime config is not allowed here).
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Match all paths except static assets and Next internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

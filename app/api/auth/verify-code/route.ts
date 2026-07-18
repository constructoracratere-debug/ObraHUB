import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const CODE_EXPIRY_MINUTES = 10;

/**
 * POST /api/auth/verify-code
 *
 * Verifies a 6-digit code against the `login_codes` table, then signs the user
 * in. If the email doesn't have an auth user yet, one is created via the admin
 * API. A fresh session is established by issuing an access/refresh token pair
 * that the client stores in cookies (handled by @supabase/ssr).
 */

function adminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false } },
  );
}

export async function POST(request: Request) {
  try {
    let body: { email?: unknown; code?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Correo electrónico inválido" }, { status: 400 });
    }
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "El código debe tener 6 dígitos" }, { status: 400 });
    }

    const supabase = adminClient();

    // Look up the stored code for this email.
    const { data: record, error: fetchError } = await supabase
      .from("login_codes")
      .select("code, expires_at, consumed")
      .eq("email", email)
      .maybeSingle();

    if (fetchError) {
      console.error("Failed to fetch login code:", fetchError.message);
      return NextResponse.json({ error: "Error al verificar" }, { status: 500 });
    }

    if (!record) {
      return NextResponse.json({ error: "Solicita un código primero" }, { status: 400 });
    }

    if (record.consumed) {
      return NextResponse.json({ error: "El código ya fue usado. Solicita uno nuevo." }, { status: 400 });
    }

    const expiresAt = new Date(record.expires_at).getTime();
    if (Date.now() > expiresAt) {
      return NextResponse.json(
        { error: `El código expiró. Solicita uno nuevo (válidos por ${CODE_EXPIRY_MINUTES} min).` },
        { status: 400 },
      );
    }

    if (record.code !== code) {
      return NextResponse.json({ error: "Código incorrecto" }, { status: 400 });
    }

    // Code is valid — mark it consumed so it can't be replayed.
    await supabase
      .from("login_codes")
      .update({ consumed: true })
      .eq("email", email);

    // Ensure an auth user exists for this email.
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email?.toLowerCase() === email);

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createError || !newUser.user) {
        console.error("Failed to create auth user:", createError?.message);
        return NextResponse.json({ error: "No se pudo crear la cuenta" }, { status: 500 });
      }
      userId = newUser.user.id;
    }

    // Issue a session by signing in server-side with the admin API.
    // We generate a secure random password and use password sign-in; the user
    // never sees it. This sets the auth cookies via the SSR client.
    const sessionPassword = crypto.randomUUID() + crypto.randomUUID();
    await supabase.auth.admin.updateUserById(userId, { password: sessionPassword });

    const ssrClient = await createClient();
    const { data: sessionData, error: signInError } = await ssrClient.auth.signInWithPassword({
      email,
      password: sessionPassword,
    });

    if (signInError || !sessionData.session) {
      console.error("Session creation failed:", signInError?.message);
      return NextResponse.json({ error: "No se pudo iniciar sesión" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("verify-code error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const CODE_EXPIRY_MINUTES = 10;

/**
 * POST /api/auth/send-code
 *
 * Sends a 6-digit login code to an email address. The code is generated here
 * (cryptographically random), stored in the `login_codes` table via the
 * service-role client, and emailed through Resend's API.
 *
 * Why this exists: Supabase's built-in OTP SMTP delivery had connection issues
 * with Resend. Sending directly via the Resend API is reliable (verified) and
 * gives full control over the email content.
 *
 * The matching verify step lives in /api/auth/verify-code.
 */

function generateSixDigitCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 10)).join("");
}

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
    let body: { email?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Correo electrónico inválido" },
        { status: 400 },
      );
    }

    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    const supabase = adminClient();
    const { error: upsertError } = await supabase
      .from("login_codes")
      .upsert(
        { email, code, expires_at: expiresAt.toISOString(), consumed: false },
        { onConflict: "email" },
      );

    if (upsertError) {
      console.error("Failed to store login code:", upsertError.message);
      return NextResponse.json({ error: "No se pudo enviar el código" }, { status: 500 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY!);
    const { error: emailError } = await resend.emails.send({
      from: "ObraHub <onboarding@resend.dev>",
      to: email,
      subject: "Tu código de acceso a ObraHub",
      html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #0f172a; margin: 0 0 8px;">Tu código de acceso a ObraHub</h2>
  <p style="color: #475569; margin: 0 0 24px;">Usa el siguiente código para iniciar sesión:</p>
  <div style="text-align: center; background: #f8fafc; border-radius: 12px; padding: 24px; margin: 0 0 24px;">
    <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #2563eb;">${code}</span>
  </div>
  <p style="color: #64748b; font-size: 13px; margin: 0;">El código expira en ${CODE_EXPIRY_MINUTES} minutos. Si no solicitaste este código, ignora este correo.</p>
</div>`,
    });

    if (emailError) {
      console.error("Resend send error:", emailError);
      return NextResponse.json({ error: "No se pudo enviar el correo" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("send-code error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

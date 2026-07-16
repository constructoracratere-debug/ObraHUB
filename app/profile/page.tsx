import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/app/_components/profile-form";

const PROFESSIONS = [
  "Arquitecto/a",
  "Ingeniero/a Civil",
  "Ingeniero/a Estructural",
  "Ingeniero/a Geotécnico/a",
  "Ingeniero/a de Obra",
  "Ingeniero/a Sanitario/a",
  "Interventor/a",
  "Constructor/a",
  "Otro",
];

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, profession_type, company, phone")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050b14] text-slate-200">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(37,99,235,0.18),transparent_60%)]"
      />

      <div className="relative mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <a
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          Volver a ObraHub
        </a>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0a1120]/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Tu perfil</h1>
          <p className="mt-2 text-sm text-slate-400">
            Estos datos nos ayudan a personalizar tus consultas técnicas.
          </p>

          <div className="mt-6 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Correo</p>
              <p className="truncate text-sm font-medium text-slate-200">{user.email}</p>
            </div>
          </div>

          <ProfileForm
            initial={{
              full_name: profile?.full_name ?? "",
              profession_type: profile?.profession_type ?? "",
              company: profile?.company ?? "",
              phone: profile?.phone ?? "",
            }}
            professions={PROFESSIONS}
          />
        </div>
      </div>
    </div>
  );
}

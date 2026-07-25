import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin, listGlobalDocuments } from "@/lib/documents";
import { DocumentsManager } from "@/app/_components/documents-manager";

export default async function DocumentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [admin, globalDocs] = await Promise.all([
    isCurrentUserAdmin(supabase),
    listGlobalDocuments(supabase),
  ]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#050b14] text-slate-200">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(37,99,235,0.18),transparent_60%)]"
      />

      <div className="relative mx-auto w-full max-w-4xl px-4 py-12 pt-[calc(env(safe-area-inset-top)+3rem)] sm:px-6 sm:py-16">
        <a
          href="/"
          className="mb-8 inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          Volver a ObraHub
        </a>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Biblioteca de documentos
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Normativas, reglamentos y documentos técnicos que el asistente usa para responder.
          </p>
        </div>

        <DocumentsManager
          globalDocs={globalDocs}
          isAdmin={admin}
          projectSlug={null}
        />
      </div>
    </div>
  );
}

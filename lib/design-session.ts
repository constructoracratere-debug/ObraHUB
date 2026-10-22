/**
 * SESIÓN DE DISEÑO EN LA NUBE — el dibujo COMPLETO (plano + etapa + memos +
 * equipamiento + revisiones) persiste por proyecto en el servidor, no sólo en
 * localStorage: el dibujo sigue al operador a cualquier dispositivo. Se
 * borra sólo con "Nuevo dibujo" (explícito) — igual que la copia local.
 *
 * v1: persistida como memory marcada "DSGN::" (sin DDL, mismo patrón que el
 * kit); cuando el schema crezca, se migra a tabla propia sin cambiar esta API.
 * Conflicto multi-dispositivo: gana la sesión con savedAt MÁS RECIENTE
 * (comparación la realiza el cliente, que conoce su copia local).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DesignSessionPayload = {
  /** Modelo FloorPlan vivo (version 2, rooms no vacíos). */
  plan: Record<string, unknown>;
  /** Etapa del flujo 0..5. */
  stage: number;
  siteMemo?: unknown;
  constructorMemo?: unknown;
  civilMemo?: unknown;
  equipment?: unknown[];
  revisions?: unknown[];
  /** ISO — reloj del cliente en el momento del autoguardado. */
  savedAt: string;
};

const MARK = "DSGN::";

type MemoryRow = { id: string; content: string; created_at: string };

export async function getDesignSession(
  supabase: SupabaseClient,
  projectId: string,
): Promise<DesignSessionPayload | null> {
  const { data } = await supabase
    .from("memories")
    .select("id, content, created_at")
    .eq("project_id", projectId)
    .like("content", MARK + "%")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as MemoryRow | undefined;
  if (!row) return null;
  try {
    const s = JSON.parse(row.content.slice(MARK.length)) as DesignSessionPayload;
    if (!s?.plan || typeof s.savedAt !== "string") return null;
    return s;
  } catch {
    return null;
  }
}

export async function setDesignSession(
  supabase: SupabaseClient,
  projectId: string,
  session: DesignSessionPayload,
): Promise<DesignSessionPayload> {
  // Una sola sesión activa: elimina marcas previas e inserta la nueva.
  await supabase
    .from("memories")
    .delete()
    .eq("project_id", projectId)
    .like("content", MARK + "%");
  const { error } = await supabase
    .from("memories")
    .insert({ project_id: projectId, content: MARK + JSON.stringify(session), source: "auto" });
  if (error) throw error;
  return session;
}

/** "Nuevo dibujo": la sesión en la nube también se borra — que no resucite
 *  en el otro dispositivo lo que el operador descartó explícitamente. */
export async function clearDesignSession(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  await supabase
    .from("memories")
    .delete()
    .eq("project_id", projectId)
    .like("content", MARK + "%");
}

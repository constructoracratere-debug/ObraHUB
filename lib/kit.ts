/**
 * KIT DE PROYECTO — el conjunto de archivos oficiales (2D, IFC, presupuesto)
 * que alimenta TODO el flujo: costos, gantt, bitacora, asamblea, pasaporte.
 * v1: persistido como memory marcada "KIT::" (sin DDL); cuando el schema
 * crezca, se migra a tabla propia sin cambiar esta API.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectKit = {
  name: string;
  /** IDs de archivos del storage que componen el kit. */
  fileIds: string[];
  /** Nota libre del usuario sobre el kit. */
  note?: string;
  updatedAt?: string;
};

const MARK = "KIT::";

type MemoryRow = { id: string; content: string; created_at: string };

export async function getKit(supabase: SupabaseClient, projectId: string): Promise<ProjectKit | null> {
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
    const kit = JSON.parse(row.content.slice(MARK.length)) as ProjectKit;
    return { ...kit, updatedAt: row.created_at };
  } catch {
    return null;
  }
}

export async function setKit(
  supabase: SupabaseClient,
  projectId: string,
  kit: ProjectKit,
): Promise<ProjectKit> {
  // Un solo kit activo: elimina marcas previas e inserta la nueva.
  await supabase
    .from("memories")
    .delete()
    .eq("project_id", projectId)
    .like("content", MARK + "%");
  const { error } = await supabase
    .from("memories")
    .insert({ project_id: projectId, content: MARK + JSON.stringify(kit), source: "auto" });
  if (error) throw error;
  return kit;
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for IFC ↔ Task links (BIM 4D).
 *
 * A link connects a Gantt task to one or more IFC element GlobalIds.
 * This enables bidirectional navigation: click a task in the Gantt →
 * highlight its elements in the 3D model; click an element in the model →
 * see which task it belongs to.
 */

export type IfcLink = {
  id: string;
  projectId: string;
  taskId: string;
  ifcFileId: string | null;
  ifcGlobalIds: string[];
  ifcClass: string | null;
  label: string | null;
  createdAt: string;
};

const COLUMNS =
  "id, project_id, task_id, ifc_file_id, ifc_global_ids, ifc_class, label, created_at";

function toLink(row: Record<string, unknown>): IfcLink {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    taskId: row.task_id as string,
    ifcFileId: (row.ifc_file_id as string) ?? null,
    ifcGlobalIds: (row.ifc_global_ids as string[]) ?? [],
    ifcClass: (row.ifc_class as string) ?? null,
    label: (row.label as string) ?? null,
    createdAt: row.created_at as string,
  };
}

/** Lists all IFC links for a project. */
export async function listIfcLinks(
  supabase: SupabaseClient,
  projectId: string,
): Promise<IfcLink[]> {
  const { data, error } = await supabase
    .from("project_ifc_links")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => toLink(r as Record<string, unknown>));
}

/** Lists all IFC links for a specific task. */
export async function listLinksForTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<IfcLink[]> {
  const { data, error } = await supabase
    .from("project_ifc_links")
    .select(COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => toLink(r as Record<string, unknown>));
}

/** Creates a new IFC link. */
export async function createIfcLink(
  supabase: SupabaseClient,
  params: {
    projectId: string;
    ownerId: string;
    taskId: string;
    ifcFileId?: string | null;
    ifcGlobalIds: string[];
    ifcClass?: string | null;
    label?: string | null;
  },
): Promise<IfcLink> {
  const { data, error } = await supabase
    .from("project_ifc_links")
    .insert({
      project_id: params.projectId,
      owner_id: params.ownerId,
      task_id: params.taskId,
      ifc_file_id: params.ifcFileId ?? null,
      ifc_global_ids: params.ifcGlobalIds,
      ifc_class: params.ifcClass ?? null,
      label: params.label ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toLink(data as Record<string, unknown>);
}

/** Deletes an IFC link. */
export async function deleteIfcLink(
  supabase: SupabaseClient,
  linkId: string,
): Promise<void> {
  const { error } = await supabase
    .from("project_ifc_links")
    .delete()
    .eq("id", linkId);
  if (error) throw error;
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for KB documents. Mirrors the projects/folders/memories pattern.
 * Global documents are shared; project documents belong to a project.
 */

export type KBDocument = {
  id: string;
  scope: "global" | "project";
  projectId: string | null;
  ownerId: string;
  title: string;
  slug: string;
  sourceFilename: string | null;
  pageCount: number;
  status: "processing" | "ready" | "failed";
  createdAt: string;
};

function toDocument(row: {
  id: string;
  scope: "global" | "project";
  project_id: string | null;
  owner_id: string;
  title: string;
  slug: string;
  source_filename: string | null;
  page_count: number;
  status: "processing" | "ready" | "failed";
  created_at: string;
}): KBDocument {
  return {
    id: row.id,
    scope: row.scope,
    projectId: row.project_id,
    ownerId: row.owner_id,
    title: row.title,
    slug: row.slug,
    sourceFilename: row.source_filename,
    pageCount: row.page_count,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Lists all global documents (shared library). */
export async function listGlobalDocuments(
  supabase: SupabaseClient,
): Promise<KBDocument[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, scope, project_id, owner_id, title, slug, source_filename, page_count, status, created_at")
    .eq("scope", "global")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toDocument);
}

/** Lists documents attached to a project (by project slug, ownership via RLS). */
export async function listProjectDocuments(
  supabase: SupabaseClient,
  projectSlug: string,
): Promise<KBDocument[]> {
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .maybeSingle();
  if (!project) return [];

  const { data, error } = await supabase
    .from("documents")
    .select("id, scope, project_id, owner_id, title, slug, source_filename, page_count, status, created_at")
    .eq("scope", "project")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toDocument);
}

/** Deletes a document (cascades to its chunks). Ownership via RLS. */
export async function deleteDocument(
  supabase: SupabaseClient,
  documentId: string,
): Promise<void> {
  const { error } = await supabase.from("documents").delete().eq("id", documentId);
  if (error) throw error;
}

/** Returns true if the current user is an admin (is_admin flag on profile). */
export async function isCurrentUserAdmin(
  supabase: SupabaseClient,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return data?.is_admin === true;
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for projects and conversations, backed by Supabase Postgres.
 *
 * Every function takes a `SupabaseClient` whose auth session determines the
 * acting user. Row Level Security further guarantees at the database level
 * that a user can only ever read/write their own data.
 */

export type Project = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Validates a project slug is kebab-case. Pure, no I/O. */
export function isValidProjectSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Normalizes a name into a URL-safe slug (accent-stripping, kebab-case). */
function slugify(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "proyecto";
}

/** Maps a Supabase projects row to the public Project shape (camelCase). */
function toProject(row: {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  created_at: string;
  updated_at: string;
}): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Lists the current user's projects, newest first. */
export async function listProjects(supabase: SupabaseClient): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, slug, city, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toProject);
}

/**
 * Deletes a project. The DB cascades to folders, conversations, memories,
 * and files automatically. RLS policy `projects_delete_own` enforces ownership.
 */
export async function deleteProject(
  supabase: SupabaseClient,
  slug: string,
): Promise<void> {
  const { error, count } = await supabase
    .from("projects")
    .delete({ count: "exact" })
    .eq("slug", slug);
  if (error) {
    throw error;
  }
  // RLS permite borrar solo al dueño: para un miembro la operación afecta
  // 0 filas SIN error. Antes se reportaba éxito, la UI lo quitaba y el
  // proyecto reaparecía al recargar ("homepage no se actualiza").
  if (count === 0) {
    throw new Error("Solo el dueño puede eliminar este proyecto");
  }
}

/** Finds a project by slug for the current user. Returns null if not found. */
export async function findProjectBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? { id: data.id } : null;
}

/** Creates a project for the current user. Slug is unique per user. */
export async function createProject(
  supabase: SupabaseClient,
  name: string,
  templateFolders?: string[],
  city?: string,
): Promise<Project> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Project name is required");
  }

  const baseSlug = slugify(trimmed);

  // Resolve a unique slug for this user (append -2, -3, ... if needed).
  let slug = baseSlug;
  let suffix = 2;
  for (;;) {
    const existing = await findProjectBySlug(supabase, slug);
    if (!existing) break;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({ name: trimmed, slug, user_id: userData.user.id, city: city?.trim() || null })
    .select("id, name, slug, city, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }
  const project = toProject(data);

  // Optionally seed template folders (e.g. Cimentación, Legal, Costos).
  if (templateFolders && templateFolders.length > 0) {
    const { createFolder } = await import("@/lib/folders");
    await Promise.all(
      templateFolders
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .map((n) => createFolder(supabase, slug, n).catch(() => null)),
    );
  }

  return project;
}

/** Loads the conversation history for a project (oldest first). */
export async function getConversations(
  supabase: SupabaseClient,
  slug: string,
): Promise<ConversationMessage[]> {
  const project = await findProjectBySlug(supabase, slug);
  if (!project) {
    throw new Error("Project not found");
  }

  const { data, error } = await supabase
    .from("conversation_messages")
    .select("role, content, created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }
  return (data ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: m.created_at,
  }));
}

/** Appends a message to a project's conversation and returns it. */
export async function appendConversationMessage(
  supabase: SupabaseClient,
  slug: string,
  message: { role: "user" | "assistant"; content: string },
): Promise<ConversationMessage> {
  const project = await findProjectBySlug(supabase, slug);
  if (!project) {
    throw new Error("Project not found");
  }

  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({
      project_id: project.id,
      role: message.role,
      content: message.content,
    })
    .select("role, content, created_at")
    .single();

  if (error) {
    throw error;
  }

  // updated_at is bumped automatically by the DB trigger (touch_project_updated_at).
  return {
    role: data.role as "user" | "assistant",
    content: data.content,
    timestamp: data.created_at,
  };
}

// ----------------------------------------------------------------------
// Folder-aware variants — conversations scoped to a folder within a project.
// The folder belongs to the project (and thus the user, via RLS).
// ----------------------------------------------------------------------

/** Resolves a folder's id within a project by slugs. Returns null if missing. */
export async function findFolderId(
  supabase: SupabaseClient,
  projectSlug: string,
  folderSlug: string,
): Promise<{ folderId: string; projectId: string } | null> {
  const project = await findProjectBySlug(supabase, projectSlug);
  if (!project) return null;

  const { data: folder } = await supabase
    .from("folders")
    .select("id")
    .eq("project_id", project.id)
    .eq("slug", folderSlug)
    .maybeSingle();

  if (!folder) return null;
  return { folderId: folder.id, projectId: project.id };
}

/** Loads the conversation history for a folder (oldest first). */
export async function getConversationsInFolder(
  supabase: SupabaseClient,
  projectSlug: string,
  folderSlug: string,
): Promise<ConversationMessage[]> {
  const ctx = await findFolderId(supabase, projectSlug, folderSlug);
  if (!ctx) {
    throw new Error("Folder not found");
  }

  const { data, error } = await supabase
    .from("conversation_messages")
    .select("role, content, created_at")
    .eq("folder_id", ctx.folderId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }
  return (data ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: m.created_at,
  }));
}

/** Appends a message to a folder's conversation and returns it. */
export async function appendConversationMessageInFolder(
  supabase: SupabaseClient,
  projectSlug: string,
  folderSlug: string,
  message: { role: "user" | "assistant"; content: string },
): Promise<ConversationMessage> {
  const ctx = await findFolderId(supabase, projectSlug, folderSlug);
  if (!ctx) {
    throw new Error("Folder not found");
  }

  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({
      project_id: ctx.projectId,
      folder_id: ctx.folderId,
      role: message.role,
      content: message.content,
    })
    .select("role, content, created_at")
    .single();

  if (error) {
    throw error;
  }

  // folder.updated_at is bumped by the touch_folder_updated_at trigger.
  return {
    role: data.role as "user" | "assistant",
    content: data.content,
    timestamp: data.created_at,
  };
}

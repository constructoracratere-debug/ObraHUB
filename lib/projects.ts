import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for projects and conversations, backed by Supabase Postgres.
 *
 * Every function takes a `SupabaseClient` whose auth session determines the
 * acting user. Row Level Security further guarantees at the database level
 * that a user can only ever read/write their own data.
 */

export type Project = {
  name: string;
  slug: string;
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
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}): Project {
  return {
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Lists the current user's projects, newest first. */
export async function listProjects(supabase: SupabaseClient): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("name, slug, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toProject);
}

/** Finds a project by slug for the current user. Returns null if not found. */
async function findProjectBySlug(
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
    .insert({ name: trimmed, slug, user_id: userData.user.id })
    .select("name, slug, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }
  return toProject(data);
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

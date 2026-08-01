import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for folders — sub-areas within a project (Foundation, Legal,
 * Costs, etc.). Each folder has its own chat history and AI memory.
 */

export type Folder = {
  id: string;
  name: string;
  slug: string;
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Suggested folders offered at project creation and as quick-add chips on the
 * empty folder dashboard. Users can accept/skip/customize — these are defaults.
 */
export const FOLDER_TEMPLATE = [
  "Cimentación",
  "Legal",
  "Costos y Presupuesto",
  "Seguimiento",
  "Recursos Humanos",
] as const;

/** Maps common folder names to an emoji icon for the dashboard cards. */
const FOLDER_ICONS: Record<string, string> = {
  cimentacion: "🏗️",
  "cimentación": "🏗️",
  foundation: "🏗️",
  estructural: "🏗️",
  legal: "⚖️",
  legales: "⚖️",
  permisos: "📜",
  costos: "💰",
  "costos y presupuesto": "💰",
  presupuesto: "💰",
  costosypresupuesto: "💰",
  financiero: "💰",
  seguimiento: "📋",
  "follow-up": "📋",
  followup: "📋",
  "recursos humanos": "👷",
  rrhh: "👷",
  rh: "👷",
  personal: "👷",
  diseno: "📐",
  "diseño": "📐",
  planos: "📐",
  geometrico: "📐",
  geotecnia: "⛰️",
  suelos: "⛰️",
  calidad: "✅",
  seguridad: "🦺",
  obra: "🚧",
  suministros: "📦",
  materiales: "📦",
};

/** Returns an emoji for a folder name, with sensible fallback. */
export function folderIcon(name: string): string {
  const key = name.trim().toLowerCase();
  if (FOLDER_ICONS[key]) return FOLDER_ICONS[key];
  // Partial match for things like "Costos y Presupuesto (USD)".
  for (const k of Object.keys(FOLDER_ICONS)) {
    if (key.includes(k)) return FOLDER_ICONS[k];
  }
  return "📁";
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidFolderSlug(slug: string): boolean {
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
  return slug || "carpeta";
}

function toFolder(row: {
  id: string;
  name: string;
  slug: string;
  parent_folder_id: string | null;
  created_at: string;
  updated_at: string;
}): Folder {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentFolderId: row.parent_folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const FOLDER_COLUMNS =
  "id, name, slug, parent_folder_id, created_at, updated_at";

/**
 * Lists folders for a project. Pass `parentFolderId` to list only children of
 * a specific folder; omit (or null) to list root-level folders.
 */
export async function listFolders(
  supabase: SupabaseClient,
  projectSlug: string,
  parentFolderId?: string | null,
): Promise<Folder[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Project not found");
  }

  let query = supabase
    .from("folders")
    .select(FOLDER_COLUMNS)
    .eq("project_id", data.id);

  if (parentFolderId) {
    query = query.eq("parent_folder_id", parentFolderId);
  } else {
    query = query.is("parent_folder_id", null);
  }

  const { data: folders, error: foldersError } = await query.order(
    "updated_at",
    { ascending: false },
  );

  if (foldersError) {
    throw foldersError;
  }
  return (folders ?? []).map(toFolder);
}

/** Creates a folder within a project. Pass parentFolderId to nest it. */
export async function createFolder(
  supabase: SupabaseClient,
  projectSlug: string,
  name: string,
  parentFolderId?: string | null,
): Promise<Folder> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Folder name is required");
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .maybeSingle();

  if (projectError || !project) {
    throw new Error("Project not found");
  }

  // Resolve a unique slug within the same parent group (not the whole project).
  const baseSlug = slugify(trimmed);
  let slug = baseSlug;
  let suffix = 2;
  for (;;) {
    let q = supabase
      .from("folders")
      .select("id")
      .eq("project_id", project.id)
      .eq("slug", slug);
    if (parentFolderId) {
      q = q.eq("parent_folder_id", parentFolderId);
    } else {
      q = q.is("parent_folder_id", null);
    }
    const { data: existing } = await q.maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const { data, error } = await supabase
    .from("folders")
    .insert({
      project_id: project.id,
      parent_folder_id: parentFolderId ?? null,
      name: trimmed,
      slug,
    })
    .select(FOLDER_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return toFolder(data);
}

/** Fetches a single folder by its ID. Returns null if not found / not owned. */
export async function getFolderById(
  supabase: SupabaseClient,
  folderId: string,
): Promise<Folder | null> {
  const { data, error } = await supabase
    .from("folders")
    .select(FOLDER_COLUMNS)
    .eq("id", folderId)
    .maybeSingle();
  if (error || !data) return null;
  return toFolder(data);
}

/**
 * Walks the parent chain from a folder up to the project root, returning the
 * path from root → ... → the folder (for breadcrumb rendering).
 */
export async function getFolderPath(
  supabase: SupabaseClient,
  folderId: string,
): Promise<Folder[]> {
  const path: Folder[] = [];
  let currentId: string | null = folderId;
  // Safety cap to avoid infinite loops if data is somehow cyclic.
  for (let i = 0; i < 20 && currentId; i++) {
    const folder = await getFolderById(supabase, currentId);
    if (!folder) break;
    path.unshift(folder);
    currentId = folder.parentFolderId;
  }
  return path;
}

/** Deletes a folder. Cascades to its messages + memories via DB FKs. */
/** Deletes a folder by ID. Cascades to subfolders, files, and Storage objects. */
export async function deleteFolderById(
  supabase: SupabaseClient,
  folderId: string,
): Promise<void> {
  const { error } = await supabase.from("folders").delete().eq("id", folderId);
  if (error) {
    throw error;
  }
}

/**
 * Legacy: deletes a root-level folder by project + slug. Kept for backward
 * compatibility with older callers. Prefer deleteFolderById.
 */
export async function deleteFolder(
  supabase: SupabaseClient,
  projectSlug: string,
  folderSlug: string,
): Promise<void> {
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .maybeSingle();
  if (!project) {
    throw new Error("Project not found");
  }

  const { data: folder, error } = await supabase
    .from("folders")
    .select("id")
    .eq("project_id", project.id)
    .is("parent_folder_id", null)
    .eq("slug", folderSlug)
    .maybeSingle();

  if (error || !folder) {
    throw new Error("Folder not found");
  }

  const { error: deleteError } = await supabase
    .from("folders")
    .delete()
    .eq("id", folder.id);

  if (deleteError) {
    throw deleteError;
  }
}

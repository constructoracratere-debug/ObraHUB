import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for folders — sub-areas within a project (Foundation, Legal,
 * Costs, etc.). Each folder has its own chat history and AI memory.
 */

export type Folder = {
  id: string;
  name: string;
  slug: string;
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
  created_at: string;
  updated_at: string;
}): Folder {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Lists folders for a project (newest-updated first). */
export async function listFolders(
  supabase: SupabaseClient,
  projectSlug: string,
): Promise<Folder[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Project not found");
  }

  const { data: folders, error: foldersError } = await supabase
    .from("folders")
    .select("id, name, slug, created_at, updated_at")
    .eq("project_id", data.id)
    .order("updated_at", { ascending: false });

  if (foldersError) {
    throw foldersError;
  }
  return (folders ?? []).map(toFolder);
}

/** Creates a folder within a project. Slug is unique per project. */
export async function createFolder(
  supabase: SupabaseClient,
  projectSlug: string,
  name: string,
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

  // Resolve a unique slug within this project.
  const baseSlug = slugify(trimmed);
  let slug = baseSlug;
  let suffix = 2;
  for (;;) {
    const { data: existing } = await supabase
      .from("folders")
      .select("id")
      .eq("project_id", project.id)
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const { data, error } = await supabase
    .from("folders")
    .insert({ project_id: project.id, name: trimmed, slug })
    .select("id, name, slug, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }
  return toFolder(data);
}

/** Deletes a folder. Cascades to its messages + memories via DB FKs. */
export async function deleteFolder(
  supabase: SupabaseClient,
  projectSlug: string,
  folderSlug: string,
): Promise<void> {
  // Resolve the project so we scope the folder lookup correctly (a folder
  // slug is only unique within a project, not globally).
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

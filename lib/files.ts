import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for project files (Storage tool / DMS).
 * Binary files live in the "project-files" Storage bucket; metadata in the
 * `files` table. Ownership is enforced by RLS (subquery through projects).
 */

export type ProjectFile = {
  id: string;
  folderId: string;
  name: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
};

export const FILE_BUCKET = "project-files";

/** Maximum upload size per file. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

/** Larger limit for BIM models (IFC files are often 50–200 MB). */
export const MAX_IFC_BYTES = 100 * 1024 * 1024; // 100 MB

/** Even larger limit for Revit models (.rvt can easily be 300+ MB). */
export const MAX_REVIT_BYTES = 300 * 1024 * 1024; // 300 MB

/** Accepted MIME types / extensions for the Storage tool. */
export const ACCEPTED_EXTENSIONS = [
  ".pdf", ".dwg", ".dxf", ".ifc", ".ifczip",
  ".rvt", ".rfa", ".rte",
  ".doc", ".docx", ".xls", ".xlsx",
  ".ppt", ".pptx", ".txt", ".csv",
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".zip", ".rar",
];

/** Returns true when a filename is an IFC model. */
export function isIfcFile(name: string): boolean {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ext === "ifc" || ext === "ifczip";
}

/** Returns true when a filename is a Revit model. */
export function isRevitFile(name: string): boolean {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ext === "rvt" || ext === "rfa" || ext === "rte";
}

/** Returns true when a filename is a CAD drawing (DWG/DXF). */
export function isCadFile(name: string): boolean {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ext === "dwg" || ext === "dxf";
}

/** Returns true when a filename is a spreadsheet (Excel/CSV). */
export function isExcelFile(name: string): boolean {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ext === "xlsx" || ext === "xls" || ext === "csv";
}

/** Returns an emoji icon for a filename based on its extension. */
export function fileIcon(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "📄";
  if (ext === "dwg" || ext === "dxf") return "📐";
  if (ext === "ifc" || ext === "ifczip") return "🏗️";
  if (ext === "rvt" || ext === "rfa" || ext === "rte") return "🏭";
  if (ext === "doc" || ext === "docx") return "📝";
  if (ext === "xls" || ext === "xlsx" || ext === "csv") return "📊";
  if (ext === "ppt" || ext === "pptx") return "🎯";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "🖼️";
  if (ext === "txt") return "📃";
  if (ext === "zip" || ext === "rar") return "🗜️";
  return "📎";
}

/** Human-readable file size. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Preview category for rendering decisions in the UI. */
export type PreviewKind = "pdf" | "image" | "office" | "ifc" | "revit" | "cad" | "none";

/** Determines how a file should be previewed based on its name/MIME. */
export function previewKind(name: string, mimeType?: string | null): PreviewKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const mt = (mimeType ?? "").toLowerCase();
  if (ext === "pdf" || mt === "application/pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext) || mt.startsWith("image/")) return "image";
  if (ext === "ifc" || ext === "ifczip" || mt.includes("ifc") || mt.includes("step")) return "ifc";
  if (ext === "rvt" || ext === "rfa" || ext === "rte") return "revit";
  if (ext === "dwg" || ext === "dxf") return "cad";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "office";
  return "none";
}

function toFile(row: {
  id: string;
  folder_id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
}): ProjectFile {
  return {
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

/** Lists files in a folder (newest first). */
export async function listFiles(
  supabase: SupabaseClient,
  folderId: string,
): Promise<ProjectFile[]> {
  const { data, error } = await supabase
    .from("files")
    .select("id, folder_id, name, storage_path, mime_type, size_bytes, created_at")
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toFile);
}

/** Deletes a file's metadata row. The Storage object is removed by the caller. */
export async function deleteFileRecord(
  supabase: SupabaseClient,
  fileId: string,
): Promise<{ storagePath: string } | null> {
  const { data } = await supabase
    .from("files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (!data) return null;

  const { error } = await supabase.from("files").delete().eq("id", fileId);
  if (error) throw error;
  return { storagePath: data.storage_path };
}

/** Creates a short-lived signed download URL for a file. */
export async function getSignedDownloadUrl(
  supabase: SupabaseClient,
  storagePath: string,
  ttlSeconds = 300,
): Promise<string> {
  const { data, error } = await supabase
    .storage
    .from(FILE_BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);

  if (error || !data?.signedUrl) {
    throw new Error("No se pudo generar el enlace de descarga");
  }
  return data.signedUrl;
}

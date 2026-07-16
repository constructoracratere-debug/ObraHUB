import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for AI project memory — facts/notes the assistant remembers
 * about each project and injects into its system prompt for better answers.
 */

export type Memory = {
  id: string;
  content: string;
  source: "manual" | "auto";
  createdAt: string;
};

/** Lists memories for a project (newest first). */
export async function listMemories(
  supabase: SupabaseClient,
  projectId: string,
): Promise<Memory[]> {
  const { data, error } = await supabase
    .from("memories")
    .select("id, content, source, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }
  return (data ?? []).map((m) => ({
    id: m.id,
    content: m.content,
    source: m.source as "manual" | "auto",
    createdAt: m.created_at,
  }));
}

/** Adds a memory to a project. */
export async function addMemory(
  supabase: SupabaseClient,
  projectId: string,
  content: string,
  source: "manual" | "auto" = "manual",
): Promise<Memory> {
  const { data, error } = await supabase
    .from("memories")
    .insert({ project_id: projectId, content, source })
    .select("id, content, source, created_at")
    .single();

  if (error) {
    throw error;
  }
  return {
    id: data.id,
    content: data.content,
    source: data.source as "manual" | "auto",
    createdAt: data.created_at,
  };
}

/** Deletes a memory. */
export async function deleteMemory(
  supabase: SupabaseClient,
  memoryId: string,
): Promise<void> {
  const { error } = await supabase.from("memories").delete().eq("id", memoryId);
  if (error) {
    throw error;
  }
}

/** Builds the memory text to inject into the chat system prompt. */
export function buildMemoryPrompt(memories: Memory[]): string {
  if (memories.length === 0) return "";
  const lines = memories.map((m) => `- ${m.content}`).join("\n");
  return `\n\nNOTAS DEL PROYECTO (contexto aportado por el profesional):\n${lines}`;
}

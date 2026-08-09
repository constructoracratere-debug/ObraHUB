import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for project tasks (Gantt chart / Seguimiento de Obra).
 */

export type ProjectTask = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  progress: number;
  dependencies: string[];
  taskType: "task" | "milestone" | "summary";
  color: string | null;
  sortOrder: number;
};

const COLUMNS =
  "id, project_id, name, description, start_date, end_date, progress, dependencies, task_type, color, sort_order";

function toTask(row: Record<string, unknown>): ProjectTask {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    progress: Number(row.progress),
    dependencies: (row.dependencies as string[]) ?? [],
    taskType: row.task_type as "task" | "milestone" | "summary",
    color: (row.color as string) ?? null,
    sortOrder: row.sort_order as number,
  };
}

/** Lists all tasks for a project, ordered by sort_order. */
export async function listTasks(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectTask[]> {
  const { data, error } = await supabase
    .from("project_tasks")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => toTask(r as Record<string, unknown>));
}

/** Replaces all tasks for a project (used when generating a new schedule). */
export async function replaceTasks(
  supabase: SupabaseClient,
  projectId: string,
  ownerId: string,
  tasks: Array<{
    name: string;
    startDate: string;
    endDate: string;
    progress?: number;
    dependencies?: string[];
    taskType?: string;
    description?: string;
    sortOrder?: number;
  }>,
): Promise<ProjectTask[]> {
  // Delete existing tasks for this project.
  await supabase.from("project_tasks").delete().eq("project_id", projectId);

  if (tasks.length === 0) return [];

  // First pass: insert all tasks without dependencies (they reference names, not IDs).
  // We'll resolve dependencies by name in a second pass.
  const rows = tasks.map((t, i) => ({
    project_id: projectId,
    owner_id: ownerId,
    name: t.name,
    description: t.description ?? null,
    start_date: t.startDate,
    end_date: t.endDate,
    progress: t.progress ?? 0,
    dependencies: [] as string[],
    task_type: t.taskType ?? "task",
    sort_order: t.sortOrder ?? i,
  }));

  const { data, error } = await supabase
    .from("project_tasks")
    .insert(rows)
    .select(COLUMNS);

  if (error) throw error;

  const inserted = (data ?? []).map((r) => toTask(r as Record<string, unknown>));

  // Second pass: resolve dependencies by name → id, then update.
  const nameToId = new Map(inserted.map((t) => [t.name, t.id]));
  for (let i = 0; i < tasks.length; i++) {
    const inputTask = tasks[i];
    if (!inputTask.dependencies || inputTask.dependencies.length === 0) continue;
    const depIds = inputTask.dependencies
      .map((depName) => nameToId.get(depName))
      .filter((id): id is string => !!id);
    if (depIds.length === 0) continue;

    const dbTask = inserted[i];
    await supabase
      .from("project_tasks")
      .update({ dependencies: depIds })
      .eq("id", dbTask.id);
    dbTask.dependencies = depIds;
  }

  return inserted;
}

/** Updates a single task (drag/resize/progress changes). */
export async function updateTask(
  supabase: SupabaseClient,
  taskId: string,
  updates: Partial<{
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    progress: number;
    dependencies: string[];
    taskType: string;
    sortOrder: number;
  }>,
): Promise<void> {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
  if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
  if (updates.progress !== undefined) dbUpdates.progress = updates.progress;
  if (updates.dependencies !== undefined) dbUpdates.dependencies = updates.dependencies;
  if (updates.taskType !== undefined) dbUpdates.task_type = updates.taskType;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;

  const { error } = await supabase.from("project_tasks").update(dbUpdates).eq("id", taskId);
  if (error) throw error;
}

/** Deletes a single task. */
export async function deleteTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<void> {
  const { error } = await supabase.from("project_tasks").delete().eq("id", taskId);
  if (error) throw error;
}

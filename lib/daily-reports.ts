import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for daily reports (Bitácora de Obra).
 * Each project has one report per day (unique project_id + report_date).
 */

export type DailyReport = {
  id: string;
  projectId: string;
  reportDate: string; // YYYY-MM-DD
  weather: string | null;
  workersCount: number | null;
  equipment: string | null;
  activitiesCompleted: string[]; // task IDs marked as done that day
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const COLUMNS = `
  id, project_id, report_date, weather, workers_count, equipment,
  activities_completed, notes, created_at, updated_at
`;

type DbRow = {
  id: string;
  project_id: string;
  report_date: string;
  weather: string | null;
  workers_count: number | null;
  equipment: string | null;
  activities_completed: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function toReport(row: DbRow): DailyReport {
  return {
    id: row.id,
    projectId: row.project_id,
    reportDate: row.report_date,
    weather: row.weather,
    workersCount: row.workers_count,
    equipment: row.equipment,
    activitiesCompleted: row.activities_completed ?? [],
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Lists all daily reports for a project, newest first. */
export async function listDailyReports(
  supabase: SupabaseClient,
  projectId: string,
): Promise<DailyReport[]> {
  const { data, error } = await supabase
    .from("project_daily_reports")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .order("report_date", { ascending: false });
  if (error) throw error;
  return (data as DbRow[]).map(toReport);
}

/** Creates or updates a daily report for a given date (upsert by project+date). */
export async function upsertDailyReport(
  supabase: SupabaseClient,
  projectId: string,
  ownerId: string,
  data: {
    reportDate: string;
    weather?: string;
    workersCount?: number;
    equipment?: string;
    activitiesCompleted?: string[];
    notes?: string;
  },
): Promise<DailyReport> {
  // Try to find existing report for this date
  const { data: existing } = await supabase
    .from("project_daily_reports")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .eq("report_date", data.reportDate)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await supabase
      .from("project_daily_reports")
      .update({
        weather: data.weather,
        workers_count: data.workersCount,
        equipment: data.equipment,
        activities_completed: data.activitiesCompleted,
        notes: data.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing as DbRow).id)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return toReport(updated as DbRow);
  }

  const { data: inserted, error } = await supabase
    .from("project_daily_reports")
    .insert({
      project_id: projectId,
      owner_id: ownerId,
      report_date: data.reportDate,
      weather: data.weather,
      workers_count: data.workersCount,
      equipment: data.equipment,
      activities_completed: data.activitiesCompleted,
      notes: data.notes,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toReport(inserted as DbRow);
}

/** Deletes a daily report. */
export async function deleteDailyReport(
  supabase: SupabaseClient,
  reportId: string,
): Promise<void> {
  const { error } = await supabase
    .from("project_daily_reports")
    .delete()
    .eq("id", reportId);
  if (error) throw error;
}

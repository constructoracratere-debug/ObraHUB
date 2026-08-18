import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listProjects } from "@/lib/projects";

/**
 * GET /api/portfolio — O(1) per project: reads denormalized project_health
 * (kept fresh by refreshProjectHealth on bitácora/budget writes) plus a
 * corporate summary strip (the C-level view across every project).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const projects = await listProjects(supabase);
    const slugs = (projects ?? []).map((p) => (p as unknown as { slug: string }).slug);
    const bySlug = new Map((projects ?? []).map((p) => [(p as unknown as { slug: string }).slug, p]));

    // Health rows only for projects we can see (RLS filters).
    const { data: rows } = await supabase
      .from("project_health")
      .select("project_id, name, progress, spi, alerts, critical, tasks_total, total_budget, next_milestone_name, next_milestone_date, last_bitacora_date")
      .order("updated_at", { ascending: false })
      .limit(500);
        const healthByProject = new Map(((rows ?? []) as Array<Record<string, any>>).map((r) => [r.project_id, r]));

    const cards = (projects ?? []).map((pRaw) => {
      const p = pRaw as unknown as { id?: string; name: string; slug: string; city?: string | null };
      const h = p.id ? healthByProject.get(p.id) : undefined;
      const today = new Date().toISOString().slice(0, 10);
      const daysSince = h?.last_bitacora_date
        ? Math.round((Date.parse(today) - Date.parse(h.last_bitacora_date)) / 86400000)
        : null;
      return {
        slug: p.slug,
        name: p.name,
        city: p.city ?? null,
        progress: Number(h?.progress ?? 0),
        spi: h?.spi != null ? Number(h.spi) : null,
        alerts: Number(h?.alerts ?? 0),
        critical: Number(h?.critical ?? 0),
        totalBudget: h?.total_budget != null ? Number(h.total_budget) : null,
        tasksTotal: Number(h?.tasks_total ?? 0),
        nextMilestone: h?.next_milestone_date ? { name: h.next_milestone_name ?? "", date: String(h.next_milestone_date).slice(0, 10) } : null,
        daysSinceBitacora: daysSince,
      };
    });

    const withSpi = cards.filter((c) => c.spi != null);
    const summary = {
      projects: cards.length,
      avgSpi: withSpi.length > 0 ? Number((withSpi.reduce((s2, c) => s2 + (c.spi ?? 0), 0) / withSpi.length).toFixed(2)) : null,
      critical: cards.reduce((s2, c) => s2 + c.critical, 0),
      alerts: cards.reduce((s2, c) => s2 + c.alerts, 0),
      bacTotal: cards.reduce((s2, c) => s2 + (c.totalBudget ?? 0), 0),
      stale: cards.filter((c) => c.daysSinceBitacora != null && c.daysSinceBitacora >= 3).length,
    };
    void slugs; void bySlug;
    return NextResponse.json({ cards, summary });
  } catch (error) {
    console.error("GET portfolio error:", error);
    return NextResponse.json({ error: "Failed to build portfolio" }, { status: 500 });
  }
}

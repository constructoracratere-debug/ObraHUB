import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import {
  upsertBitacoraEntry,
  getBitacoraEntry,
  listBitacoraEntries,
  type BitacoraEntryInput,
  type BitacoraWeather,
} from "@/lib/project-controls";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

const WEATHERS: BitacoraWeather[] = ["soleado", "nublado", "lluvia", "lluvia_fuerte", "otro"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseEntry(body: Record<string, unknown>): BitacoraEntryInput | null {
  const entryDate = typeof body.entryDate === "string" ? body.entryDate : "";
  if (!DATE_RE.test(entryDate)) return null;
  const weather = WEATHERS.includes(body.weather as BitacoraWeather)
    ? (body.weather as BitacoraWeather)
    : "soleado";
  const taskProgress = Array.isArray(body.taskProgress)
    ? (body.taskProgress as Array<Record<string, unknown>>)
        .filter((p) => typeof p?.taskId === "string" && p.taskId.length > 0)
        .map((p) => ({
          taskId: p.taskId as string,
          progress: Number(p.progress ?? 0),
          note: typeof p.note === "string" ? p.note : "",
        }))
    : [];
  return {
    entryDate,
    weather,
    rainHours: Number(body.rainHours ?? 0) || 0,
    workersTotal: Math.max(0, Math.round(Number(body.workersTotal ?? 0) || 0)),
    workersDetail: toCountMap(body.workersDetail),
    equipment: toCountMap(body.equipment),
    observations: typeof body.observations === "string" ? body.observations : "",
    incidents: typeof body.incidents === "string" ? body.incidents : "",
    delays: typeof body.delays === "string" ? body.delays : "",
    taskProgress,
    photos: Array.isArray(body.photos)
      ? (body.photos as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 30)
      : [],
  };
}

function toCountMap(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const num = Number(n);
    if (k.trim().length > 0 && Number.isFinite(num) && num !== 0) out[k.trim()] = num;
  }
  return out;
}

/**
 * GET /api/projects/[slug]/bitacora?date=YYYY-MM-DD
 *                            ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const sp = new URL(request.url).searchParams;
    const date = sp.get("date");
    const from = sp.get("from");
    const to = sp.get("to");

    if (date && DATE_RE.test(date)) {
      const entry = await getBitacoraEntry(supabase, project.id, date);
      // Signed URLs so the client can render evidence photos.
      if (entry && (entry.photos ?? []).length > 0) {
        const urls: string[] = [];
        for (const path of entry.photos ?? []) {
          const { data } = await supabase.storage.from("project-files").createSignedUrl(path, 3600);
          urls.push(data?.signedUrl ?? "");
        }
        entry.photoUrls = urls.filter(Boolean);
      }
      return NextResponse.json({ entry });
    }
    if (from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
      const entries = await listBitacoraEntries(supabase, project.id, { from, to });
      return NextResponse.json({ entries });
    }
    return NextResponse.json({ error: "date or from+to are required" }, { status: 400 });
  } catch (error) {
    console.error("GET bitacora error:", error);
    return NextResponse.json({ error: "Failed to load bitácora" }, { status: 500 });
  }
}

/**
 * POST /api/projects/[slug]/bitacora — upsert one day of the site log.
 * Body: BitacoraEntryInput (see lib/project-controls).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const entry = parseEntry(await request.json());
    if (!entry) {
      return NextResponse.json({ error: "entryDate (YYYY-MM-DD) is required" }, { status: 400 });
    }

    // Task ownership check — every referenced task must belong to the project.
    if (entry.taskProgress.length > 0) {
      const { count } = await supabase
        .from("project_tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .in("id", entry.taskProgress.map((p) => p.taskId));
      if (Number(count ?? 0) !== entry.taskProgress.length) {
        return NextResponse.json({ error: "Una de las tareas no pertenece al proyecto" }, { status: 400 });
      }
    }

    await upsertBitacoraEntry(supabase, {
      projectId: project.id,
      ownerId: user.id,
      entry,
    });
    const { refreshProjectHealth } = await import("@/lib/project-health");
    await refreshProjectHealth(supabase, project.id);
    const { logActivity } = await import("@/lib/project-controls");
    void logActivity(supabase, {
      projectId: project.id,
      userId: user.id,
      kind: "bitacora",
      description: `Bitácora ${entry.entryDate} registrada (${entry.taskProgress.length} tareas, ${(entry.photos ?? []).length} fotos)`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST bitacora error:", error);
    return NextResponse.json({ error: "Failed to save bitácora" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listDailyReports, upsertDailyReport, deleteDailyReport } from "@/lib/daily-reports";
import { findProjectBySlug } from "@/lib/projects";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** GET /api/projects/[slug]/daily-reports — list all reports, newest first. */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const reports = await listDailyReports(supabase, project.id);
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("GET daily-reports error:", error);
    return NextResponse.json({ error: "Failed to load daily reports" }, { status: 500 });
  }
}

/** POST /api/projects/[slug]/daily-reports — create or update a report (upsert by date). */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const reportDate = body.reportDate as string;
    if (!reportDate) {
      return NextResponse.json({ error: "reportDate is required" }, { status: 400 });
    }

    const report = await upsertDailyReport(supabase, project.id, user.id, {
      reportDate,
      weather: body.weather as string | undefined,
      workersCount: body.workersCount as number | undefined,
      equipment: body.equipment as string | undefined,
      activitiesCompleted: body.activitiesCompleted as string[] | undefined,
      notes: body.notes as string | undefined,
    });
    return NextResponse.json({ report });
  } catch (error) {
    console.error("POST daily-reports error:", error);
    return NextResponse.json({ error: "Failed to save daily report" }, { status: 500 });
  }
}

/** DELETE /api/projects/[slug]/daily-reports?id=<reportId> */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const reportId = new URL(request.url).searchParams.get("id");
    if (!reportId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await deleteDailyReport(supabase, reportId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE daily-reports error:", error);
    return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
  }
}

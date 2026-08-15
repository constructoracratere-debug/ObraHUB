import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { findProjectBySlug } from "@/lib/projects";
import { listTasks } from "@/lib/gantt-tasks";
import { listBudgets, getBudgetDetail, listBitacoraEntries } from "@/lib/project-controls";

type RouteContext = { params: Promise<{ slug: string }> };

const BOM = "\uFEFF"; // Excel-friendly UTF-8 CSV

function csv(rows: (string | number)[][]): string {
  return (
    BOM +
    rows
      .map((r) =>
        r
          .map((c) => {
            const v = String(c ?? "");
            return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
          })
          .join(";"),
      )
      .join("\n")
  );
}

const iso = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/projects/[slug]/export — one-click project backup.
 *
 * Returns a ZIP with everything the user owns for the project: overview,
 * Gantt, bitácora (entries + per-task progress), every saved budget with
 * its full APU breakdown, the file inventory and the member list.
 * File binaries stay in Storage (the inventory lists their paths); the
 * weekly PPTX is downloadable from Control de Obra.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { slug } = await context.params;
    const project = await findProjectBySlug(supabase, slug);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { data: projRow } = await supabase
      .from("projects")
      .select("name, created_at")
      .eq("id", project.id)
      .single();
    const projectName = (projRow as Record<string, any> | null)?.name ?? slug;

    const [tasks, budgets] = await Promise.all([
      listTasks(supabase, project.id),
      listBudgets(supabase, project.id),
    ]);

    const [{ data: files }, { data: folders }, { data: members }] = await Promise.all([
      supabase.from("files").select("name, size_bytes, mime_type, storage_path, created_at").eq("project_id", project.id),
      supabase.from("folders").select("name, parent_id, created_at").eq("project_id", project.id),
      supabase.from("project_members").select("user_id, role, created_at").eq("project_id", project.id),
    ]);

    // Bitácora: full range.
    const entries = await listBitacoraEntries(supabase, project.id, {
      from: "2000-01-01",
      to: "2999-12-31",
    });

    const zip = new JSZip();

    // --- resumen.md
    const totalBudget = budgets.reduce((s, b) => s + (b.total ?? 0), 0);
    zip.file(
      "resumen.md",
      [
        `# Exportación de proyecto — ${projectName}`,
        ``,
        `- Fecha de exportación: ${new Date().toLocaleString("es-CO")}`,
        `- Tareas del cronograma: ${tasks.length}`,
        `- Presupuestos guardados: ${budgets.length}${totalBudget > 0 ? ` (valor total: $${totalBudget.toLocaleString("es-CO")} COP)` : ""}`,
        `- Días de bitácora registrados: ${entries.length}`,
        `- Horas de lluvia acumuladas: ${entries.reduce((s, e) => s + (e.rainHours ?? 0), 0).toFixed(1)} h`,
        `- Carpetas: ${(folders ?? []).length} · Archivos: ${(files ?? []).length} · Miembros invitados: ${(members ?? []).length}`,
        ``,
        `## Contenido del ZIP`,
        `- \`cronograma.csv\` — tareas (Gantt)`,
        `- \`bitacora/bitacora.csv\` — registro diario`,
        `- \`bitacora/avance-por-tarea.csv\` — avance físico histórico por tarea y día`,
        `- \`presupuestos/<nombre>.csv\` — cada APU con desglose completo por ítem y recurso`,
        `- \`archivos.csv\` — inventario de archivos (los binarios permanecen en la nube privada)`,
        `- \`miembros.csv\` — equipo con roles`,
        ``,
        `> Generado con ObraHub — sistema operativo de obra para Colombia.`,
      ].join("\n"),
    );

    // --- cronograma.csv
    zip.file(
      "cronograma.csv",
      csv([
        ["Tarea", "Inicio", "Fin", "Avance %", "Tipo", "Dependencias"],
        ...tasks.map((t: any) => [t.name, t.startDate, t.endDate, t.progress, t.taskType ?? "task", Array.isArray(t.dependencies) ? t.dependencies.join(", ") : ""]),
      ]),
    );

    // --- bitácora
    const bitDir = zip.folder("bitacora")!;
    bitDir.file(
      "bitacora.csv",
      csv([
        ["Fecha", "Clima", "Horas lluvia", "Total personal", "Detalle personal", "Equipo", "Observaciones", "Incidentes", "Atrasos"],
        ...entries.map((e) => [
          e.entryDate, e.weather, e.rainHours, e.workersTotal,
          Object.entries(e.workersDetail ?? {}).map(([k, v]) => `${k}: ${v}`).join(", "),
          Object.entries(e.equipment ?? {}).map(([k, v]) => `${k}: ${v}`).join(", "),
          e.observations, e.incidents, e.delays,
        ]),
      ]),
    );
    const progressRows: (string | number)[][] = [["Fecha", "ID Tarea", "Avance %"]];
    for (const e of entries) {
      for (const p of e.taskProgress ?? []) progressRows.push([e.entryDate, p.taskId, p.progress]);
    }
    const nameById = new Map(tasks.map((t: any) => [t.id, t.name]));
    for (const r of progressRows.slice(1)) r[1] = nameById.get(r[1]) ?? r[1];
    progressRows[0][1] = "Tarea";
    bitDir.file("avance-por-tarea.csv", csv(progressRows));

    // --- presupuestos
    const budDir = zip.folder("presupuestos")!;
    for (const b of budgets) {
      const detail = await getBudgetDetail(supabase, b.id);
      if (!detail) continue;
      const rows: (string | number)[][] = [
        [`PRESUPUESTO: ${detail.title}`],
        [`Total: $${detail.total.toLocaleString("es-CO")} COP · Exportado ${iso()}`],
        [],
        ["Capítulo", "Código", "Ítem", "Unidad", "Cantidad", "Recurso", "Tipo", "Cant/Recurso", "Unidad recurso", "Vr. unitario", "Subtotal", "Fuente"],
      ];
      for (const it of detail.items) {
        const d = it.detalle as { materiales?: any[]; manoObra?: any[]; equipos?: any[] } | null;
        const lines: Array<[string, any[]]> = [
          ["Material", d?.materiales ?? []],
          ["Mano de obra", d?.manoObra ?? []],
          ["Equipo", d?.equipos ?? []],
        ];
        const hasLines = lines.some(([, arr]) => arr.length > 0);
        if (!hasLines) {
          rows.push([it.chapter, it.codigo, it.descripcion, it.unidad, it.cantidad, "(consolidado)", "", 1, "", it.precioUnitarioTotal, it.subtotal, ""]);
        }
        for (const [tipo, arr] of lines) {
          for (const l of arr) {
            rows.push([
              it.chapter, it.codigo, it.descripcion, it.unidad, it.cantidad,
              l.name ?? "", tipo, l.qty ?? "", l.unit ?? "", l.unitPrice ?? "", l.subtotal ?? "",
              l.source ?? "",
            ]);
          }
        }
      }
      const safe = b.title.replace(/[^\w\sáéíóúÁÉÍÓÚñÑ-]/g, "").replace(/\s+/g, "-").slice(0, 60);
      budDir.file(`${safe}.csv`, csv(rows));
    }

    // --- inventarios
    zip.file(
      "archivos.csv",
      csv([
        ["Nombre", "Tipo", "Tamaño (bytes)", "Ruta en Storage", "Creado"],
        ...((files ?? []) as Array<Record<string, any>>).map((f) => [f.name, f.mime_type ?? "—", f.size_bytes ?? 0, f.storage_path, f.created_at]),
      ]),
    );
    zip.file(
      "miembros.csv",
      csv([
        ["ID usuario", "Rol", "Invitado desde"],
        ...((members ?? []) as Array<Record<string, any>>).map((m) => [m.user_id, m.role, m.created_at]),
      ]),
    );

    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="ObraHub_${slug}_${iso()}.zip"`,
      },
    });
  } catch (error) {
    console.error("project export error:", error);
    return NextResponse.json({ error: "Failed to export project" }, { status: 500 });
  }
}

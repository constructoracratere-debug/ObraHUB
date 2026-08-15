import type { ControlDashboard } from "@/lib/earned-value";

/**
 * Alert engine — assembly-ready alerts derived from the control dashboard.
 * Pure rules over real data: every alert carries evidence + a recommendation
 * so it can be read out loud in the weekly assembly.
 */

export type AlertLevel = "critica" | "advertencia";

export type ProjectAlert = {
  id: string;
  level: AlertLevel;
  icon: string;
  title: string;
  evidence: string;
  recommendation: string;
};

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "—");

export function buildAlerts(
  d: ControlDashboard,
  entries: Array<{ entryDate: string; rainHours: number }> = [],
): ProjectAlert[] {
  const alerts: ProjectAlert[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // 1. Tareas vencidas sin terminar — crítica
  for (const t of d.tasks) {
    if (today > t.endDate && t.progress < 100) {
      alerts.push({
        id: `overdue-${t.id}`,
        level: "critica",
        icon: "🔴",
        title: `Tarea vencida: ${t.name}`,
        evidence: `Venció el ${t.endDate} con ${t.progress.toFixed(0)}% de avance (plan: 100%).`,
        recommendation: "Reprogramar, reforzar cuadrilla o evaluar impacto en la ruta crítica antes de la asamblea.",
      });
    }
  }

  // 2. Desempeño de cronograma (SPI)
  const spi = d.kpis.spi;
  if (spi != null && spi < 0.9) {
    alerts.push({
      id: "spi",
      level: spi < 0.8 ? "critica" : "advertencia",
      icon: spi < 0.8 ? "🔴" : "🟡",
      title: `Desempeño de cronograma bajo (SPI ${fmt(spi)})`,
      evidence: `Avance real ${d.kpis.progressEarned.toFixed(1)}% vs plan ${d.kpis.progressPlanned.toFixed(1)}% — por cada día planeado solo se ejecuta ${(spi * 100).toFixed(0)}%.`,
      recommendation:
        d.kpis.projectedEnd && d.kpis.projectedEnd > d.window.end
          ? `A este ritmo la obra termina el ${d.kpis.projectedEnd} (plan: ${d.window.end}). Considerar ampliación de plazo o recursos adicionales.`
          : "Recuperar atraso priorizando las tareas del semáforo rojo.",
    });
  }

  // 3. Desempeño de costo (CPI) — solo si hay costo real registrado
  const cpi = d.kpis.cpi;
  if (cpi != null && cpi < 0.9) {
    alerts.push({
      id: "cpi",
      level: cpi < 0.8 ? "critica" : "advertencia",
      icon: cpi < 0.8 ? "🔴" : "🟡",
      title: `Desviación de costo (CPI ${fmt(cpi)})`,
      evidence: `Valor ganado ${Math.round(d.kpis.ev).toLocaleString("es-CO")} vs costo real ${Math.round(d.kpis.ac).toLocaleString("es-CO")} COP.`,
      recommendation: "Revisar rendimientos de mano de obra y sobre-consumos de materiales en los ítems ejecutados.",
    });
  }

  // 4. Lluvia acumulada — evidencia para reclamo de plazo
  if (d.rainHoursTotal >= 8) {
    alerts.push({
      id: "rain",
      level: "advertencia",
      icon: "🌧️",
      title: `Lluvia acumulada: ${d.rainHoursTotal.toFixed(1)} horas`,
      evidence: `${d.rainDays} día(s) con lluvia registrados en bitácora.`,
      recommendation: "Documentar como causal de atraso (fuerza mayor) — soporte para ampliación de plazo ante la asamblea.",
    });
  }

  // 5. Bitácora desactualizada — el dato que faltan es el mayor riesgo
  if (entries.length > 0) {
    const last = entries.map((e) => e.entryDate).sort().pop() ?? "";
    const gap = Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${last}T00:00:00`)) / 86400000);
    if (gap >= 3) {
      alerts.push({
        id: "bitacora-stale",
        level: "advertencia",
        icon: "📔",
        title: `Bitácora sin registrar hace ${gap} días`,
        evidence: `Último registro: ${last}. Sin bitácora no hay evidencia legal ni alimentación de la Curva S.`,
        recommendation: "Registrar los días pendientes en 📔 Bitácora Diaria antes del informe de asamblea.",
      });
    }
  }

  // 6. Tareas activas sin avance reportado (estancamiento ≥3 días desde inicio)
  for (const t of d.tasks) {
    const startedDaysAgo = Math.round(
      (Date.parse(`${today}T00:00:00`) - Date.parse(`${t.startDate}T00:00:00`)) / 86400000,
    );
    if (today >= t.startDate && today <= t.endDate && t.progress === 0 && startedDaysAgo >= 3) {
      alerts.push({
        id: `stalled-${t.id}`,
        level: "advertencia",
        icon: "🟡",
        title: `Sin avance reportado: ${t.name}`,
        evidence: `Inició el ${t.startDate} (hace ${startedDaysAgo} días) y sigue en 0%.`,
        recommendation: "Verificar en obra si la tarea realmente no ha comenzado o si falta reportar el avance en bitácora.",
      });
    }
  }

  return alerts;
}

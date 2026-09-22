/** PASAPORTE 7: MANUAL DE DESMONTE (secuencia inversa) + SALUD ambiental. */
import type { FloorPlan } from "../design/schema";
export type DemoStep = { order: number; phase: string; action: string; caution: string };
export function deconstructionPlan(plan: FloorPlan): DemoStep[] {
  const levels = Math.max(1, plan.levels);
  return [
    { order: 1, phase: "Acabados", action: "Retirar pisos, apiques y fixtures SIN golpear muros (palanca + martillo goma)", caution: "Separar ceramicas enteras para reuso" },
    { order: 2, phase: "Carpinteria", action: `${plan.doors.length} puertas y ${plan.windows.length} ventanas: desatornillar bisagras y marcos, rotular pieza`, caution: "Vidrio: guantes + contenedor rigido" },
    { order: 3, phase: "Instalaciones", action: "Cortar energia en tablero, retirar cableado hidraulico y electrico en rollos", caution: "RETIE: certificado de corte antes de demoler" },
    { order: 4, phase: "Cubierta", action: "Desmontar losas/techo nivel por nivel (" + levels + ")", caution: "Acero expuesto: puntas cortadas dobladas" },
    { order: 5, phase: "Mamposteria", action: "Muros de arriba hacia abajo por paños; limpiar pega de ladrillo H-10 en sitio", caution: "Humedecer para polvo (Res. 2400 MINTRABAJO)" },
    { order: 6, phase: "Estructura", action: "Vigas y columnas: cortar en tramos manipulables con guillotina hidraulica", caution: "Triturar concreto a agregado reciclado (ECA)" },
    { order: 7, phase: "Cimentacion", action: "Zapatas: excavar y romper, separar acero del concreto", caution: "Verificar no afectar colindantes" },
  ].map((s, i) => ({ ...s, order: i + 1 }));
}
export function healthNotes(): string[] {
  return [
    "Madera/formaldehido: solicitar etiquetado tipo III (Res. 1555/2005 - envases y emisiones en interiores)",
    "Pañetes y ceramicas: verificar exencion de crisotilo (prohibido desde 2001 en Colombia) en insumos importados",
    "Concretos: polvo de silice cristalina - uso obligatorio de mascarilla N95 en corte (Res. 0312/2019 riesgos laborales)",
    "Ventanas/vidrio: plan de emergencia por rotura; reciclaje de vidrio evita 0.3 kg CO2e/kg",
  ];
}

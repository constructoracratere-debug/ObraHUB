/**
 * FASE 3 — ESPECTRO SISMICO NSR-10 (Cap. A.2.6, verificado contra el texto
 * oficial cosechado en kb/text/nsr10.txt):
 *   T <  T0 : Sa = 2.5*Aa*Fa*I*(0.4 + 0.6*T/T0)          [A.2.6-2]
 *   T0..TC : Sa = 2.5*Aa*Fa*I                            [A.2.6-3]
 *   TC..TL : Sa = 1.2*Av*Fv*I/T  (rama dinamica)          [figura A.2.6-1]
 *   T > TL : Sa >= 1.2*Av*Fv*TL*I/T^2                    [A.2.6-5]
 *   T0 = 0.1*Av*Fv/(Aa*Fa) ; TL = 2.4*Fv                  [A.2.6-4]
 */
export type SeismicInput = {
  /** Coeficientes de aceleracion pico (Tabla A.2.2/A.2.3 de tu municipio). */
  Aa: number;
  Av: number;
  /** Amplificacion de sitio (Tabla A.2.4-1/-3; perfil D tipico urbano). */
  Fa: number;
  Fv: number;
  /** Importancia (Grupo I vivienda = 1.0). */
  I?: number;
  /** Factor de disipacion R (porticos concreto moderadamente ductil = 7). */
  R?: number;
};

export const CITY_DEFAULTS: Record<string, SeismicInput> = {
  "Bogota D.C.": { Aa: 0.25, Av: 0.30, Fa: 1.3, Fv: 1.7, I: 1.0, R: 7 }, // verif. microzonacion SGC
  Medellin: { Aa: 0.20, Av: 0.25, Fa: 1.3, Fv: 1.7, I: 1.0, R: 7 },
  Cali: { Aa: 0.25, Av: 0.30, Fa: 1.3, Fv: 1.7, I: 1.0, R: 7 },
  Barranquilla: { Aa: 0.15, Av: 0.20, Fa: 1.3, Fv: 1.7, I: 1.0, R: 7 },
  Manizales: { Aa: 0.25, Av: 0.30, Fa: 1.3, Fv: 1.7, I: 1.0, R: 7 },
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function spectrum(sa: SeismicInput) {
  const I = sa.I ?? 1.0;
  const T0 = 0.1 * (sa.Av * sa.Fv) / (sa.Aa * sa.Fa);
  const TC = 0.48 * (sa.Av * sa.Fv) / (sa.Aa * sa.Fa);
  const TL = 2.4 * sa.Fv;
  const Sa = (T: number): number => {
    if (T <= 0) return 2.5 * sa.Aa * sa.Fa * I * 0.4;
    if (T < T0) return 2.5 * sa.Aa * sa.Fa * I * (0.4 + (0.6 * T) / T0);
    if (T <= TC) return 2.5 * sa.Aa * sa.Fa * I;
    if (T <= TL) return (1.2 * sa.Av * sa.Fv * I) / T;
    return (1.2 * sa.Av * sa.Fv * TL * I) / (T * T);
  };
  return { T0: r3(T0), TC: r3(TC), TL: r3(TL), Sa };
}

/** Corte basal Vs = Sa(Ta)*W*I/R (metodo fuerza horizontal equivalente). */
export function baseShear(sa: SeismicInput, Ta: number, Wkgf: number) {
  const s = spectrum(sa);
  return { Sa: r3(s.Sa(Ta)), Vs_kgf: Math.round((s.Sa(Ta) * Wkgf * (sa.I ?? 1)) / (sa.R ?? 7)), T0: s.T0, TC: s.TC, TL: s.TL };
}

/** Ta aproximado NSR-10 (metodo 1): Ta = Cth^alpha o N pisos. Vivienda porticos ~0.1*N. */
export const TaApprox = (levels: number) => r3(0.1 * Math.max(1, levels));

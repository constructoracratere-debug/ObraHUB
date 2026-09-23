/**
 * DISEÑO ESTRUCTURAL — Motor 2: PORTICOS 2D (metodo de rigidez directa).
 * Determinista y verificable: se valida contra formulas clasicas (viga
 * simply supported: delta = 5wL^4/384EI). DOF por nodo: [u, v, theta].
 * Unidades: kgf, m. E en kgf/m2 (concreto 2.1e9 aprox 2100000 kgf/cm2).
 */

export type Node2 = { x: number; z: number; support?: "fixed" };
export type Elem2 = { a: number; b: number; E: number; A: number; I: number };
export type LoadU = { elem: number; w: number }; // uniformly distributed (kgf/m, gravity -z)
export type FrameModel = { nodes: Node2[]; elems: Elem2[]; loads: LoadU[] };

const transpose = (M: number[][]): number[][] => M[0].map((_, j) => M.map((r) => r[j]));
const mul = (A: number[][], B: number[][]): number[][] =>
  A.map((r) => B[0].map((_, j) => r.reduce((s, _, k) => s + r[k] * B[k][j], 0)));
const inv = (M: number[][]): number[][] => {
  const n = M.length;
  const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-12;
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r !== c && A[r][c] !== 0) {
        const f = A[r][c];
        for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
      }
    }
  }
  return A.map((r) => r.slice(n));
};

/** Resuelve desplazamientos globales (por nodo [u,v,theta]). */
export function solveFrame(m: FrameModel): { disp: number[][]; reactions: number[][] } {
  const n = m.nodes.length;
  const dof = 3 * n;
  const K: number[][] = Array.from({ length: dof }, () => new Array(dof).fill(0));
  for (const [ei, el] of m.elems.entries()) {
    const a = m.nodes[el.a], b = m.nodes[el.b];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    const c = dx / L, s = dz / L;
    const T = [
      [c, s, 0, 0, 0, 0], [-s, c, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0],
      [0, 0, 0, c, s, 0], [0, 0, 0, -s, c, 0], [0, 0, 0, 0, 0, 1],
    ];
    const EA = el.E * el.A, EI = el.E * el.I;
    const kl = [
      [EA / L, 0, 0, -EA / L, 0, 0],
      [0, 12 * EI / L ** 3, 6 * EI / L ** 2, 0, -12 * EI / L ** 3, 6 * EI / L ** 2],
      [0, 6 * EI / L ** 2, 4 * EI / L, 0, -6 * EI / L ** 2, 2 * EI / L],
      [-EA / L, 0, 0, EA / L, 0, 0],
      [0, -12 * EI / L ** 3, -6 * EI / L ** 2, 0, 12 * EI / L ** 3, -6 * EI / L ** 2],
      [0, 6 * EI / L ** 2, 2 * EI / L, 0, -6 * EI / L ** 2, 4 * EI / L],
    ];
    const kg = mul(mul(transpose(T), kl), T);
    const map = [el.a * 3, el.a * 3 + 1, el.a * 3 + 2, el.b * 3, el.b * 3 + 1, el.b * 3 + 2];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) K[map[i]][map[j]] += kg[i][j];
  }
  // Cargas: w uniforme → equivalentes nodales (v: wL/2 abajo, M: wL2/12).
  const F = new Array(dof).fill(0);
  for (const ld of m.loads) {
    const el = m.elems[ld.elem];
    const a = m.nodes[el.a], b = m.nodes[el.b];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const map = [el.a * 3, el.a * 3 + 1, el.a * 3 + 2, el.b * 3, el.b * 3 + 1, el.b * 3 + 2];
    const f = [0, -ld.w * L / 2, -ld.w * L * L / 12, 0, -ld.w * L / 2, ld.w * L * L / 12];
    for (let i = 0; i < 6; i++) F[map[i]] += f[i];
  }
  // Apoyos: eliminar DOF (condensation por particion).
  const free: number[] = [], fixedI: number[] = [];
  m.nodes.forEach((nd, i) => {
    if (nd.support === "fixed") fixedI.push(i * 3, i * 3 + 1, i * 3 + 2);
    else free.push(i * 3, i * 3 + 1, i * 3 + 2);
  });
  const Kff = free.map((r) => free.map((c) => K[r][c]));
  const Ff = free.map((r) => F[r]);
  const uf = mul(inv(Kff), Ff.map((v) => [v])).map((r) => r[0]);
  const disp = m.nodes.map(() => [0, 0, 0]);
  free.forEach((gi, k) => { disp[Math.floor(gi / 3)][gi % 3] = uf[k]; });
  // Reacciones: R = K·u - F en DOF fijos.
  const reactions = m.nodes.map(() => [0, 0, 0]);
  for (const gi of fixedI) {
    let r = -F[gi];
    for (let j = 0; j < dof; j++) r += K[gi][j] * (disp[Math.floor(j / 3)][j % 3]);
    reactions[Math.floor(gi / 3)][gi % 3] = r;
  }
  return { disp, reactions };
}

/** Portal tipico desde el plan: una linea de reticula con sus niveles.
 *  Columnas empotradas en base, vigas entre ejes, cargas D+L por metro. */
export function portalFromPlan(spans: number[], levelsH: number[], wLineal: number, sections: { col: { A: number; I: number }; beam: { A: number; I: number } }): FrameModel {
  const E = 2.1e9; // kgf/m2 (concreto 210 ton/cm2)
  const xs: number[] = [0];
  for (const s of spans) xs.push(xs[xs.length - 1] + s);
  const zs: number[] = [0];
  for (const h of levelsH) zs.push(zs[zs.length - 1] + h);
  const nodes: Node2[] = [];
  const elems: Elem2[] = [];
  for (const [li, z] of zs.entries())
    for (const x of xs) nodes.push({ x, z, support: li === 0 ? "fixed" : undefined });
  const per = xs.length;
  const id = (li: number, xi: number) => li * per + xi;
  for (let li = 0; li < zs.length - 1; li++)
    for (let xi = 0; xi < per; xi++)
      elems.push({ a: id(li, xi), b: id(li + 1, xi), E, ...sections.col });
  const loads: LoadU[] = [];
  for (let li = 1; li < zs.length; li++)
    for (let xi = 0; xi < per - 1; xi++) {
      elems.push({ a: id(li, xi), b: id(li, xi + 1), E, ...sections.beam });
      loads.push({ elem: elems.length - 1, w: wLineal });
    }
  return { nodes, elems, loads };
}

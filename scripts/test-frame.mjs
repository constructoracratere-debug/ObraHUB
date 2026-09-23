import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
execSync("npx tsc lib/structural/frame.ts --outDir .tmp-fr --module commonjs --target es2020 --skipLibCheck --esModuleInterop", { stdio: "inherit" });
const req = createRequire(import.meta.url);
const { solveFrame, portalFromPlan } = req(path.join(process.cwd(), ".tmp-fr", "frame.js"));
let pass = 0, fail = 0; const check = (l, ok) => { console.log(`${ok ? "✓" : "✗"} ${l}`); ok ? pass++ : fail++; };

// 1) Viga empotrada-empotrada de 2 tramos: delta centro = wL^4/(384EI)
{
  const E = 2.1e9, I = 0.3 ** 4 / 12, A = 0.3 * 0.3, L = 6, w = 2000;
  const m = {
    nodes: [{ x: 0, z: 0, support: "fixed" }, { x: L / 2, z: 0 }, { x: L, z: 0, support: "fixed" }],
    elems: [{ a: 0, b: 1, E, A, I }, { a: 1, b: 2, E, A, I }],
    loads: [{ elem: 0, w }, { elem: 1, w }],
  };
  const r = solveFrame(m);
  const delta = r.disp[1][1];
  const teo = (-w * L ** 4) / (384 * E * I);
  check(`delta centro ${delta.toFixed(6)} vs teo ${teo.toFixed(6)} (<2%)`, Math.abs((delta - teo) / teo) < 0.02);
  // Reacciones verticales = wL total
  const Rv = Math.abs(r.reactions[0][1]) + Math.abs(r.reactions[2][1]);
  check(`suma reacciones ${Rv.toFixed(0)} = wL ${w * L}`, Math.abs(Rv - w * L) < 1);
  // Momento empotramiento ~ wL2/12
  const M = Math.abs(r.reactions[0][2]);
  const Mteo = (w * L * L) / 12;
  check(`M empotramiento ${M.toFixed(0)} vs teo ${Mteo.toFixed(0)} (<5%)`, Math.abs((M - Mteo) / Mteo) < 0.05);
}
// 2) Portal 2 vanos x 2 niveles: equilibrio y deriva coherente
{
  const sec = { col: { A: 0.09, I: 0.3 ** 4 / 12 }, beam: { A: 0.075, I: 0.3 * 0.25 ** 3 / 12 } };
  const m = portalFromPlan([4, 4], [2.6, 2.6], 3000, sec);
  const r = solveFrame(m);
  const total = 3000 * 8 * 2;
  const Rv = r.reactions.slice(0, 3).reduce((s, x) => s + Math.abs(x[1]), 0);
  check(`portal: nodos ${m.nodes.length}, elems ${m.elems.length}`, m.nodes.length === 9 && m.elems.length === 10);
  check(`portal: equilibrio ${Rv.toFixed(0)} = ${total}`, Math.abs(Rv - total) < total * 0.01);
  check("portal: sin NaN", r.disp.every((d) => d.every((v) => Number.isFinite(v))));
}
console.log(`\n${pass} pasan · ${fail} fallan`);
process.exit(fail ? 1 : 0);

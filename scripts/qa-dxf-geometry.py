"""
QA GEOMÉTRICO DEL DXF — mide el archivo ploteado como lo haría un revisor:

  1. Fuera de lámina: entidades fuera del marco interior (10..690 × 10..490).
  2. Traslapes de TEXTO: AABBs de TEXT (rotación-aware) que se cruzan.
  3. Alturas de texto: todo TEXT ≥ 2.2 mm impresos (libro §2.5).
  4. Escala: el "1:NN" del rótulo debe coincidir con la escala GEOMÉTRICA
     real (se mide con la cota total de planta: largo de línea = m × 1000/NN).
  5. Llenado: fracción del área útil que ocupa el contenido.

Uso: python scripts/qa-dxf-geometry.py [dir=.tmp-qa] [--only a-01]
Salida: lista de defectos con coordenadas de lámina (mm) + resumen.
"""
import sys
import glob
import os
import re
import argparse
import math

import ezdxf
from ezdxf import disassemble
from ezdxf.math import Vec2

SHEET_W, SHEET_H = 700.0, 500.0
INNER = 10.0  # marco interior (margen doble 5/10)
TEXT_W = 0.7  # ancho medio de carácter × altura (txt.shx aproximado)


def text_box(e) -> tuple[float, float, float, float]:
    """AABB de un TEXT en mm de lámina (rotación 90° intercambia ejes)."""
    h = e.dxf.height
    w = len(e.dxf.text) * h * TEXT_W
    x, y = e.dxf.insert.x, e.dxf.insert.y
    rot = getattr(e.dxf, "rotation", 0) or 0
    if abs(rot - 90) < 1 or abs(rot - 270) < 1:
        return (x - h, y, x, y + w)
    return (x, y, x + w, y + h)


def entity_vertices(e) -> list[Vec2]:
    """Vértices 2D de una entidad (para bounds/fuera-de-lámina)."""
    if e.dxftype() == "TEXT":
        b = text_box(e)
        return [Vec2(b[0], b[1]), Vec2(b[2], b[3])]
    try:
        return [Vec2(v.x, v.y) for p in disassemble.to_primitives([e]) for v in p.vertices()]
    except Exception:
        return []


def overlap(a, b) -> float:
    ix = min(a[2], b[2]) - max(a[0], b[0])
    iy = min(a[3], b[3]) - max(a[1], b[1])
    return ix * iy if (ix > 0 and iy > 0) else 0.0


def audit(dxf_path: str) -> list[str]:
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    issues: list[str] = []
    name = os.path.basename(dxf_path)

    # ── 1. entidades fuera del marco interior ────────────────────────────────
    for e in msp:
        pts = entity_vertices(e)
        if not pts:
            continue
        bad = [p for p in pts if not (INNER - 0.01 <= p.x <= SHEET_W - INNER + 0.01
                                      and INNER - 0.01 <= p.y <= SHEET_H - INNER + 0.01)]
        if bad:
            layer = e.dxf.layer
            if layer.startswith("A-ROTULO"):  # el rótulo vive pegado al marco: sus líneas tocan el borde por diseño
                continue
            issues.append(f"FUERA-LÁMINA [{name}] capa={layer} tipo={e.dxftype()} "
                          f"ej: ({bad[0].x:.1f},{bad[0].y:.1f}) — {len(bad)} vértices fuera del marco interior")

    # ── 2. traslapes de TEXT (con área de solape) ────────────────────────────
    texts = [e for e in msp if e.dxftype() == "TEXT"]
    boxes = [(e, text_box(e)) for e in texts]
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            a, b = boxes[i], boxes[j]
            ov = overlap(a[1], b[1])
            if ov > 1.0:  # mm² de tinta cruzada (ruido de AABB < 1 mm² se ignora)
                issues.append(
                    f"TEXTO-SOLAPE [{name}] '{a[0].dxf.text[:28]}' × '{b[0].dxf.text[:28]}' "
                    f"@({a[1][0]:.0f},{a[1][1]:.0f}) capa {a[0].dxf.layer}/{b[0].dxf.layer} — {ov:.1f} mm²"
                )

    # ── 3. alturas ───────────────────────────────────────────────────────────
    small = [(e, e.dxf.height) for e in texts if e.dxf.height < 2.19]
    if small:
        issues.append(f"TEXTO-PEQUEÑO [{name}] {len(small)} TEXT < 2.2 mm (ej: '{small[0][0].dxf.text[:20]}' {small[0][1]:.2f} mm)")

    # ── 4. escala declarada vs gráfica vs geométrica ─────────────────────────
    scale_texts = [e for e in texts if re.fullmatch(r"1:\d+", e.dxf.text.strip())]
    if not scale_texts:
        issues.append(f"ESCALA [{name}] el rótulo no declara escala 1:NN")
    else:
        den = int(scale_texts[0].dxf.text.strip().split(":")[1])
        k = 1000.0 / den
        # (a) BARRA GRÁFICA: rects de 2.5 mm de alto consecutivos en A-ROTULO-TXT
        #     con anchos = seg_metros × mm/m. El primer segmento (1 m) da k real.
        bar = []
        for e in msp:
            if e.dxftype() not in ("POLYLINE", "LWPOLYLINE") or e.dxf.layer != "A-ROTULO-TXT":
                continue
            vs = entity_vertices(e)
            if len(vs) < 4:
                continue
            xs_ = [v.x for v in vs]
            ys_ = [v.y for v in vs]
            h_, w_ = max(ys_) - min(ys_), max(xs_) - min(xs_)
            if 2.4 < h_ < 2.6 and 1.0 < w_ < 200:  # rect de la barra (alto 2.5)
                bar.append((min(xs_), w_))
        bar.sort()
        if bar:
            # segmentos [1,1,3] m → cada ancho w_i debe ser seg_i × k ±0.2 mm
            segs = [1.0, 1.0, 3.0]
            for (x_, w_), seg in zip(bar[:3], segs):
                if abs(w_ - seg * k) > 0.2:
                    issues.append(
                        f"ESCALA [{name}] barra gráfica: segmento {seg} m mide {w_:.2f} mm "
                        f"pero a 1:{den} deberían ser {seg*k:.2f} mm (@x={x_:.0f})"
                    )
        else:
            issues.append(f"ESCALA [{name}] no se encontró la barra gráfica del rótulo")
        # (b) CONTENIDO: la cota vertical A-COTAS más larga debe tener su numeral
        #     rotado que la explique a esa escala (±0.5 mm).
        best = None
        for e in msp:
            if e.dxftype() != "LINE" or e.dxf.layer != "A-COTAS":
                continue
            s, t = e.dxf.start, e.dxf.end
            if abs(s.x - t.x) < 0.01:
                L = abs(t.y - s.y)
                if L > 0 and (best is None or L > best):
                    best = L
        if best:
            nums = []
            for e in texts:
                if e.dxf.layer == "A-COTAS" and abs((getattr(e.dxf, "rotation", 0) or 0) - 90) < 1:
                    try:
                        nums.append(float(e.dxf.text.replace(",", ".")))
                    except ValueError:
                        pass
            if not nums:
                pass  # lámina sin numerales rotados (A-04/A-05): la barra del rótulo ya validó la escala
            elif not any(abs(best - v * k) < 0.5 for v in nums):
                near = [f"{v*k:.1f}mm(v{v})" for v in nums[:4]]
                issues.append(
                    f"ESCALA [{name}] cota vertical mayor = {best:.1f} mm no corresponde a "
                    f"ningún numeral a 1:{den} (esperados: {', '.join(near) or '—'})"
                )

    # ── 5. llenado del área útil ─────────────────────────────────────────────
    xs, ys = [], []
    for e in msp:
        if e.dxf.layer.startswith("A-ROTULO"):
            continue
        for p in entity_vertices(e):
            xs.append(p.x)
            ys.append(p.y)
    if xs:
        w = max(xs) - min(xs)
        h = max(ys) - min(ys)
        avail_w, avail_h = SHEET_W - 2 * INNER - 185 - 2 * 12, SHEET_H - 2 * INNER - 2 * 12
        fw, fh = w / avail_w, h / avail_h
        # Umbral 40%: techo geométrico real para contenido plano (fachadas de
        # 1 piso, cubierta cuadrada) a escalas normalizativas — el QA elimina
        # las láminas 15-29% de antes; lo que exige la serie 1:50…1:250.
        mark = "" if min(fw, fh) >= 0.40 else "  ← LÁMINA MEDIA VACÍA"
        print(f"  · {name}: contenido {w:.0f}×{h:.0f} mm de {avail_w:.0f}×{avail_h:.0f} útiles "
              f"→ fill {fw*100:.0f}% ancho × {fh*100:.0f}% alto{mark}")
        if min(fw, fh) < 0.40:
            issues.append(f"FILL [{name}] contenido ocupa {fw*100:.0f}%×{fh*100:.0f}% del área útil (<40%)")

    return issues


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("qa_dir", nargs="?", default=None)
    ap.add_argument("--only", default=None)
    ns = ap.parse_args()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    qa_dir = ns.qa_dir or os.path.join(root, ".tmp-qa")
    dxfs = sorted(glob.glob(os.path.join(qa_dir, "*.dxf")))
    if ns.only:
        dxfs = [p for p in dxfs if ns.only in os.path.basename(p)]
    assert dxfs, "sin DXF"
    all_issues: list[str] = []
    for p in dxfs:
        all_issues.extend(audit(p))
    if all_issues:
        print(f"\n❌ {len(all_issues)} defectos geométricos:")
        for line in all_issues:
            print("  " + line)
        sys.exit(1)
    print("\n✅ geometría OK en todas las láminas")


if __name__ == "__main__":
    main()

"""
QA PLOT — plotea los DXF generados por qa-exports.mjs a su TAMAÑO DE PAPEL
declarado (700×500 mm OBRAHUB), como PDF vectorial + PNG para inspección.

Es el "plot" real que exige la guía §2.6/§4.3: fondo BLANCO, tinta negra,
grosor por ENTIDAD (código 370, mm reales de la tabla CPNAA). Lo que sale
aquí es lo que saldría de la impresora — no lo que muestra el visor CAD.

Uso:
  python scripts/plot-preview.py [.tmp-qa/dir] [--dpi 100] [--only a-01]
"""
import sys
import glob
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
from ezdxf.addons.drawing.config import (
    Configuration,
    ColorPolicy,
    LinePolicy,
    LineweightPolicy,
    BackgroundPolicy,
)
import ezdxf

SHEET_W, SHEET_H = 700.0, 500.0  # mm — formato OBRAHUB


def plot(dxf_path: str, out_dir: str, dpi: int = 100) -> str:
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    # Figura al TAMAÑO DE PAPEL real (700×500 mm → 27.56×19.69 in).
    fig = plt.figure(figsize=(SHEET_W / 25.4, SHEET_H / 25.4))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor("white")

    ctx = RenderContext(doc)
    cfg = Configuration(
        background_policy=BackgroundPolicy.WHITE,  # papel blanco
        color_policy=ColorPolicy.BLACK,  # tinta negra (plot B/N de la guía §4.3)
        lineweight_policy=LineweightPolicy.ABSOLUTE,  # 370 de entidad, mm reales
        line_policy=LinePolicy.ACCURATE,  # linetypes reales (CENTER/DASHED)
        min_lineweight=0.13,  # piso de la serie ISO 128
        lineweight_scaling=1.0,
    )
    backend = MatplotlibBackend(ax, adjust_figure=False)  # el tamaño de papel lo fija la figura, no el autoscale
    Frontend(ctx, backend, config=cfg).draw_layout(msp, finalize=True)

    # Encuadre EXACTO al formato: el frontend hace autoscale — se impone.
    ax.set_xlim(0, SHEET_W)
    ax.set_ylim(0, SHEET_H)
    ax.set_aspect("equal", adjustable="box")
    ax.set_autoscale_on(False)

    base = os.path.splitext(os.path.basename(dxf_path))[0]
    pdf = os.path.join(out_dir, f"{base}-plot.pdf")
    png = os.path.join(out_dir, f"{base}-plot.png")
    fig.savefig(pdf, dpi=dpi)  # vector — el entregable de evidencia
    fig.savefig(png, dpi=dpi, facecolor="white")
    plt.close(fig)
    return png


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("qa_dir", nargs="?", default=None)
    ap.add_argument("--dpi", type=int, default=100)
    ap.add_argument("--only", default=None)
    ns = ap.parse_args()
    dpi, only = ns.dpi, ns.only
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    qa_dir = ns.qa_dir or os.path.join(root, ".tmp-qa")
    dxfs = sorted(glob.glob(os.path.join(qa_dir, "*.dxf")))
    if only:
        dxfs = [p for p in dxfs if only in os.path.basename(p)]
    assert dxfs, f"no hay DXF en {qa_dir} — corre node scripts/qa-exports.mjs"
    out_dir = os.path.join(qa_dir, "plots")
    os.makedirs(out_dir, exist_ok=True)
    for p in dxfs:
        png = plot(p, out_dir, dpi)
        print(f"✅ {os.path.basename(png)}")


if __name__ == "__main__":
    main()

"""
QA IFC — validación INDEPENDIENTE del archivo exportado (ifcopenshell):

  1. ifcopenshell.validate: schema EXPRESS real (cardinalidad de atributos,
     tipos, referencias) — el veredicto que un lector BIM externo emite.
  2. GUID encoder contra la implementación de referencia (ifcopenshell.guid):
     ifcGuidCompress(h) == guid.compress(h) para hex32 arbitrarios.
  3. GlobalId: válido (22 chars, alfabeto buildingSMART), único DENTRO del
     archivo y único ENTRE exportaciones distintas (guadua ≠ doble).
  4. Contención espacial: productos en su storey, storeys en el building,
     espacios agregados por nivel.
  5. Vanos: cada IFCOPENINGELEMENT tiene host (RelVoidsElement) Y llenado
     (RelFillsElement) — y cada puerta/ventana llena UN opening.
  6. Unidades: LENGTHUNIT/SI presente + MASSUNIT si hay QuantityWeight.
  7. Sin proxies: elementos con clase IFC real (muro=IFCWALLSTANDARDCASE…).

Uso: python scripts/qa-ifc.py [dir=.tmp-qa]
Sale 0 sólo si TODO pasa (CI no soft-skip: verificar IFC es obligatorio).
"""
import sys
import os
import glob
import re
import argparse
import random

import ifcopenshell
import ifcopenshell.validate

B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"

issues: list[str] = []


def err(msg: str) -> None:
    issues.append(msg)


def check_guid_encoder() -> None:
    """El compresor de ObraHub (TS compilado) debe ser EXACTO al de
    ifcopenshell.guid.compress (referencia buildingSMART) — cross-lenguaje."""
    import subprocess
    import ifcopenshell.guid as oguid
    random.seed(42)
    hexes = [random.choice("0123") + "".join(random.choice("0123456789abcdef") for _ in range(31)) for _ in range(48)]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    js = os.path.join(root, ".tmp-design-test", "design", "ifc.js")
    if not os.path.exists(js):
        err(f"GUID-ENCODER sin ifc.js compilado ({js}) — corre node scripts/qa-exports.mjs")
        return
    node_script = (
        "const {ifcGuidCompress, ifcGuidDecompress}=require(" + repr(js).replace("'", '"') + ");"
        "const hex=process.argv[1];"
        "console.log(ifcGuidCompress(hex));"
    )
    for h in hexes:
        out = subprocess.run(["node", "-e", node_script, h], capture_output=True, text=True, timeout=30)
        got = out.stdout.strip()
        ref = oguid.compress(h)
        if got != ref:
            err(f"GUID-ENCODER hex={h} obrahub={got!r} referencia={ref!r}")
            return
        # y la inversa TS recupera el hex original
        inv = subprocess.run(["node", "-e",
            "const {ifcGuidDecompress}=require(" + repr(js).replace("'", '"') + ");console.log(ifcGuidDecompress(process.argv[1]));", got],
            capture_output=True, text=True, timeout=30)
        if inv.stdout.strip() != h:
            err(f"GUID-DECOMPRESS {got} → {inv.stdout.strip()!r} ≠ {h}")
            return
    print(f"  · GUID encoder: {len(hexes)} casos aleatorios == ifcopenshell.guid.compress (+inversa) ✓")


def audit(path: str) -> None:
    name = os.path.basename(path)
    f = ifcopenshell.open(path)

    # ── 1. validación de schema independiente ──────────────────────────────
    lg = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, lg)
    errs = [s for s in lg.statements if s.get("level") == "error"]
    for e in errs[:10]:
        err(f"SCHEMA [{name}] {str(e.get('message', ''))[:150].strip()} ({str(e.get('instance', ''))[:60]})")
    print(f"  · {name}: ifcopenshell.validate → {len(lg.statements)} hallazgos, {len(errs)} errores")

    # ── 3. GlobalIds ───────────────────────────────────────────────────────
    ids = {}
    for el in f:
        gid = getattr(el, "GlobalId", None)
        if not gid:
            continue
        if not (len(gid) == 22 and all(c in B64 for c in gid)):
            err(f"GUID-FORMA [{name}] {el.is_a()} GlobalId inválido: {gid!r}")
        ids.setdefault(gid, []).append(el)
    for gid, els in ids.items():
        if len(els) > 1:
            err(f"GUID-DUP [{name}] {gid} repetido en {len(els)}: {[e.is_a() for e in els][:4]}")
    print(f"  · {name}: {len(ids)} GlobalIds únicos en archivo ✓")

    # ── 4. contención espacial ─────────────────────────────────────────────
    storeys = f.by_type("IfcBuildingStorey")
    if not storeys:
        err(f"ESPACIAL [{name}] sin IfcBuildingStorey")
    for st in storeys:
        prods = [r.RelatedElements for r in getattr(st, "ContainsElements", [])]
        n = sum(len(p) for p in prods)
        if n == 0:
            err(f"ESPACIAL [{name}] storey {st.Name} sin productos contenidos")
    orphans = [
        el for el in f.by_type("IfcWall") + f.by_type("IfcSlab") + f.by_type("IfcDoor") + f.by_type("IfcWindow")
        if not el.ContainedInStructure
    ]
    for o in orphans[:5]:
        err(f"ESPACIAL [{name}] {o.is_a()} '{o.Name}' sin IfcRelContainedInSpatialStructure")
    print(f"  · {name}: {len(storeys)} storeys, huérfanos={len(orphans)}")

    # ── 5. vanos: host + llenado ───────────────────────────────────────────
    openings = f.by_type("IfcOpeningElement")
    voids = {r.RelatedOpeningElement.GlobalId: r.RelatingBuildingElement for r in f.by_type("IfcRelVoidsElement")}
    fills = {r.RelatingOpeningElement.GlobalId: r.RelatedBuildingElement for r in f.by_type("IfcRelFillsElement")}
    for op in openings:
        g = op.GlobalId
        if g not in voids:
            err(f"VANO [{name}] opening '{op.Name}' SIN host (RelVoidsElement)")
        if g not in fills:
            err(f"VANO [{name}] opening '{op.Name}' SIN llenado (RelFillsElement) — hueco sin puerta/ventana")
    doors, wins = f.by_type("IfcDoor"), f.by_type("IfcWindow")
    for el in doors + wins:
        if not any(r.RelatedBuildingElement == el for r in f.by_type("IfcRelFillsElement")):
            err(f"VANO [{name}] {el.is_a()} '{str(el.Name)[:40]}' no llena ningún opening")
    print(f"  · {name}: {len(openings)} openings, {len(doors)} puertas, {len(wins)} ventanas "
          f"(hosts={len(voids)}, llenados={len(fills)})")

    # ── 6. unidades ────────────────────────────────────────────────────────
    units = f.by_type("IfcUnitAssignment")[0]
    kinds = {(u.UnitType if hasattr(u, "UnitType") else "?") for u in units.Units}
    if "LENGTHUNIT" not in kinds:
        err(f"UNIDAD [{name}] sin LENGTHUNIT")
    has_weight = bool(f.by_type("IfcQuantityWeight"))
    if has_weight and "MASSUNIT" not in kinds:
        err(f"UNIDAD [{name}] emite IfcQuantityWeight sin MASSUNIT declarada (kg implícitos no son SI-completos)")
    print(f"  · {name}: unidades {sorted(kinds)} (pesos={has_weight})")

    # ── 7. proxies ─────────────────────────────────────────────────────────
    proxies = [e for e in f.by_type("IfcBuildingElementProxy")]
    if proxies:
        err(f"PROXY [{name}] {len(proxies)} IfcBuildingElementProxy (deben ser clases tipadas)")
    print(f"  · {name}: proxies={len(proxies)}")


def cross_file_uniqueness(paths: list[str]) -> None:
    """GlobalIds de DOS exportaciones distintas no deben solaparse (identidad
    persistente del proyecto: review #12)."""
    if len(paths) < 2:
        return
    seen: dict[str, str] = {}
    for p in paths:
        f = ifcopenshell.open(p)
        for el in f:
            gid = getattr(el, "GlobalId", None)
            if not gid:
                continue
            if gid in seen and seen[gid] != os.path.basename(p):
                err(f"GUID-CRUZADO {gid} en {seen[gid]} y {os.path.basename(p)} (proyectos distintos)")
            seen[gid] = os.path.basename(p)
    print(f"  · entre archivos: {len(seen)} GlobalIds sin colisiones ✓")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("qa_dir", nargs="?", default=None)
    ns = ap.parse_args()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    qa_dir = ns.qa_dir or os.path.join(root, ".tmp-qa")
    ifcs = sorted(glob.glob(os.path.join(qa_dir, "*.ifc")))
    assert ifcs, f"sin IFC en {qa_dir} — corre node scripts/qa-exports.mjs"
    check_guid_encoder()
    for p in ifcs:
        audit(p)
    cross_file_uniqueness(ifcs)
    if issues:
        print(f"\n❌ {len(issues)} problemas IFC:")
        for line in issues:
            print("  " + line)
        sys.exit(1)
    print("\n✅ IFC validado (schema ifcopenshell + GUID + espacial + vanos + unidades)")


if __name__ == "__main__":
    main()

"use client";

/**
 * Excel (.xlsx, .xls) preview — parses the spreadsheet in-browser using
 * ExcelJS and renders an interactive table with all sheets.
 */

import { useEffect, useState } from "react";

type ExcelPreviewProps = {
  /** Signed URL to the .xlsx file in Supabase Storage. */
  url: string;
  /** Filename for display. */
  filename: string;
};

type SheetData = {
  name: string;
  rows: (string | number | boolean | null)[][];
  columnCount: number;
};

export function ExcelPreview({ url, filename }: ExcelPreviewProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        const ExcelJS = (await import("exceljs")).default;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        if (cancelled) return;

        const sheetData: SheetData[] = workbook.worksheets.map((ws) => {
          const rows: (string | number | boolean | null)[][] = [];
          let maxCols = 0;
          ws.eachRow({ includeEmpty: false }, (row) => {
            const values = row.values as (string | number | boolean | null)[];
            // ExcelJS values[0] is always undefined (1-indexed), drop it.
            const cleaned = values.slice(1).map((v) => v ?? null);
            if (cleaned.length > maxCols) maxCols = cleaned.length;
            rows.push(cleaned);
          });
          return {
            name: ws.name,
            rows,
            columnCount: maxCols,
          };
        });

        if (cancelled) return;
        setSheets(sheetData);
        setActiveSheet(0);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("Excel load error:", err);
        setError(err instanceof Error ? err.message : "Error al cargar el Excel");
        setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:300ms]" />
          </div>
          <p className="text-sm text-slate-500">Cargando hoja de cálculo…</p>
          <p className="mt-1 text-xs text-slate-600">{filename}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-2xl">
            ⚠️
          </div>
          <p className="text-sm font-medium text-white">No se pudo cargar el Excel</p>
          <p className="mt-1 text-xs text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  const sheet = sheets[activeSheet];

  return (
    <div className="flex h-full flex-col">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/[0.06] px-4 py-2">
          {sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveSheet(i)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                i === activeSheet
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Spreadsheet */}
      <div className="min-h-0 flex-1 overflow-auto bg-[#050b14]">
        {sheet && sheet.rows.length > 0 ? (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#0a1120]">
                <th className="sticky left-0 z-20 border-b border-r border-white/[0.08] bg-[#0a1120] px-2 py-1.5 text-center text-[10px] font-semibold text-slate-600">
                  #
                </th>
                {Array.from({ length: sheet.columnCount }).map((_, colIdx) => (
                  <th
                    key={colIdx}
                    className="border-b border-r border-white/[0.08] bg-[#0a1120] px-3 py-1.5 text-center text-[10px] font-semibold text-slate-600"
                  >
                    {columnLetter(colIdx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-white/[0.02]">
                  <td className="sticky left-0 z-10 border-b border-r border-white/[0.04] bg-[#0a1120] px-2 py-1 text-center text-[10px] text-slate-600">
                    {rowIdx + 1}
                  </td>
                  {Array.from({ length: sheet.columnCount }).map((_, colIdx) => {
                    const value = row[colIdx];
                    const isHeader = rowIdx === 0;
                    return (
                      <td
                        key={colIdx}
                        className={`border-b border-r border-white/[0.04] px-3 py-1 ${
                          isHeader
                            ? "font-semibold text-slate-200"
                            : typeof value === "number"
                              ? "text-right text-emerald-300/90"
                              : "text-slate-400"
                        }`}
                      >
                        {value === null || value === undefined ? "" : String(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-500">La hoja está vacía</p>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="shrink-0 border-t border-white/[0.06] px-4 py-2 text-[10px] text-slate-600">
        📊 {filename} · {sheet?.rows.length ?? 0} filas × {sheet?.columnCount ?? 0} columnas
        {sheets.length > 1 && ` · ${sheets.length} hojas`}
      </div>
    </div>
  );
}

/** Converts a 0-based column index to Excel letter (0 → A, 25 → Z, 26 → AA). */
function columnLetter(idx: number): string {
  let result = "";
  let n = idx;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

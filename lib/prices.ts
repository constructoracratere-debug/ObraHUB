import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for the construction price database (Costos y Presupuestos).
 * Prices are curated by admins; all authenticated users can read them.
 */

export type PriceCategory = "material" | "labor" | "equipment";

export type PriceItem = {
  id: string;
  country: string;
  category: PriceCategory;
  code: string | null;
  name: string;
  unit: string;
  priceCop: number;
  source: string;
  updatedAt: string;
};

function toPriceItem(row: {
  id: string;
  country: string;
  category: PriceCategory;
  code: string | null;
  name: string;
  unit: string;
  price_cop: number;
  source: string;
  updated_at: string;
}): PriceItem {
  return {
    id: row.id,
    country: row.country,
    category: row.category,
    code: row.code,
    name: row.name,
    unit: row.unit,
    priceCop: Number(row.price_cop),
    source: row.source,
    updatedAt: row.updated_at,
  };
}

/** Lists all price items for a country (optionally filtered by category). */
export async function listPriceItems(
  supabase: SupabaseClient,
  country = "colombia",
  category?: PriceCategory,
): Promise<PriceItem[]> {
  let query = supabase
    .from("price_items")
    .select("id, country, category, code, name, unit, price_cop, source, updated_at")
    .eq("country", country)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toPriceItem);
}

/**
 * Formats a price as Colombian pesos.
 */
export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Builds a compact text list of prices for the AI prompt context. */
export function buildPriceContext(items: PriceItem[]): string {
  const lines = items.map(
    (i) =>
      `- [${i.category.toUpperCase()}] ${i.name} (${i.unit}): ${formatCOP(i.priceCop)}${i.code ? ` [cod: ${i.code}]` : ""} [fuente: ${i.source}]`,
  );
  return `BASE DE DATOS DE PRECIOS (COP - Pesos Colombianos):\n${lines.join("\n")}`;
}

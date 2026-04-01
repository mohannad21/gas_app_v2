import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import {
  PriceSetting,
  PriceSettingSchema,
} from "@/types/domain";

import { api, parse, parseArray } from "./client";

// Prices
export async function listPriceSettings(): Promise<PriceSetting[]> {
  const { data } = await api.get("/prices");
  return parseArray(PriceSettingSchema, data).map((p) => ({
    ...p,
    selling_price: fromMinorUnits(p.selling_price),
    buying_price: p.buying_price != null ? fromMinorUnits(p.buying_price) : p.buying_price,
    selling_iron_price:
      p.selling_iron_price != null ? fromMinorUnits(p.selling_iron_price) : p.selling_iron_price,
    buying_iron_price:
      p.buying_iron_price != null ? fromMinorUnits(p.buying_iron_price) : p.buying_iron_price,
  }));
}

export async function savePriceSetting(payload: {
  gas_type: "12kg" | "48kg";
  selling_price: number;
  buying_price?: number;
  selling_iron_price?: number;
  buying_iron_price?: number;
  effective_from?: string;
}): Promise<PriceSetting> {
  const { data } = await api.post("/prices", {
    ...payload,
    selling_price: toMinorUnits(payload.selling_price),
    buying_price: toMinorUnits(payload.buying_price ?? 0),
    selling_iron_price: toMinorUnits(payload.selling_iron_price ?? 0),
    buying_iron_price: toMinorUnits(payload.buying_iron_price ?? 0),
  });
  const parsed = parse(PriceSettingSchema, data);
  return {
    ...parsed,
    selling_price: fromMinorUnits(parsed.selling_price),
    buying_price: parsed.buying_price != null ? fromMinorUnits(parsed.buying_price) : parsed.buying_price,
    selling_iron_price:
      parsed.selling_iron_price != null
        ? fromMinorUnits(parsed.selling_iron_price)
        : parsed.selling_iron_price,
    buying_iron_price:
      parsed.buying_iron_price != null
        ? fromMinorUnits(parsed.buying_iron_price)
        : parsed.buying_iron_price,
  };
}

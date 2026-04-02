import { z } from "zod";
import { GasTypeSchema } from "./common";

export const PriceSettingSchema = z
  .object({
    id: z.string(),
    gas_type: GasTypeSchema,
    selling_price: z.number(),
    buying_price: z.number().optional().nullable(),
    selling_iron_price: z.number().optional().nullable(),
    buying_iron_price: z.number().optional().nullable(),
    effective_from: z.string(),
    created_at: z.string().optional(),
  })
  .passthrough();
export type PriceSetting = z.infer<typeof PriceSettingSchema>;

import { GasType } from "@/types/domain";

export const GasColors: Record<GasType, string> = {
  "12kg": "#0a7ea4",
  "48kg": "#d97706",
};

export function gasColor(gas?: string): string {
  if (gas === "12kg" || gas === "48kg") {
    return GasColors[gas];
  }
  return "#475569";
}

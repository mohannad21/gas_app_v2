import { AppColors } from "./colors";
import { GasType } from "@/types/domain";

export const GasColors: Record<GasType, string> = {
  "12kg": AppColors.gas["12kg"],
  "48kg": AppColors.gas["48kg"],
};

export function gasColor(gas?: string): string {
  if (gas === "12kg" || gas === "48kg") {
    return GasColors[gas];
  }
  return AppColors.gas.fallback;
}


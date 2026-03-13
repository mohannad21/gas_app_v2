import { useMemo } from "react";

import { useCashAdjustments } from "@/hooks/useCash";
import { useInventoryAdjustments, useInventoryRefills } from "@/hooks/useInventory";
import { CashAdjustment, InventoryAdjustment, InventoryRefillSummary } from "@/types/domain";

export type InventoryActivityItem =
  | {
      kind: "refill";
      created_at: string;
      is_deleted: boolean;
      data: InventoryRefillSummary;
    }
  | {
      kind: "inventory_adjustment";
      created_at: string;
      is_deleted: boolean;
      data: InventoryAdjustment;
    }
  | {
      kind: "cash_adjustment";
      created_at: string;
      is_deleted: boolean;
      data: CashAdjustment;
    };

function toSafeTime(value?: string) {
  if (!value) return 0;
  const normalized = value.replace(/(\.\d{3})\d+/, "$1");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function useInventoryActivity(date: string, includeDeleted?: boolean) {
  const refillsQuery = useInventoryRefills(includeDeleted);
  const inventoryAdjustmentsQuery = useInventoryAdjustments(date, includeDeleted);
  const cashAdjustmentsQuery = useCashAdjustments(date, includeDeleted);

  const items = useMemo<InventoryActivityItem[]>(() => {
    const refills = (refillsQuery.data ?? []).filter((refill) => refill.date === date);
    const refillItems = refills.map((refill) => ({
      kind: "refill" as const,
      created_at: refill.effective_at,
      is_deleted: Boolean(refill.is_deleted),
      data: refill,
    }));

    const inventoryItems = (inventoryAdjustmentsQuery.data ?? []).map((adjustment) => ({
      kind: "inventory_adjustment" as const,
      created_at: adjustment.effective_at,
      is_deleted: Boolean(adjustment.is_deleted),
      data: adjustment,
    }));

    const cashItems = (cashAdjustmentsQuery.data ?? []).map((adjustment) => ({
      kind: "cash_adjustment" as const,
      created_at: adjustment.effective_at,
      is_deleted: Boolean(adjustment.is_deleted),
      data: adjustment,
    }));

    return [...refillItems, ...inventoryItems, ...cashItems].sort(
      (a, b) => toSafeTime(b.created_at) - toSafeTime(a.created_at)
    );
  }, [refillsQuery.data, inventoryAdjustmentsQuery.data, cashAdjustmentsQuery.data, date]);

  return {
    items,
    refillsQuery,
    inventoryAdjustmentsQuery,
    cashAdjustmentsQuery,
  };
}


import { useEffect, useRef, useState } from "react";
import {
  PriceInputs,
  createDefaultPriceInputs,
  gasTypes,
} from "@/components/PriceMatrix";
import { GasType, PriceSetting } from "@/types/domain";

export type PriceSaveStatusTone = "success" | "warning" | "error";

export function usePriceModal(priceSettingsData?: PriceSetting[]) {
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceInputs, setPriceInputs] = useState<PriceInputs>(() =>
    createDefaultPriceInputs()
  );
  const [lastSavedPrices, setLastSavedPrices] = useState<PriceInputs>(() =>
    createDefaultPriceInputs()
  );
  const [savingPrices, setSavingPrices] = useState(false);
  const [priceSaveStatus, setPriceSaveStatus] = useState<{
    tone: PriceSaveStatusTone;
    message: string;
  } | null>(null);

  const dirtyPriceCombosRef = useRef<Set<string>>(new Set());

  // Hydrate price inputs from server data when modal opens
  useEffect(() => {
    if (!priceModalOpen || !priceSettingsData) {
      return;
    }

    const latestByGas = priceSettingsData.reduce<Record<GasType, PriceSetting>>(
      (acc, entry) => {
        const existing = acc[entry.gas_type];
        if (
          !existing ||
          new Date(entry.effective_from).getTime() >
            new Date(existing.effective_from).getTime()
        ) {
          acc[entry.gas_type] = entry;
        }
        return acc;
      },
      {} as Record<GasType, PriceSetting>
    );

    setLastSavedPrices((prev) => {
      const nextSaved = createDefaultPriceInputs();
      gasTypes.forEach((gas) => {
        const combo = latestByGas[gas];
        if (combo) {
          nextSaved[gas] = {
            selling: combo.selling_price.toString(),
            buying: combo.buying_price?.toString() ?? "",
            selling_iron: combo.selling_iron_price?.toString() ?? "",
            buying_iron: combo.buying_iron_price?.toString() ?? "",
          };
        } else {
          nextSaved[gas] = prev[gas] ?? {
            selling: "",
            buying: "",
            selling_iron: "",
            buying_iron: "",
          };
        }
      });
      return nextSaved;
    });

    setPriceInputs((prev) => {
      const dirtyCombos = dirtyPriceCombosRef.current;
      const next = createDefaultPriceInputs();
      gasTypes.forEach((gas) => {
        const combo = latestByGas[gas];
        const comboKey = gas;
        const previousValue = prev[gas] ?? {
          selling: "",
          buying: "",
          selling_iron: "",
          buying_iron: "",
        };
        if (dirtyCombos.has(comboKey)) {
          next[gas] = { ...previousValue };
        } else if (combo) {
          next[gas] = {
            selling: combo.selling_price.toString(),
            buying: combo.buying_price?.toString() ?? "",
            selling_iron: combo.selling_iron_price?.toString() ?? "",
            buying_iron: combo.buying_iron_price?.toString() ?? "",
          };
        } else {
          next[gas] = { ...previousValue };
        }
      });
      return next;
    });
  }, [priceModalOpen, priceSettingsData]);

  // Clear dirty combos and reset status on modal close
  useEffect(() => {
    if (!priceModalOpen) {
      dirtyPriceCombosRef.current.clear();
      setPriceSaveStatus(null);
    }
  }, [priceModalOpen]);

  return {
    priceModalOpen,
    setPriceModalOpen,
    priceInputs,
    setPriceInputs,
    lastSavedPrices,
    setLastSavedPrices,
    savingPrices,
    setSavingPrices,
    priceSaveStatus,
    setPriceSaveStatus,
    dirtyPriceCombosRef,
  };
}

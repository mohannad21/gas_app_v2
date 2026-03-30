import { useState } from "react";

export function useOrderPriceOverride() {
  const [manualPrice, setManualPrice] = useState(false);
  const [gasPriceInput, setGasPriceInput] = useState("");
  const [gasPriceDirty, setGasPriceDirty] = useState(false);
  const [ironPriceInput, setIronPriceInput] = useState("");
  const [ironPriceDirty, setIronPriceDirty] = useState(false);
  const [paidDirty, setPaidDirty] = useState(false);

  // Reset all price override flags
  const resetPriceOverrides = () => {
    setManualPrice(false);
    setGasPriceDirty(false);
    setIronPriceDirty(false);
    setPaidDirty(false);
  };

  return {
    manualPrice,
    setManualPrice,
    gasPriceInput,
    setGasPriceInput,
    gasPriceDirty,
    setGasPriceDirty,
    ironPriceInput,
    setIronPriceInput,
    ironPriceDirty,
    setIronPriceDirty,
    paidDirty,
    setPaidDirty,
    resetPriceOverrides,
  };
}

import type { PriceCategoryColorKey } from "./colors";

export type PriceFormKey =
  | "sell12"
  | "sell48"
  | "buy12"
  | "buy48"
  | "buyIron12"
  | "buyIron48"
  | "companyIron12"
  | "companyIron48"
  | "sellIron12"
  | "sellIron48";

export type PriceFormValues = Record<PriceFormKey, number>;

export type PriceFamilyKey = "gas" | "iron";

export type PriceSectionKey =
  | "gasBuyFromCompany"
  | "gasSellToCustomer"
  | "ironBuyFromCustomer"
  | "ironBuyFromCompany"
  | "ironSellToCustomer";

export type PriceStepperPresetKey = "sell" | "buy";

export const DEFAULT_PRICE_FORM_VALUES: PriceFormValues = {
  sell12: 0,
  sell48: 0,
  buy12: 0,
  buy48: 0,
  buyIron12: 0,
  buyIron48: 0,
  companyIron12: 0,
  companyIron48: 0,
  sellIron12: 0,
  sellIron48: 0,
};

export const PRICE_FAMILY_TABS = [
  { key: "gas", label: "Gas" },
  { key: "iron", label: "Iron" },
] as const satisfies readonly { key: PriceFamilyKey; label: string }[];

export const PRICE_SECTION_TABS: Record<PriceFamilyKey, readonly PriceSectionKey[]> = {
  gas: ["gasBuyFromCompany", "gasSellToCustomer"],
  iron: ["ironBuyFromCustomer", "ironBuyFromCompany", "ironSellToCustomer"],
};

export const PRICE_SECTIONS = {
  gasBuyFromCompany: {
    family: "gas",
    label: "Buy from Company",
    title: "Gas > Buy from Company",
    legacyTitle: "Gas Buying Prices",
    leftKey: "buy12",
    rightKey: "buy48",
    stepperPreset: "buy",
    colorKey: "gasBuyFromCompany",
  },
  gasSellToCustomer: {
    family: "gas",
    label: "Sell to Customer",
    title: "Gas > Sell to Customer",
    legacyTitle: "Gas Selling Prices",
    leftKey: "sell12",
    rightKey: "sell48",
    stepperPreset: "sell",
    colorKey: "gasSellToCustomer",
  },
  ironBuyFromCustomer: {
    family: "iron",
    label: "Buy from Customer",
    title: "Iron > Buy from Customer",
    legacyTitle: "Iron Buy - Customer",
    leftKey: "buyIron12",
    rightKey: "buyIron48",
    stepperPreset: "sell",
    colorKey: "ironBuyFromCustomer",
  },
  ironBuyFromCompany: {
    family: "iron",
    label: "Buy from Company",
    title: "Iron > Buy from Company",
    legacyTitle: "Iron Buy - Company",
    leftKey: "companyIron12",
    rightKey: "companyIron48",
    stepperPreset: "buy",
    colorKey: "ironBuyFromCompany",
  },
  ironSellToCustomer: {
    family: "iron",
    label: "Sell to Customer",
    title: "Iron > Sell to Customer",
    legacyTitle: "Iron Sell - Customer",
    leftKey: "sellIron12",
    rightKey: "sellIron48",
    stepperPreset: "sell",
    colorKey: "ironSellToCustomer",
  },
} as const satisfies Record<
  PriceSectionKey,
  {
    family: PriceFamilyKey;
    label: string;
    title: string;
    legacyTitle: string;
    leftKey: PriceFormKey;
    rightKey: PriceFormKey;
    stepperPreset: PriceStepperPresetKey;
    colorKey: PriceCategoryColorKey;
  }
>;

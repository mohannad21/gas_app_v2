jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("@/hooks/useInventory", () => ({
  useCreateRefill: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useInitInventory: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useInventoryRefillDetails: () => ({ data: null }),
  useInventorySnapshot: () => ({ data: null }),
  useUpdateRefill: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({ data: null, isSuccess: false }),
}));

jest.mock("@/components/InlineWalletFundingPrompt", () => () => null);

import { sanitizeBuyCountInput } from "@/components/AddRefillModal";

describe("AddRefillModal buy quantity sanitizing", () => {
  it("does not cap buy-full quantities by empties", () => {
    expect(sanitizeBuyCountInput("8", 3, true)).toBe("8");
  });

  it("still caps non-buy quantities by available empties", () => {
    expect(sanitizeBuyCountInput("8", 3, false)).toBe("3");
  });
});

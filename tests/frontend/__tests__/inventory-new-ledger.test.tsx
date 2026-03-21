import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

let mockParams: Record<string, string> = { section: "ledger", tab: "inventory" };
const mockAdjustInventoryMutateAsync = jest.fn().mockResolvedValue({});
const mockUpdateInventoryAdjustmentMutateAsync = jest.fn().mockResolvedValue({});
const mockCreateCashAdjustmentMutateAsync = jest.fn().mockResolvedValue({});
const mockUpdateCashAdjustmentMutateAsync = jest.fn().mockResolvedValue({});
const mockCreateCompanyPaymentMutateAsync = jest.fn().mockResolvedValue({});

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock("@/components/AddRefillModal", () => ({
  RefillForm: () => null,
}));

jest.mock("@/components/InlineWalletFundingPrompt", () => () => null);

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: { company_money: 0, company_cyl_12: 0, company_cyl_48: 0 },
    isSuccess: true,
  }),
}));

jest.mock("@/hooks/useCompanyPayments", () => ({
  useCreateCompanyPayment: () => ({ mutateAsync: mockCreateCompanyPaymentMutateAsync }),
}));

jest.mock("@/hooks/useCash", () => ({
  useCashAdjustments: () => ({ data: [], isLoading: false, isError: false }),
  useCreateCashAdjustment: () => ({ mutateAsync: mockCreateCashAdjustmentMutateAsync }),
  useUpdateCashAdjustment: () => ({ mutateAsync: mockUpdateCashAdjustmentMutateAsync }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useAdjustInventory: () => ({ mutateAsync: mockAdjustInventoryMutateAsync }),
  useInventoryAdjustments: () => ({ data: [], isLoading: false, isError: false }),
  useInventoryLatest: () => ({
    data: { full12: 10, empty12: 3, full48: 6, empty48: 1 },
    isLoading: false,
  }),
  useInventoryRefillDetails: () => ({ data: null, isLoading: false }),
  useUpdateInventoryAdjustment: () => ({ mutateAsync: mockUpdateInventoryAdjustmentMutateAsync }),
}));

jest.mock("@/hooks/useReports", () => ({
  useDailyReportsV2: () => ({
    data: [{ cash_end: 250 }],
    isLoading: false,
    isError: false,
  }),
}));

import InventoryNewScreen from "@/app/inventory/new";

describe("InventoryNewScreen ledger adjustments", () => {
  beforeEach(() => {
    mockParams = { section: "ledger", tab: "inventory" };
    mockAdjustInventoryMutateAsync.mockClear();
    mockUpdateInventoryAdjustmentMutateAsync.mockClear();
    mockCreateCashAdjustmentMutateAsync.mockClear();
    mockUpdateCashAdjustmentMutateAsync.mockClear();
    mockCreateCompanyPaymentMutateAsync.mockClear();
  });

  it("opens inventory adjustment without crashing and saves a valid entry", async () => {
    const { getAllByText, getByPlaceholderText, getByText } = render(<InventoryNewScreen />);

    expect(getByText("Adjust Inventory")).toBeTruthy();
    fireEvent.press(getAllByText("+")[0]);
    fireEvent.changeText(getByPlaceholderText("count_correction"), "count_correction");
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(mockAdjustInventoryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          gas_type: "12kg",
          delta_full: 1,
          delta_empty: 0,
          reason: "count_correction",
        })
      );
    });
  });

  it("opens wallet adjustment without crashing and saves a valid entry", async () => {
    mockParams = { section: "ledger", tab: "cash" };
    const { getByPlaceholderText, getByText } = render(<InventoryNewScreen />);

    expect(getByText("Adjust Wallet")).toBeTruthy();
    fireEvent.press(getByText("+20"));
    fireEvent.changeText(getByPlaceholderText("Required"), "correction");
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(mockCreateCashAdjustmentMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          delta_cash: 20,
          reason: "correction",
        })
      );
    });
  });
});

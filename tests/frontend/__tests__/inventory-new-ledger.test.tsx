import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

let mockParams: Record<string, string> = { section: "ledger", tab: "inventory" };
const mockAdjustInventoryMutateAsync = jest.fn().mockResolvedValue({});
const mockUpdateInventoryAdjustmentMutateAsync = jest.fn().mockResolvedValue({});
const mockCreateCashAdjustmentMutateAsync = jest.fn().mockResolvedValue({});
const mockUpdateCashAdjustmentMutateAsync = jest.fn().mockResolvedValue({});
const mockCreateCompanyPaymentMutateAsync = jest.fn().mockResolvedValue({});
let mockAdjustInventoryPending = false;
let mockCreateCashAdjustmentPending = false;
const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterCanGoBack = jest.fn().mockReturnValue(false);

jest.mock("expo-router", () => ({
  router: {
    back: mockRouterBack,
    canGoBack: mockRouterCanGoBack,
    push: jest.fn(),
    replace: mockRouterReplace,
  },
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
  useCreateCashAdjustment: () => ({
    mutateAsync: mockCreateCashAdjustmentMutateAsync,
    isPending: mockCreateCashAdjustmentPending,
  }),
  useUpdateCashAdjustment: () => ({ mutateAsync: mockUpdateCashAdjustmentMutateAsync, isPending: false }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useAdjustInventory: () => ({ mutateAsync: mockAdjustInventoryMutateAsync, isPending: mockAdjustInventoryPending }),
  useInventoryAdjustments: () => ({ data: [], isLoading: false, isError: false }),
  useInventoryLatest: () => ({
    data: { full12: 10, empty12: 3, full48: 6, empty48: 1 },
    isLoading: false,
  }),
  useInventoryRefillDetails: () => ({ data: null, isLoading: false }),
  useUpdateInventoryAdjustment: () => ({ mutateAsync: mockUpdateInventoryAdjustmentMutateAsync, isPending: false }),
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
    mockAdjustInventoryPending = false;
    mockCreateCashAdjustmentPending = false;
    mockRouterBack.mockClear();
    mockRouterReplace.mockClear();
    mockRouterCanGoBack.mockReset();
    mockRouterCanGoBack.mockReturnValue(false);
  });

  it("opens inventory adjustment without crashing and saves a valid entry without reason", async () => {
    const { getAllByText, getByText } = render(<InventoryNewScreen />);

    expect(getByText("Adjust Inventory")).toBeTruthy();
    fireEvent.press(getByText("12kg"));
    fireEvent.press(getByText("48kg"));
    fireEvent.press(getAllByText("+")[0]);
    fireEvent.press(getAllByText("+")[2]);
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(mockAdjustInventoryMutateAsync).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          gas_type: "12kg",
          delta_full: 1,
          delta_empty: 0,
          reason: undefined,
        })
      );
    });
    expect(mockAdjustInventoryMutateAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        gas_type: "48kg",
        delta_full: 1,
        delta_empty: 0,
        reason: undefined,
      })
    );
    expect(mockAdjustInventoryMutateAsync).toHaveBeenCalledTimes(2);
    const firstPayload = mockAdjustInventoryMutateAsync.mock.calls[0][0];
    const secondPayload = mockAdjustInventoryMutateAsync.mock.calls[1][0];
    expect(firstPayload.group_id).toBeTruthy();
    expect(firstPayload.group_id).toBe(secondPayload.group_id);

  });

  it("opens wallet adjustment without crashing and saves a valid entry without reason", async () => {
    mockParams = { section: "ledger", tab: "cash" };
    const { getByText } = render(<InventoryNewScreen />);

    expect(getByText("Adjust Wallet")).toBeTruthy();
    fireEvent.press(getByText("Amount"));
    fireEvent.press(getByText("+20"));
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(mockCreateCashAdjustmentMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          delta_cash: 20,
          reason: undefined,
        })
      );
    });

  });

  it("disables inventory save actions while the inventory mutation is pending", () => {
    mockAdjustInventoryPending = true;
    const { getByText } = render(<InventoryNewScreen />);

    expect(getByText("Saving...")).toBeTruthy();
    fireEvent.press(getByText("Saving..."));
    expect(mockAdjustInventoryMutateAsync).not.toHaveBeenCalled();
  });

  it("disables wallet adjustment save actions while the cash mutation is pending", () => {
    mockParams = { section: "ledger", tab: "cash" };
    mockCreateCashAdjustmentPending = true;
    const { getByText } = render(<InventoryNewScreen />);

    expect(getByText("Saving...")).toBeTruthy();
    fireEvent.press(getByText("Saving..."));
    expect(mockCreateCashAdjustmentMutateAsync).not.toHaveBeenCalled();
  });
});

import React from "react";
import { Alert } from "react-native";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";

import AddChooserScreen from "@/app/(tabs)/add";

const mockSavePriceMutateAsync = jest.fn();
const mockPriceSettingsData = [
  {
    id: "price-12",
    gas_type: "12kg",
    selling_price: 100,
    buying_price: 80,
    selling_iron_price: 0,
    buying_iron_price: 0,
    effective_from: "2025-01-01T00:00:00Z",
  },
  {
    id: "price-48",
    gas_type: "48kg",
    selling_price: 200,
    buying_price: 160,
    selling_iron_price: 0,
    buying_iron_price: 0,
    effective_from: "2025-01-01T00:00:00Z",
  },
] as const;

jest.mock("@/components/PriceMatrix", () => ({
  gasTypes: ["12kg", "48kg"],
  createDefaultPriceInputs: () => ({
    "12kg": { selling: "", buying: "", selling_iron: "", buying_iron: "" },
    "48kg": { selling: "", buying: "", selling_iron: "", buying_iron: "" },
  }),
  PriceMatrixSection: ({
    gasType,
    onInputChange,
  }: {
    gasType: "12kg" | "48kg";
    onInputChange: (
      gas: "12kg" | "48kg",
      field: "selling" | "buying" | "selling_iron" | "buying_iron",
      value: string
    ) => void;
  }) => {
    const React = jest.requireActual("react");
    const { Pressable, Text, View } = jest.requireActual("react-native");
    return React.createElement(
      View,
      null,
      React.createElement(Text, null, gasType),
      React.createElement(
        Pressable,
        { onPress: () => onInputChange(gasType, "selling", gasType === "12kg" ? "101" : "201") },
        React.createElement(Text, null, `Change ${gasType}`)
      )
    );
  },
}));

jest.mock("@/hooks/useOrders", () => ({
  useOrders: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteOrder: () => ({ mutate: jest.fn() }),
}));

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCustomer: () => ({ mutate: jest.fn() }),
  useAllCustomerAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: { company_money: 0, company_cyl_12: 0, company_cyl_48: 0 },
    isSuccess: true,
    refetch: jest.fn(),
  }),
  useCompanyBalanceAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

jest.mock("@/hooks/useCollections", () => ({
  useCollections: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCollection: () => ({ mutateAsync: jest.fn() }),
  useUpdateCollection: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

jest.mock("@/hooks/useExpenses", () => ({
  useExpenses: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useCreateExpense: () => ({ mutateAsync: jest.fn() }),
  useDeleteExpense: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useBankDeposits", () => ({
  useBankDeposits: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useCreateBankDeposit: () => ({ mutateAsync: jest.fn() }),
  useDeleteBankDeposit: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useReports", () => ({
  useDailyReportDayV2: () => ({
    data: { date: "2025-01-01", events: [] },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useCreateRefill: () => ({ mutateAsync: jest.fn() }),
  useInitInventory: () => ({ mutateAsync: jest.fn() }),
  useInventoryAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useInventoryRefills: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useInventorySnapshot: () => ({ data: { full12: 10, empty12: 5, full48: 6, empty48: 3 } }),
  useDeleteRefill: () => ({ mutateAsync: jest.fn() }),
  useDeleteInventoryAdjustment: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCash", () => ({
  useCashAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCashAdjustment: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCompanyPayments", () => ({
  useCompanyPayments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCompanyPayment: () => ({ mutate: jest.fn() }),
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({
    data: mockPriceSettingsData,
    isLoading: false,
    error: null,
  }),
  useSavePriceSetting: () => ({ mutateAsync: mockSavePriceMutateAsync, isPending: false }),
}));

jest.mock("@/lib/addShortcut", () => ({
  consumeAddShortcut: () => null,
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ prices: "1" }),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("Add screen price save feedback", () => {
  beforeEach(() => {
    mockSavePriceMutateAsync.mockReset();
    mockSavePriceMutateAsync.mockImplementation(async (payload: { gas_type: string; selling_price: number }) => {
      if (payload.gas_type === "48kg") {
        throw new Error("save failed");
      }
      return {
        id: `saved-${payload.gas_type}`,
        gas_type: payload.gas_type,
        selling_price: payload.selling_price,
        buying_price: 80,
        selling_iron_price: 0,
        buying_iron_price: 0,
        effective_from: "2025-01-01T00:00:00Z",
      };
    });
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    cleanup();
  });

  it("shows partial-success feedback and keeps the modal open when some price rows fail", async () => {
    const view = render(<AddChooserScreen />);

    fireEvent.press(view.getByText("Change 12kg"));
    fireEvent.press(view.getByText("Change 48kg"));

    await act(async () => {
      fireEvent.press(view.getByText("Save prices"));
    });

    await waitFor(() => {
      expect(mockSavePriceMutateAsync).toHaveBeenCalledTimes(2);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Some prices saved",
      "Saved: 12kg. Failed: 48kg. Review the failed rows and try again."
    );
    expect(view.getByText("Adjust Prices")).toBeTruthy();
    expect(view.getByText("Saved: 12kg. Failed: 48kg. Review the failed rows and try again.")).toBeTruthy();
    view.unmount();
  });
});

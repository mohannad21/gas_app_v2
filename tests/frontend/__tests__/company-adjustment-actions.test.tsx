import React from "react";
import { render } from "@testing-library/react-native";
import { fireEvent } from "@testing-library/react-native";

import AddChooserScreen from "@/app/(tabs)/add";

jest.mock("@/lib/money", () => ({
  getCurrencySymbol: () => "$",
  formatDisplayMoney: (v: number) => String(v),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock("@/lib/addShortcut", () => ({ consumeAddShortcut: () => null }));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({ data: [], isLoading: false }),
}));

jest.mock("@/hooks/useBalancesSummary", () => ({
  useBalancesSummary: () => ({
    balanceSummary: null,
    companySummary: { give12: 0, receive12: 0, give48: 0, receive48: 0, payCash: 0, receiveCash: 0 },
    companyBalancesQuery: { data: null, refetch: jest.fn() },
    refetchCustomers: jest.fn(),
  }),
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({ data: null, isSuccess: false, refetch: jest.fn() }),
  useCompanyBalanceAdjustments: () => ({
    data: [
      {
        id: "adj1",
        happened_at: "2026-06-01T09:00:00",
        created_at: "2026-06-01T09:00:00",
        money_balance: 100,
        cylinder_balance_12: 0,
        cylinder_balance_48: 0,
        delta_money: 50,
        delta_cylinder_12: 0,
        delta_cylinder_48: 0,
        is_deleted: false,
      },
    ],
    isLoading: false,
    refetch: jest.fn(),
  }),
  useDeleteCompanyBalanceAdjustment: () => ({ mutateAsync: jest.fn() }),
  useUpdateCompanyBalanceAdjustment: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useOrders", () => ({
  useOrders: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteOrder: () => ({ mutate: jest.fn() }),
}));

jest.mock("@/hooks/useCollections", () => ({
  useCollections: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCollection: () => ({ mutateAsync: jest.fn() }),
  useUpdateCollection: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCustomer: () => ({ mutate: jest.fn() }),
  useDeleteCustomerAdjustment: () => ({ mutateAsync: jest.fn() }),
  useAllCustomerAdjustments: () => ({ data: [], isLoading: false, refetch: jest.fn() }),
  CUSTOMER_DELETE_BLOCKED_MESSAGE: "Cannot delete customer with active data.",
  isCustomerDeleteBlockedError: () => false,
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({ data: [], isLoading: false }),
  useSavePriceSetting: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/useReports", () => ({
  useDailyReportDayV2: () => ({
    data: { date: "2026-06-01", events: [] },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/hooks/useInventoryActivity", () => ({
  useInventoryActivity: () => ({
    items: [],
    refillsQuery: { refetch: jest.fn() },
    inventoryAdjustmentsQuery: { refetch: jest.fn() },
    cashAdjustmentsQuery: { refetch: jest.fn() },
  }),
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

jest.mock("@/hooks/useCompanyPayments", () => ({
  useCompanyPayments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCompanyPayment: () => ({ mutate: jest.fn() }),
  useCreateCompanyPayment: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useInventoryAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useInventoryRefills: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useInventoryLatest: () => ({ data: null }),
  useInventorySnapshot: () => ({ data: null }),
  useCreateRefill: () => ({ mutateAsync: jest.fn() }),
  useInitInventory: () => ({ mutateAsync: jest.fn() }),
  useDeleteRefill: () => ({ mutateAsync: jest.fn() }),
  useDeleteInventoryAdjustment: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCash", () => ({
  useCashAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCashAdjustment: () => ({ mutateAsync: jest.fn() }),
  useCreateCashAdjustment: () => ({ mutateAsync: jest.fn() }),
}));

describe("Add Entry — company adjustment card actions", () => {
  it("shows Delete but not Edit on a company balance adjustment card", () => {
    const { getByText, getByLabelText, queryByLabelText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Company\nActivities"));
    fireEvent.press(getByText("Adjustment"));

    expect(getByLabelText("Delete")).toBeTruthy();
    expect(queryByLabelText("Edit")).toBeNull();
  });
});

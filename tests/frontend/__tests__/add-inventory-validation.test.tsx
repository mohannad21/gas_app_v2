import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import AddChooserScreen from "@/app/(tabs)/add";

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

jest.mock("@/hooks/useInventoryActivity", () => ({
  useInventoryActivity: () => ({
    items: [],
    refillsQuery: { refetch: jest.fn() },
    inventoryAdjustmentsQuery: { refetch: jest.fn() },
    cashAdjustmentsQuery: { refetch: jest.fn() },
  }),
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
  usePriceSettings: () => ({ data: [], isLoading: false, error: null }),
  useSavePriceSetting: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/lib/addShortcut", () => ({
  consumeAddShortcut: () => null,
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

const { router } = jest.requireMock("expo-router") as {
  router: { push: jest.Mock; replace: jest.Mock };
};

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("Add screen navigation", () => {
  beforeEach(() => {
    router.push.mockReset();
  });

  it("keeps customer activity button route unchanged", () => {
    const { getByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("+ New Customer Activity"));

    expect(router.push).toHaveBeenCalledWith("/orders/new");
  });

  it("keeps company activity button route unchanged", () => {
    const { getByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Company\nActivities"));
    fireEvent.press(getByText("+ New Company Activity"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/inventory/new",
      params: { section: "company", tab: "refill" },
    });
  });

  it("keeps expense button route unchanged", () => {
    const { getByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Expenses"));
    fireEvent.press(getByText("+ Add Expense"));

    expect(router.push).toHaveBeenCalledWith("/expenses/new");
  });

  it("keeps ledger adjustment button route unchanged", () => {
    const { getByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Ledger\nAdjustments"));
    fireEvent.press(getByText("+ New Ledger Adjustment"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/inventory/new",
      params: { section: "ledger", tab: "inventory" },
    });
  });

  it("uses wallet wording for ledger adjustment filters", () => {
    const { getByText, queryByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Ledger\nAdjustments"));

    expect(getByText("Wallet Adjustment")).toBeTruthy();
    expect(queryByText("Cash Adjustment")).toBeNull();
  });
});

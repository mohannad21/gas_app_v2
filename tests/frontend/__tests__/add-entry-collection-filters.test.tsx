import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import AddChooserScreen from "@/app/(tabs)/add";

jest.mock("@/lib/money", () => ({
  getCurrencySymbol: () => "$",
  formatDisplayMoney: (value: number) => String(value),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, name);
  },
}));

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
    companyBalancesQuery: { data: null, refetch: jest.fn(), isSuccess: true },
    refetchCustomers: jest.fn(),
  }),
}));

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({
    data: [
      { id: "customer-a", name: "Customer A", note: "", created_at: "2026-05-14T08:00:00Z" },
      { id: "customer-b", name: "Customer B", note: "", created_at: "2026-05-14T08:30:00Z" },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useDeleteCustomer: () => ({ mutate: jest.fn() }),
  useAllCustomerAdjustments: () => ({ data: [], isLoading: false, refetch: jest.fn() }),
  useDeleteCustomerAdjustment: () => ({ mutateAsync: jest.fn() }),
  CUSTOMER_DELETE_BLOCKED_MESSAGE: "Cannot delete customer with active data.",
  isCustomerDeleteBlockedError: () => false,
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalanceAdjustments: () => ({ data: [], isLoading: false, refetch: jest.fn() }),
  useDeleteCompanyBalanceAdjustment: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useOrders", () => ({
  useOrders: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteOrder: () => ({ mutate: jest.fn() }),
}));

const mockDeleteCollection = jest.fn();

jest.mock("@/hooks/useCollections", () => ({
  useCollections: () => ({
    data: [
      {
        id: "payment-1",
        customer_id: "customer-a",
        action_type: "payment",
        amount_money: 70,
        live_debt_cash: 30,
        live_debt_cylinders_12: 0,
        live_debt_cylinders_48: 0,
        effective_at: "2026-05-14T09:00:00Z",
        created_at: "2026-05-14T09:00:00Z",
        is_deleted: false,
      },
      {
        id: "payout-1",
        customer_id: "customer-a",
        action_type: "payout",
        amount_money: 40,
        live_debt_cash: -60,
        live_debt_cylinders_12: 0,
        live_debt_cylinders_48: 0,
        effective_at: "2026-05-14T10:00:00Z",
        created_at: "2026-05-14T10:00:00Z",
        is_deleted: false,
      },
      {
        id: "return-mixed",
        customer_id: "customer-a",
        action_type: "return",
        qty_12kg: 2,
        qty_48kg: 1,
        live_debt_cash: 0,
        live_debt_cylinders_12: 1,
        live_debt_cylinders_48: 1,
        effective_at: "2026-05-14T11:00:00Z",
        created_at: "2026-05-14T11:00:00Z",
        is_deleted: false,
      },
      {
        id: "return-48",
        customer_id: "customer-b",
        action_type: "return",
        qty_12kg: 0,
        qty_48kg: 1,
        live_debt_cash: 0,
        live_debt_cylinders_12: 0,
        live_debt_cylinders_48: 1,
        effective_at: "2026-05-14T12:00:00Z",
        created_at: "2026-05-14T12:00:00Z",
        is_deleted: false,
      },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useDeleteCollection: () => ({ mutateAsync: mockDeleteCollection }),
  useUpdateCollection: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({ data: [], isLoading: false }),
  useSavePriceSetting: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/useReports", () => ({
  useDailyReportDayV2: () => ({
    data: { date: "2026-05-14", events: [] },
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

describe("Add Entry collection filters", () => {
  it("renders payment, payout, and grouped return rows from the collection pipeline", () => {
    const { getByText } = render(<AddChooserScreen />);

    expect(getByText("Payment 70")).toBeTruthy();
    expect(getByText("Payout 40")).toBeTruthy();
    expect(getByText("Returned 2x12kg | 1x48kg empties")).toBeTruthy();
    expect(getByText("Returned 1x48kg empties")).toBeTruthy();
  });

  it("filters payment rows under the Customer paid activity filter", () => {
    const { getByText, getAllByText, queryByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("filter-outline"));
    const customerPaidOptions = getAllByText("Customer paid");
    fireEvent.press(customerPaidOptions[0]);

    expect(getByText("Payment 70")).toBeTruthy();
    expect(queryByText("Payout 40")).toBeNull();
    expect(queryByText("Returned 2x12kg | 1x48kg empties")).toBeNull();
  });

  it("filters payout rows under the Paid customer activity filter", () => {
    const { getByText, getAllByText, queryByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("filter-outline"));
    const payoutOptions = getAllByText("Paid customer");
    fireEvent.press(payoutOptions[0]);

    expect(getByText("Payout 40")).toBeTruthy();
    expect(queryByText("Payment 70")).toBeNull();
    expect(queryByText("Returned 2x12kg | 1x48kg empties")).toBeNull();
  });

  it("filters returned empties by gas type and keeps mixed rows in both matching groups", () => {
    const { getByText, getAllByText, queryByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("filter-outline"));
    const returnOptions = getAllByText("Returned empties");
    fireEvent.press(returnOptions[0]);
    const twelveOptions = getAllByText("12kg");
    fireEvent.press(twelveOptions[0]);

    expect(getByText("Returned 2x12kg | 1x48kg empties")).toBeTruthy();
    expect(queryByText("Returned 1x48kg empties")).toBeNull();

    const fortyEightOptions = getAllByText("48kg");
    fireEvent.press(fortyEightOptions[0]);

    expect(getByText("Returned 2x12kg | 1x48kg empties")).toBeTruthy();
    expect(getByText("Returned 1x48kg empties")).toBeTruthy();
  });
});

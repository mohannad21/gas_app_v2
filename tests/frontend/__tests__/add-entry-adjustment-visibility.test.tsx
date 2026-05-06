import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

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
    companyBalancesQuery: { data: null, refetch: jest.fn(), isSuccess: true },
    refetchCustomers: jest.fn(),
  }),
}));

const mockCustomers = jest.fn();
const mockCustomerAdjustments = jest.fn();
const mockCompanyAdjustments = jest.fn();

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: (...args: unknown[]) => mockCustomers(...args),
  useDeleteCustomer: () => ({ mutate: jest.fn() }),
  useAllCustomerAdjustments: (...args: unknown[]) => mockCustomerAdjustments(...args),
  useDeleteCustomerAdjustment: () => ({ mutateAsync: jest.fn() }),
  CUSTOMER_DELETE_BLOCKED_MESSAGE: "Cannot delete customer with active data.",
  isCustomerDeleteBlockedError: () => false,
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalanceAdjustments: (...args: unknown[]) => mockCompanyAdjustments(...args),
  useDeleteCompanyBalanceAdjustment: () => ({ mutateAsync: jest.fn() }),
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

function emptyCustomersData() {
  return {
    data: [
      { id: "cust-active", name: "Active Customer", created_at: "2026-06-01T09:00:00Z" },
      { id: "cust-deleted", name: "Deleted Customer", created_at: "2026-06-01T08:00:00Z" },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  };
}

beforeEach(() => {
  mockCustomers.mockReturnValue(emptyCustomersData());
  mockCustomerAdjustments.mockReturnValue({ data: [], isLoading: false, refetch: jest.fn() });
  mockCompanyAdjustments.mockReturnValue({ data: [], isLoading: false, refetch: jest.fn() });
});

describe("Add Entry adjustment visibility", () => {
  it("shows active customer adjustment and hides deleted customer adjustment", () => {
    mockCustomerAdjustments.mockReturnValue({
      data: [
        {
          id: "adj-active",
          customer_id: "cust-active",
          amount_money: 50,
          count_12kg: 0,
          count_48kg: 0,
          reason: "active customer adjustment",
          effective_at: "2026-06-01T09:00:00Z",
          created_at: "2026-06-01T09:00:00Z",
          is_deleted: false,
        },
        {
          id: "adj-deleted",
          customer_id: "cust-deleted",
          amount_money: 99,
          count_12kg: 0,
          count_48kg: 0,
          reason: "deleted customer adjustment",
          effective_at: "2026-06-01T10:00:00Z",
          created_at: "2026-06-01T10:00:00Z",
          is_deleted: true,
        },
      ],
      isLoading: false,
      refetch: jest.fn(),
    });

    const { getByText, queryByText } = render(<AddChooserScreen />);

    expect(getByText("Active Customer")).toBeTruthy();
    expect(queryByText("Deleted Customer")).toBeNull();
  });

  it("shows active company adjustment and hides deleted company adjustment", () => {
    mockCompanyAdjustments.mockReturnValue({
      data: [
        {
          id: "comp-active",
          happened_at: "2026-06-01T09:00:00Z",
          created_at: "2026-06-01T09:00:00Z",
          money_balance: 150,
          cylinder_balance_12: 0,
          cylinder_balance_48: 0,
          note: "active company adjustment",
          is_deleted: false,
        },
        {
          id: "comp-deleted",
          happened_at: "2026-06-01T10:00:00Z",
          created_at: "2026-06-01T10:00:00Z",
          money_balance: 999,
          cylinder_balance_12: 0,
          cylinder_balance_48: 0,
          note: "deleted company adjustment",
          is_deleted: true,
        },
      ],
      isLoading: false,
      refetch: jest.fn(),
    });

    const { getByText, queryByText } = render(<AddChooserScreen />);
    fireEvent.press(getByText("Company\nActivities"));

    expect(getByText("Money balance: unchanged — debts 150 $ (on distributor)")).toBeTruthy();
    expect(queryByText("Money balance: unchanged — debts 999 $ (on distributor)")).toBeNull();
  });
});

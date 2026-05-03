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
  useCompanyBalanceAdjustments: () => ({ data: [], isLoading: false, refetch: jest.fn() }),
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

// Separate mock factories so individual tests can override per-section data
const mockExpenses = jest.fn();
const mockBankDeposits = jest.fn();
const mockCompanyPayments = jest.fn();
const mockInventoryAdjustments = jest.fn();
const mockCashAdjustments = jest.fn();
const mockInventoryRefills = jest.fn();

jest.mock("@/hooks/useExpenses", () => ({
  useExpenses: (...args: unknown[]) => mockExpenses(...args),
  useCreateExpense: () => ({ mutateAsync: jest.fn() }),
  useDeleteExpense: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useBankDeposits", () => ({
  useBankDeposits: (...args: unknown[]) => mockBankDeposits(...args),
  useCreateBankDeposit: () => ({ mutateAsync: jest.fn() }),
  useDeleteBankDeposit: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCompanyPayments", () => ({
  useCompanyPayments: (...args: unknown[]) => mockCompanyPayments(...args),
  useDeleteCompanyPayment: () => ({ mutate: jest.fn() }),
  useCreateCompanyPayment: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useInventoryAdjustments: (...args: unknown[]) => mockInventoryAdjustments(...args),
  useInventoryRefills: (...args: unknown[]) => mockInventoryRefills(...args),
  useInventoryLatest: () => ({ data: null }),
  useInventorySnapshot: () => ({ data: null }),
  useCreateRefill: () => ({ mutateAsync: jest.fn() }),
  useInitInventory: () => ({ mutateAsync: jest.fn() }),
  useDeleteRefill: () => ({ mutateAsync: jest.fn() }),
  useDeleteInventoryAdjustment: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCash", () => ({
  useCashAdjustments: (...args: unknown[]) => mockCashAdjustments(...args),
  useDeleteCashAdjustment: () => ({ mutateAsync: jest.fn() }),
  useCreateCashAdjustment: () => ({ mutateAsync: jest.fn() }),
}));

function emptyData() {
  return { data: [], isLoading: false, error: null, refetch: jest.fn() };
}

beforeEach(() => {
  mockExpenses.mockReturnValue(emptyData());
  mockBankDeposits.mockReturnValue(emptyData());
  mockCompanyPayments.mockReturnValue(emptyData());
  mockInventoryAdjustments.mockReturnValue(emptyData());
  mockCashAdjustments.mockReturnValue(emptyData());
  mockInventoryRefills.mockReturnValue(emptyData());
});

describe("Add Entry — deleted cards are hidden", () => {
  it("deleted expense does not appear; active expense does", () => {
    mockExpenses.mockReturnValue({
      ...emptyData(),
      data: [
        { id: "e1", date: "2026-06-01", expense_type: "fuel", amount: 100, created_at: "2026-06-01T09:00:00", is_deleted: false },
        { id: "e2", date: "2026-06-01", expense_type: "fuel", amount: 200, created_at: "2026-06-01T10:00:00", is_deleted: true },
      ],
    });

    const { getByText, queryByText } = render(<AddChooserScreen />);
    fireEvent.press(getByText("Expenses"));

    expect(getByText("100")).toBeTruthy();
    expect(queryByText("200")).toBeNull();
  });

  it("deleted bank deposit does not appear; active one does", () => {
    mockBankDeposits.mockReturnValue({
      ...emptyData(),
      data: [
        { id: "d1", amount: 300, direction: "wallet_to_bank", happened_at: "2026-06-01T09:00:00", is_deleted: false },
        { id: "d2", amount: 400, direction: "bank_to_wallet", happened_at: "2026-06-01T10:00:00", is_deleted: true },
      ],
    });

    const { getByText, queryByText } = render(<AddChooserScreen />);
    fireEvent.press(getByText("Expenses"));

    expect(getByText("Wallet → Bank")).toBeTruthy();
    expect(queryByText("Bank → Wallet")).toBeNull();
  });

  it("deleted company payment does not appear; active one does", () => {
    mockInventoryRefills.mockReturnValue(emptyData());
    mockCompanyPayments.mockReturnValue({
      ...emptyData(),
      data: [
        { id: "cp1", amount: 400, happened_at: "2026-06-01T09:00:00", is_deleted: false },
        { id: "cp2", amount: 888, happened_at: "2026-06-01T10:00:00", is_deleted: true },
      ],
    });

    const { getByText, queryByText } = render(<AddChooserScreen />);
    fireEvent.press(getByText("Company\nActivities"));

    expect(getByText("Amount 400")).toBeTruthy();
    expect(queryByText("Amount 888")).toBeNull();
  });

  it("deleted inventory adjustment does not appear; active one does", () => {
    mockInventoryAdjustments.mockReturnValue({
      ...emptyData(),
      data: [
        {
          id: "adj1",
          gas_type: "12kg",
          delta_full: 5,
          delta_empty: 0,
          reason: "active-adj",
          effective_at: "2026-06-01T09:00:00",
          created_at: "2026-06-01T09:00:00",
          is_deleted: false,
        },
        {
          id: "adj2",
          gas_type: "48kg",
          delta_full: 3,
          delta_empty: 0,
          reason: "deleted-adj",
          effective_at: "2026-06-01T10:00:00",
          created_at: "2026-06-01T10:00:00",
          is_deleted: true,
        },
      ],
    });

    const { getByText, queryByText } = render(<AddChooserScreen />);
    fireEvent.press(getByText("Ledger\nAdjustments"));

    expect(getByText("12kg: full +5")).toBeTruthy();
    expect(queryByText("48kg: full +3")).toBeNull();
  });
});

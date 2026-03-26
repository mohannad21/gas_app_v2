import React from "react";
import { Alert } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { act } from "react-test-renderer";

import AddChooserScreen from "@/app/(tabs)/add";

const mockCreateExpense = jest.fn();
const mockDeleteExpense = jest.fn();
const mockCreateDeposit = jest.fn();
const mockDeleteDeposit = jest.fn();

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
  useAllCustomerAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: { company_money: 0, company_cyl_12: 0, company_cyl_48: 0 },
    isSuccess: true,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock("@/hooks/useExpenses", () => ({
  useExpenses: () => ({
    data: [
      {
        id: "e1",
        date: "2025-01-01",
        expense_type: "fuel",
        amount: 50,
        note: "test",
        created_at: "2025-01-01T09:00:00",
      },
      {
        id: "e2",
        date: "2025-01-01",
        expense_type: "fuel",
        amount: 80,
        note: "second",
        created_at: "2025-01-01T10:00:00",
      },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useCreateExpense: () => ({ mutateAsync: mockCreateExpense }),
  useDeleteExpense: () => ({ mutateAsync: mockDeleteExpense }),
}));

jest.mock("@/hooks/useBankDeposits", () => ({
  useBankDeposits: () => ({
    data: [
      {
        id: "d1",
        amount: 100,
        direction: "wallet_to_bank",
        note: "bank",
        happened_at: "2025-01-01T12:00:00",
      },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useCreateBankDeposit: () => ({ mutateAsync: mockCreateDeposit }),
  useDeleteBankDeposit: () => ({ mutateAsync: mockDeleteDeposit }),
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
  useInventoryLatest: () => ({ data: null }),
  useInventorySnapshot: () => ({ data: null }),
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
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({ data: [], isLoading: false, error: null }),
  useSavePriceSetting: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/lib/addShortcut", () => ({
  consumeAddShortcut: () => null,
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("Cash & Expenses view", () => {
  beforeEach(() => {
    mockCreateExpense.mockReset();
    mockDeleteExpense.mockReset();
    mockCreateDeposit.mockReset();
    mockDeleteDeposit.mockReset();
    jest.spyOn(Alert, "alert").mockImplementation((_, __, buttons) => {
      const destructive = Array.isArray(buttons)
        ? buttons.find((button) => button.style === "destructive" || button.text === "Remove")
        : null;
      destructive?.onPress?.();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("switches to expenses mode and renders duplicate expenses separately", () => {
    const { getAllByLabelText, getAllByText, getByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Expenses"));
    expect(getAllByText("Wallet to Bank").length).toBeGreaterThan(0);
    expect(getByText("80")).toBeTruthy();
    expect(getByText("50")).toBeTruthy();
    expect(getAllByLabelText("Remove expense").length).toBe(2);
  });

  it("shows both same-day same-type expenses as distinct rows", () => {
    const { getAllByLabelText, getByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Expenses"));
    expect(getByText("second")).toBeTruthy();
    expect(getByText("test")).toBeTruthy();
    expect(getAllByLabelText("Remove expense").length).toBe(2);
  });

  it("deletes the exact selected expense row through the real UI path", async () => {
    const { getAllByLabelText, getByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Expenses"));
    const deleteExpenseButtons = getAllByLabelText("Remove expense");
    await act(async () => {
      fireEvent.press(deleteExpenseButtons[0]);
    });
    expect(mockDeleteExpense).toHaveBeenCalledWith({ id: "e2", date: "2025-01-01" });
  });

  it("shows Done accessory for keyboard", () => {
    const { getByText } = render(<AddChooserScreen />);
    fireEvent.press(getByText("Expenses"));
    expect(getByText("Done")).toBeTruthy();
  });
});

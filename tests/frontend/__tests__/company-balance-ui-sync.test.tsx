import React from "react";
import { Alert } from "react-native";
import { act } from "react-test-renderer";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import AddChooserScreen from "@/app/(tabs)/add";

type CompanyBalances = {
  company_money: number;
  company_cyl_12: number;
  company_cyl_48: number;
};

const focusCallbacks: Array<() => void> = [];
let mockCurrentCompanyBalances: CompanyBalances = {
  company_money: 10,
  company_cyl_12: 0,
  company_cyl_48: 0,
};
let mockNextCompanyBalances: CompanyBalances | null = null;

const mockCompanyBalancesRefetch = jest.fn(async () => {
  if (mockNextCompanyBalances) {
    mockCurrentCompanyBalances = mockNextCompanyBalances;
    mockNextCompanyBalances = null;
  }
  return { data: mockCurrentCompanyBalances };
});
const mockDeleteRefillMutateAsync = jest.fn(async () => {
  if (mockNextCompanyBalances) {
    mockCurrentCompanyBalances = mockNextCompanyBalances;
    mockNextCompanyBalances = null;
  }
  return {};
});
const mockDeleteInventoryAdjustmentMutateAsync = jest.fn(async () => {
  if (mockNextCompanyBalances) {
    mockCurrentCompanyBalances = mockNextCompanyBalances;
    mockNextCompanyBalances = null;
  }
  return {};
});
const mockCompanyRefillsRefetch = jest.fn(async () => ({}));
const mockInventoryAdjustmentsRefetch = jest.fn(async () => ({}));

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
    data: mockCurrentCompanyBalances,
    isSuccess: true,
    refetch: mockCompanyBalancesRefetch,
  }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock("@/hooks/useExpenses", () => ({
  useExpenses: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useCreateExpense: () => ({ mutateAsync: jest.fn() }),
  useDeleteExpense: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useBankDeposits", () => ({
  useBankDeposits: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteBankDeposit: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useReports", () => ({
  useDailyReportDayV2: () => ({ data: { date: "2025-01-01", events: [] }, isLoading: false, error: null, refetch: jest.fn() }),
}));

jest.mock("@/hooks/useCompanyPayments", () => ({
  useCompanyPayments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

jest.mock("@/hooks/useCash", () => ({
  useCashAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCashAdjustment: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useCreateRefill: () => ({ mutateAsync: jest.fn() }),
  useInitInventory: () => ({ mutateAsync: jest.fn() }),
  useInventoryLatest: () => ({ data: null }),
  useInventorySnapshot: () => ({ data: null }),
  useDeleteRefill: () => ({ mutateAsync: mockDeleteRefillMutateAsync }),
  useDeleteInventoryAdjustment: () => ({ mutateAsync: mockDeleteInventoryAdjustmentMutateAsync }),
  useInventoryRefills: () => ({
    data: [
      {
        refill_id: "refill-1",
        effective_at: "2025-01-01T09:00:00Z",
        date: "2025-01-01",
        time_of_day: "morning",
        buy12: 1,
        return12: 1,
        buy48: 0,
        return48: 0,
        new12: 0,
        new48: 0,
        is_deleted: false,
      },
    ],
    isLoading: false,
    error: null,
    refetch: mockCompanyRefillsRefetch,
  }),
  useInventoryAdjustments: () => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: mockInventoryAdjustmentsRefetch,
  }),
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

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => {
    focusCallbacks.push(cb);
  },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

function queueCompanyBalances(next: CompanyBalances) {
  mockNextCompanyBalances = next;
}

describe("company balance UI sync", () => {
  beforeEach(() => {
    focusCallbacks.length = 0;
    mockCurrentCompanyBalances = { company_money: 10, company_cyl_12: 0, company_cyl_48: 0 };
    mockNextCompanyBalances = null;
    mockCompanyBalancesRefetch.mockClear();
    mockDeleteRefillMutateAsync.mockClear();
    mockDeleteInventoryAdjustmentMutateAsync.mockClear();
    mockCompanyRefillsRefetch.mockClear();
    mockInventoryAdjustmentsRefetch.mockClear();
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

  async function openCompanySummary(view: ReturnType<typeof render>) {
    fireEvent.press(view.getByText("Company\nActivities"));
    fireEvent.press(view.getByText("Company Balances"));
    await waitFor(() => {
      expect(view.getByText("10 shekels")).toBeTruthy();
    });
  }

  async function refocusAndRerender(view: ReturnType<typeof render>, next: CompanyBalances) {
    queueCompanyBalances(next);
    await act(async () => {
      focusCallbacks.forEach((callback) => callback());
    });
    view.rerender(<AddChooserScreen />);
  }

  it("updates the visible company summary after a refill create when the screen regains focus", async () => {
    const view = render(<AddChooserScreen />);

    await openCompanySummary(view);
    await refocusAndRerender(view, { company_money: 30, company_cyl_12: 0, company_cyl_48: 0 });

    expect(view.getByText("30 shekels")).toBeTruthy();
    expect(view.queryByText("10 shekels")).toBeNull();
  });

  it("updates the visible company summary after a refill update when the screen regains focus", async () => {
    const view = render(<AddChooserScreen />);

    await openCompanySummary(view);
    await refocusAndRerender(view, { company_money: 5, company_cyl_12: 0, company_cyl_48: 0 });

    expect(view.getByText("5 shekels")).toBeTruthy();
    expect(view.queryByText("10 shekels")).toBeNull();
  });

  it("updates the visible company summary immediately after deleting a refill from the company activities screen", async () => {
    queueCompanyBalances({ company_money: 0, company_cyl_12: 0, company_cyl_48: 0 });
    const view = render(<AddChooserScreen />);

    await openCompanySummary(view);

    await act(async () => {
      fireEvent.press(view.getByLabelText("Remove refill"));
    });
    view.rerender(<AddChooserScreen />);

    expect(mockCompanyBalancesRefetch).not.toHaveBeenCalled();
    expect(view.getByText("0 shekels")).toBeTruthy();
    expect(view.queryByText("10 shekels")).toBeNull();
  });
});

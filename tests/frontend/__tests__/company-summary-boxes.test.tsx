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

jest.mock("@/hooks/useBalancesSummary", () => ({
  useBalancesSummary: () => ({
    balanceSummary: {
      money: { receivable: { count: 0, total: 0 }, payable: { count: 0, total: 0 } },
      cyl12: { receivable: { count: 0, total: 0 }, payable: { count: 0, total: 0 } },
      cyl48: { receivable: { count: 0, total: 0 }, payable: { count: 0, total: 0 } },
    },
    companySummary: {
      payCash: 120,
      receiveCash: 0,
      give12: 4,
      receive12: 0,
      give48: 0,
      receive48: 2,
    },
    companyBalancesQuery: { isSuccess: true },
    refetchCustomers: jest.fn(),
  }),
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
    data: {
      date: "2026-03-16",
      events: [
        {
          event_type: "company_payment",
          effective_at: "2026-03-16T10:00:00",
          total_cost: 90,
          reason: "Fuel settlement",
          source_id: "cp-1",
        },
      ],
    },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useCreateRefill: () => ({ mutateAsync: jest.fn() }),
  useInitInventory: () => ({ mutateAsync: jest.fn() }),
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
  useDeleteCashAdjustment: () => ({ mutateAsync: jest.fn() }),
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
  useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("Company summary boxes", () => {
  it("renders the 3 compact boxes in the required order between filters and list", () => {
    const { getByText, queryByText, toJSON } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Company\nActivities"));

    expect(getByText("Wallet balance")).toBeTruthy();
    expect(getByText("12kg balance")).toBeTruthy();
    expect(getByText("48kg balance")).toBeTruthy();
    expect(getByText("+120 shekels")).toBeTruthy();
    expect(getByText("-4 cyl")).toBeTruthy();
    expect(getByText("+2 cyl")).toBeTruthy();
    expect(getByText("+ = you owe company. - = company owes you.")).toBeTruthy();
    expect(queryByText("Company Balances")).toBeNull();

    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf("Refill")).toBeLessThan(tree.indexOf("Wallet balance"));
    expect(tree.indexOf("Wallet balance")).toBeLessThan(tree.indexOf("Fuel settlement"));
    expect(tree.indexOf("Wallet balance")).toBeLessThan(tree.indexOf("12kg balance"));
    expect(tree.indexOf("12kg balance")).toBeLessThan(tree.indexOf("48kg balance"));
  });
});

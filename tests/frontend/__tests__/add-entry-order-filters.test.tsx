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

let mockOrdersData: any[] = [];
const mockDeleteOrder = jest.fn();

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({
    data: [
      { id: "system-a-12", customer_id: "customer-a", name: "A 12kg", gas_type: "12kg", is_active: true },
      { id: "system-a-48", customer_id: "customer-a", name: "A 48kg", gas_type: "48kg", is_active: true },
    ],
    isLoading: false,
  }),
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
  useDeleteCustomer: () => ({ mutate: jest.fn(), mutateAsync: jest.fn() }),
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
  useOrders: () => ({ data: mockOrdersData, isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteOrder: () => ({ mutate: mockDeleteOrder }),
}));

jest.mock("@/hooks/useCollections", () => ({
  useCollections: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCollection: () => ({ mutate: jest.fn(), mutateAsync: jest.fn() }),
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
  useDeleteCompanyPayment: () => ({ mutate: jest.fn(), mutateAsync: jest.fn() }),
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

describe("Add Entry order filters", () => {
  beforeEach(() => {
    mockDeleteOrder.mockReset();
    mockOrdersData = [
      {
        id: "sell-12",
        customer_id: "customer-a",
        system_id: "system-a-12",
        order_mode: "sell_iron",
        gas_type: "12kg",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 100,
        paid_amount: 70,
        debt_cash: 30,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        delivered_at: "2026-05-14T09:00:00Z",
        created_at: "2026-05-14T09:00:00Z",
        is_deleted: false,
      },
      {
        id: "sell-48",
        customer_id: "customer-a",
        system_id: "system-a-48",
        order_mode: "sell_iron",
        gas_type: "48kg",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 120,
        paid_amount: 80,
        debt_cash: 40,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        delivered_at: "2026-05-14T10:00:00Z",
        created_at: "2026-05-14T10:00:00Z",
        is_deleted: false,
      },
      {
        id: "buy-12",
        customer_id: "customer-a",
        system_id: null,
        order_mode: "buy_iron",
        gas_type: "12kg",
        cylinders_installed: 0,
        cylinders_received: 1,
        price_total: 40,
        paid_amount: 30,
        debt_cash: -10,
        debt_cylinders_12: 3,
        debt_cylinders_48: 0,
        delivered_at: "2026-05-14T11:00:00Z",
        created_at: "2026-05-14T11:00:00Z",
        is_deleted: false,
      },
      {
        id: "buy-48",
        customer_id: "customer-b",
        system_id: null,
        order_mode: "buy_iron",
        gas_type: "48kg",
        cylinders_installed: 0,
        cylinders_received: 1,
        price_total: 60,
        paid_amount: 20,
        debt_cash: -40,
        debt_cylinders_12: 0,
        debt_cylinders_48: 2,
        delivered_at: "2026-05-14T12:00:00Z",
        created_at: "2026-05-14T12:00:00Z",
        is_deleted: false,
      },
    ];
  });

  it("renders sell full and buy empty rows from the order pipeline", () => {
    const { getAllByText, getByText } = render(<AddChooserScreen />);

    expect(getAllByText("Sold full").length).toBeGreaterThan(0);
    expect(getAllByText("Bought empty").length).toBeGreaterThan(0);
    expect(getByText("Installed: 1x 12kg")).toBeTruthy();
    expect(getByText("Installed: 1x 48kg")).toBeTruthy();
    expect(getByText("Received: 1x 12kg")).toBeTruthy();
    expect(getByText("Received: 1x 48kg")).toBeTruthy();
  });

  it("filters sell full rows by activity and gas type", () => {
    const { getByText, getAllByText, queryByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("filter-outline"));
    fireEvent.press(getAllByText("Sold full")[0]);
    fireEvent.press(getAllByText("12kg")[0]);

    expect(getByText("Installed: 1x 12kg")).toBeTruthy();
    expect(queryByText("Installed: 1x 48kg")).toBeNull();
    expect(queryByText("Received: 1x 12kg")).toBeNull();
    expect(queryByText("Received: 1x 48kg")).toBeNull();
  });

  it("filters buy empty rows by activity and gas type", () => {
    const { getByText, getAllByText, queryByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("filter-outline"));
    fireEvent.press(getAllByText("Bought empty")[0]);
    fireEvent.press(getAllByText("48kg")[0]);

    expect(getByText("Received: 1x 48kg")).toBeTruthy();
    expect(queryByText("Received: 1x 12kg")).toBeNull();
    expect(queryByText("Installed: 1x 12kg")).toBeNull();
    expect(queryByText("Installed: 1x 48kg")).toBeNull();
  });

  it("deletes an order and removes the row after rerender", () => {
    mockDeleteOrder.mockImplementation((id: string, options?: { onSettled?: () => void }) => {
      options?.onSettled?.();
    });

    const { getAllByLabelText, getByLabelText, getByText, queryByText, rerender } = render(<AddChooserScreen />);

    expect(getByText("Installed: 1x 12kg")).toBeTruthy();
    fireEvent.press(getAllByLabelText("Delete")[0]);
    fireEvent.press(getByLabelText("Delete order permanently"));

    expect(mockDeleteOrder).toHaveBeenCalledWith("buy-48", expect.objectContaining({ onSettled: expect.any(Function) }));

    mockOrdersData = mockOrdersData.filter((row) => row.id !== "buy-48");
    rerender(<AddChooserScreen />);
    expect(queryByText("Received: 1x 48kg")).toBeNull();
  });
});

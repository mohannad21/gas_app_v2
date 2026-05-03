import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import AddChooserScreen from "@/app/(tabs)/add";

jest.mock("@/hooks/useOrders", () => ({
  useOrders: () => ({
    data: [
      {
        id: "order-1",
        customer_id: "customer-1",
        system_id: "system-1",
        order_mode: "replacement",
        gas_type: "12kg",
        cylinders_installed: 1,
        cylinders_received: 1,
        created_at: "2025-01-01T09:00:00Z",
        delivered_at: "2025-01-01T09:00:00Z",
        price_total: 50,
        paid_amount: 50,
      },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useDeleteOrder: () => ({ mutate: jest.fn() }),
}));

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({
    data: [
      {
        id: "customer-1",
        name: "Alice",
        money_balance: 0,
        cyl12_balance: 0,
        cyl48_balance: 0,
        created_at: "2025-01-01T09:00:00Z",
      },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useDeleteCustomer: () => ({ mutateAsync: jest.fn() }),
  useAllCustomerAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  CUSTOMER_DELETE_BLOCKED_MESSAGE: "Customer has transactions",
  isCustomerDeleteBlockedError: () => false,
}));

jest.mock("@/hooks/useCollections", () => ({
  useCollections: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCollection: () => ({ mutate: jest.fn() }),
  useUpdateCollection: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({
    data: [{ id: "system-1", customer_id: "customer-1", name: "Main Kitchen", is_active: true }],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/hooks/useBalancesSummary", () => ({
  useBalancesSummary: () => ({
    companySummary: { company_money: 0, company_cyl_12: 0, company_cyl_48: 0 },
    companyBalancesQuery: { refetch: jest.fn() },
  }),
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalanceAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

jest.mock("@/hooks/useExpenses", () => ({
  useExpenses: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteExpense: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useBankDeposits", () => ({
  useBankDeposits: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteBankDeposit: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCompanyPayments", () => ({
  useCompanyPayments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCompanyPayment: () => ({ mutate: jest.fn() }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useInventoryAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteInventoryAdjustment: () => ({ mutateAsync: jest.fn() }),
  useDeleteRefill: () => ({ mutateAsync: jest.fn() }),
  useInventoryRefills: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

jest.mock("@/hooks/useCash", () => ({
  useCashAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
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

describe("Add screen destructive confirmation copy", () => {
  it("uses real delete wording for orders", () => {
    const view = render(<AddChooserScreen />);

    fireEvent(view.getByLabelText("Remove order"), "press", { stopPropagation: jest.fn() });

    expect(view.getByText("Delete order?")).toBeTruthy();
    expect(view.getByText("This will reverse the order and update related ledger balances.")).toBeTruthy();
    expect(view.getByLabelText("Delete order permanently")).toBeTruthy();
  });
});

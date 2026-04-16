import React from "react";
import { render } from "@testing-library/react-native";

import CustomerDetailsScreen from "@/app/customers/[id]";

const mockOrdersRefetch = jest.fn();
const mockCollectionsRefetch = jest.fn();
const mockAdjustmentsRefetch = jest.fn();
let mockAdjustmentsData: any[] = [];

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({
    data: [
      {
        id: "cust-1",
        name: "Test Customer",
        note: "Regular route",
        address: "Main street",
        phone: "123456",
        money_balance: 120,
        cylinder_balance_12kg: -2,
        cylinder_balance_48kg: 3,
        order_count: 1,
      },
    ],
    isLoading: false,
    refetch: jest.fn(),
  }),
  useCustomerBalance: () => ({
    data: {
      customer_id: "cust-1",
      money_balance: 120,
      cylinder_balance_12kg: -2,
      cylinder_balance_48kg: 3,
    },
  }),
  useCustomerAdjustments: () => ({
    data: mockAdjustmentsData,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: mockAdjustmentsRefetch,
  }),
  useDeleteCustomer: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCollections", () => ({
  useCollections: () => ({
    data: [
      {
        id: "collection-1",
        customer_id: "cust-1",
        action_type: "payment",
        amount_money: 20,
        debt_cash: 120,
        debt_cylinders_12: -2,
        debt_cylinders_48: 3,
        effective_at: "2026-03-16T10:00:00",
        created_at: "2026-03-16T10:00:00",
        note: "Paid part",
      },
    ],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: mockCollectionsRefetch,
  }),
  useDeleteCollection: () => ({ mutate: jest.fn() }),
}));

jest.mock("@/hooks/useOrders", () => ({
  useOrders: () => ({
    data: [
      {
        id: "order-1",
        customer_id: "cust-1",
        system_id: "sys-1",
        order_mode: "replacement",
        gas_type: "12kg",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 40,
        paid_amount: 20,
        debt_cash: 120,
        debt_cylinders_12: -2,
        debt_cylinders_48: 3,
        delivered_at: "2026-03-15T09:00:00",
        created_at: "2026-03-15T09:00:00",
      },
    ],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: mockOrdersRefetch,
  }),
  useDeleteOrder: () => ({ mutate: jest.fn() }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({
    data: [{ id: "sys-1", name: "Main system", gas_type: "12kg", is_active: true }],
    isLoading: false,
    refetch: jest.fn(),
  }),
  useDeleteSystem: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "cust-1" }),
  router: { push: jest.fn() },
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require("react");
    React.useEffect(() => cb(), [cb]);
  },
}));

jest.mock("expo-linking", () => ({
  openURL: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("Customer detail balance boxes", () => {
  beforeEach(() => {
    mockOrdersRefetch.mockClear();
    mockCollectionsRefetch.mockClear();
    mockAdjustmentsRefetch.mockClear();
    mockAdjustmentsData = [];
  });

  it("replaces the old balances section with compact boxes below the filters", () => {
    const { getByText, queryByText, toJSON } = render(<CustomerDetailsScreen />);

    expect(queryByText("Balances")).toBeNull();
    expect(getByText("Money balance")).toBeTruthy();
    expect(getByText("12kg balance")).toBeTruthy();
    expect(getByText("48kg balance")).toBeTruthy();
    expect(getByText("120.00 USD")).toBeTruthy();
    expect(getByText("-2")).toBeTruthy();
    expect(getByText("3")).toBeTruthy();

    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf("Adjustments")).toBeLessThan(tree.indexOf("Money balance"));
  });

  it("does not re-trigger focus refetches on same-customer rerenders", () => {
    const { rerender } = render(<CustomerDetailsScreen />);

    expect(mockOrdersRefetch).toHaveBeenCalledTimes(1);
    expect(mockCollectionsRefetch).toHaveBeenCalledTimes(1);
    expect(mockAdjustmentsRefetch).toHaveBeenCalledTimes(1);

    rerender(<CustomerDetailsScreen />);

    expect(mockOrdersRefetch).toHaveBeenCalledTimes(1);
    expect(mockCollectionsRefetch).toHaveBeenCalledTimes(1);
    expect(mockAdjustmentsRefetch).toHaveBeenCalledTimes(1);
  });

  it("renders adjustment pills from stored snapshots as old to new balances", () => {
    mockAdjustmentsData = [
      {
        id: "adj-1",
        customer_id: "cust-1",
        amount_money: 100,
        count_12kg: -2,
        count_48kg: 3,
        debt_cash: 280,
        debt_cylinders_12: -12,
        debt_cylinders_48: 12,
        reason: "Manual correction",
        effective_at: "2026-04-16T11:36:12",
        created_at: "2026-04-16T11:36:12",
      },
    ];

    const { getByText, queryByText } = render(<CustomerDetailsScreen />);

    expect(getByText("Money balance: debts 180.00 $ → 280.00 $ debts (on customer)")).toBeTruthy();
    expect(getByText("12kg balance: credit 10 → 12 credit (for customer)")).toBeTruthy();
    expect(getByText("48kg balance: debts 9 → 12 debts (on customer)")).toBeTruthy();
    expect(queryByText("Money balance: credit 100.00 $ → 0.00 $ (on customer)")).toBeNull();
  });
});

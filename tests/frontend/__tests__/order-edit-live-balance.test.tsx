import React from "react";
import { render, waitFor } from "@testing-library/react-native";

import EditOrderScreen from "@/app/orders/[id]/edit";

const mockOrder = {
  id: "order-1",
  customer_id: "cust-1",
  system_id: "sys-1",
  delivered_at: "2025-01-01T10:00:00Z",
  gas_type: "12kg",
  cylinders_installed: 1,
  cylinders_received: 1,
  price_total: 50,
  paid_amount: 50,
  note: "",
};

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ id: "order-1" }),
}));

jest.mock("@/hooks/useOrders", () => ({
  useOrders: () => ({
    data: [mockOrder],
    isLoading: false,
    error: null,
  }),
  useUpdateOrder: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({
    data: [
      {
        id: "cust-1",
        name: "Alice",
        money_balance: 999,
        cylinder_balance_12kg: 9,
        cylinder_balance_48kg: 4,
      },
    ],
    isLoading: false,
    error: null,
  }),
  useCustomerBalance: () => ({
    data: {
      money_balance: 120,
      cylinder_balance_12kg: 2,
      cylinder_balance_48kg: 1,
    },
    isLoading: false,
    isError: false,
    isSuccess: true,
  }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({
    data: [{ id: "sys-1", name: "Main kitchen", gas_type: "12kg", is_active: true }],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/components/entry/BigBox", () => {
  const React = jest.requireActual("react");
  const { Text, View } = jest.requireActual("react-native");
  return ({ title, statusLine, children }: { title: string; statusLine?: string; children?: React.ReactNode }) => (
    <View>
      <Text>{title}</Text>
      {statusLine ? <Text>{statusLine}</Text> : null}
      {children}
    </View>
  );
});

describe("EditOrderScreen live balance source", () => {
  it("renders balance previews from the live customer balance query instead of the customer list row", async () => {
    const view = render(<EditOrderScreen />);

    await waitFor(() => {
      expect(view.getByText("Customer owes you EUR 120")).toBeTruthy();
    });

    expect(view.getByText("Customer owes you 2x12kg empties")).toBeTruthy();
    expect(view.queryByText("Customer owes you EUR 999")).toBeNull();
    expect(view.queryByText("Customer owes you 9x12kg empties")).toBeNull();
  });
});

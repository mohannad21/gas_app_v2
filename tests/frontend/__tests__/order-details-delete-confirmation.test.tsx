import React from "react";
import { Alert } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

const mockDeleteOrderMutate = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: "order-1" }),
}));

jest.mock("@/hooks/useOrders", () => ({
  useOrders: () => ({
    data: [
      {
        id: "order-1",
        customer_id: "customer-1",
        system_id: "system-1",
        gas_type: "12kg",
        delivered_at: "2026-03-23T10:00:00",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 75,
        paid_amount: 25,
        note: "test note",
        cyl_balance_before: { "12kg": 1, "48kg": 0 },
        cyl_balance_after: { "12kg": 0, "48kg": 0 },
      },
    ],
    isLoading: false,
  }),
  useDeleteOrder: () => ({ mutate: mockDeleteOrderMutate }),
}));

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({
    data: [{ id: "customer-1", name: "Alice" }],
  }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({
    data: [{ id: "system-1", name: "Main Kitchen" }],
  }),
}));

import OrderDetailsScreen from "@/app/orders/[id]";

describe("OrderDetailsScreen delete confirmation", () => {
  beforeEach(() => {
    mockDeleteOrderMutate.mockReset();
  });

  it("does not delete until confirmation is accepted", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { getByText } = render(<OrderDetailsScreen />);

    fireEvent.press(getByText("Remove"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Remove order?",
      "This will reverse the order and update related ledger balances.",
      expect.any(Array)
    );
    expect(mockDeleteOrderMutate).not.toHaveBeenCalled();
  });

  it("does not delete when confirmation is canceled", () => {
    jest.spyOn(Alert, "alert").mockImplementation((_, __, buttons) => {
      const cancel = Array.isArray(buttons) ? buttons.find((button) => button.text === "Cancel") : undefined;
      cancel?.onPress?.();
    });
    const { getByText } = render(<OrderDetailsScreen />);

    fireEvent.press(getByText("Remove"));

    expect(mockDeleteOrderMutate).not.toHaveBeenCalled();
  });

  it("deletes when confirmation is accepted", () => {
    jest.spyOn(Alert, "alert").mockImplementation((_, __, buttons) => {
      const destructive = Array.isArray(buttons) ? buttons.find((button) => button.text === "Remove") : undefined;
      destructive?.onPress?.();
    });
    const { getByText } = render(<OrderDetailsScreen />);

    fireEvent.press(getByText("Remove"));

    expect(mockDeleteOrderMutate).toHaveBeenCalledWith("order-1");
  });
});

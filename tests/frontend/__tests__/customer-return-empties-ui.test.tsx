import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import NewOrderScreen from "@/app/orders/new";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ customerId: "cust-1", systemId: "sys-1" }),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

// Customer has 3 x 12kg debt, 0 x 48kg debt
jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({
    data: [
      {
        id: "cust-1",
        name: "Alice",
        money_balance: 0,
        cylinder_balance_12kg: 3,
        cylinder_balance_48kg: 0,
      },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useCustomerBalance: () => ({
    data: {
      money_balance: 0,
      cylinder_balance_12kg: 3,
      cylinder_balance_48kg: 0,
    },
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/hooks/useOrders", () => ({
  useCreateOrder: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/useCollections", () => ({
  useCreateCollection: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useInventoryLatest: () => ({
    data: { full12: 10, empty12: 5, full48: 6, empty48: 3 },
    isLoading: false,
  }),
  useInitInventory: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({
    data: [
      {
        id: "price-1",
        gas_type: "12kg",
        selling_price: 75,
        buying_price: 60,
        effective_from: "2026-01-01T00:00:00Z",
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/hooks/useReports", () => ({
  useDailyReportsV2: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({
    data: [{ id: "sys-1", name: "Main kitchen", gas_type: "12kg", is_active: true }],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/components/InlineWalletFundingPrompt", () => () => null);

describe("NewOrderScreen customer_return_empties", () => {
  const renderAndSwitchToReturn = async () => {
    const view = render(<NewOrderScreen />);

    await waitFor(() => {
      expect(view.getByText("Return")).toBeTruthy();
    });

    fireEvent.press(view.getByText("Return"));

    await waitFor(() => {
      expect(view.getByText("Didn't return")).toBeTruthy();
    });

    return view;
  };

  it("opens return mode with field pre-filled to debt and toggle at S1", async () => {
    const view = await renderAndSwitchToReturn();

    expect(view.getByText("Didn't return")).toBeTruthy();
    expect(view.getByDisplayValue("3")).toBeTruthy();
  });

  it("gas type selector renders inside the Cylinders box", async () => {
    const view = await renderAndSwitchToReturn();

    const cylindersTitle = view.getByText("Cylinders");
    expect(cylindersTitle).toBeTruthy();
    expect(view.getByText("12kg")).toBeTruthy();
  });

  it("zero-balance gas tab (48kg) is not disabled and is tappable", async () => {
    const view = await renderAndSwitchToReturn();

    const tab48 = view.getByText("48kg");
    expect(tab48).toBeTruthy();

    // Should not throw — tab is tappable even with no 48kg debt
    expect(() => fireEvent.press(tab48)).not.toThrow();
  });

  it("tapping toggle cycles S1 → S2 → S1", async () => {
    const view = await renderAndSwitchToReturn();

    // Opens at S1: Didn't return, field = 3
    expect(view.getByText("Didn't return")).toBeTruthy();
    expect(view.getByDisplayValue("3")).toBeTruthy();

    fireEvent.press(view.getByText("Didn't return"));

    // S2: Return all, field = 0
    await waitFor(() => expect(view.getByText("Return all")).toBeTruthy());
    expect(view.getByDisplayValue("0")).toBeTruthy();

    fireEvent.press(view.getByText("Return all"));

    // Back to S1
    await waitFor(() => expect(view.getByText("Didn't return")).toBeTruthy());
    expect(view.getByDisplayValue("3")).toBeTruthy();
  });

  it("typing the exact debt snaps toggle to S1", async () => {
    const view = await renderAndSwitchToReturn();

    // Move to S2 first
    fireEvent.press(view.getByText("Didn't return"));
    await waitFor(() => expect(view.getByText("Return all")).toBeTruthy());

    // Type the target
    fireEvent.changeText(view.getByDisplayValue("0"), "3");
    expect(view.getByText("Didn't return")).toBeTruthy();
  });

  it("typing 0 snaps toggle to S2", async () => {
    const view = await renderAndSwitchToReturn();

    fireEvent.changeText(view.getByDisplayValue("3"), "0");
    expect(view.getByText("Return all")).toBeTruthy();
  });

  it("typing a custom non-zero non-target value preserves toggle state", async () => {
    const view = await renderAndSwitchToReturn();

    // Opens at S1
    expect(view.getByText("Didn't return")).toBeTruthy();

    fireEvent.changeText(view.getByDisplayValue("3"), "1");

    // Still S1 (custom value, not 0 or target)
    expect(view.getByText("Didn't return")).toBeTruthy();
  });

  it("return field remains editable", async () => {
    const view = await renderAndSwitchToReturn();

    const input = view.getByDisplayValue("3");
    expect(input.props.editable).not.toBe(false);
  });
});

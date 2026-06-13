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

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({
    data: [
      {
        id: "cust-1",
        name: "Alice",
        money_balance: 0,
        cylinder_balance_12kg: 0,
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
      cylinder_balance_12kg: 0,
      cylinder_balance_48kg: 0,
    },
    isLoading: false,
    isError: false,
    isSuccess: true,
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

describe("NewOrderScreen replacement flow", () => {
  const renderReplacement = async () => {
    const view = render(<NewOrderScreen />);

    await waitFor(() => {
      expect(view.getByText("Installed")).toBeTruthy();
    });

    return view;
  };

  it("does not render the removed New Balance section", async () => {
    const { queryByText } = await renderReplacement();

    expect(queryByText("New Balance")).toBeNull();
  });

  it("opens replacement with shared toggles and gas selling price box", async () => {
    const view = await renderReplacement();

    expect(view.getByText("Didn't receive")).toBeTruthy();
    expect(view.getByText("Didn't pay")).toBeTruthy();
    expect(view.getByText("Gas Selling Price")).toBeTruthy();
    expect(view.getByText("Gas Price")).toBeTruthy();
    expect(view.queryByText("Returned all")).toBeNull();
    expect(view.queryByText("Paid with debt")).toBeNull();
  });

  it("toggles replacement received and paid values between target and zero", async () => {
    const view = await renderReplacement();

    fireEvent.press(view.getByTestId("replacement-received-toggle"));
    expect(view.getByText("Receive all")).toBeTruthy();
    expect(view.getByDisplayValue("0")).toBeTruthy();

    fireEvent.press(view.getByTestId("replacement-received-toggle"));
    expect(view.getByText("Didn't receive")).toBeTruthy();
    expect(view.getAllByDisplayValue("1").length).toBeGreaterThanOrEqual(2);

    fireEvent.press(view.getByTestId("replacement-paid-toggle"));
    expect(view.getByText("Pay all")).toBeTruthy();
    expect(view.getByDisplayValue("0.00")).toBeTruthy();

    fireEvent.press(view.getByTestId("replacement-paid-toggle"));
    expect(view.getByText("Didn't pay")).toBeTruthy();
    expect(view.getAllByDisplayValue("75.00").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps replacement toggle state for custom typed values and snaps exact zero/target", async () => {
    const view = await renderReplacement();

    const paidInputs = view.getAllByDisplayValue("75.00");
    fireEvent.changeText(paidInputs[paidInputs.length - 1], "40");

    expect(view.getByDisplayValue("40.00")).toBeTruthy();
    expect(view.getByText("Didn't pay")).toBeTruthy();

    fireEvent.changeText(view.getByDisplayValue("40.00"), "0");

    expect(view.getByDisplayValue("0.00")).toBeTruthy();
    expect(view.getByText("Pay all")).toBeTruthy();

    fireEvent.changeText(view.getByDisplayValue("0.00"), "75");

    expect(view.getAllByDisplayValue("75.00").length).toBeGreaterThanOrEqual(2);
    expect(view.getByText("Didn't pay")).toBeTruthy();
  });

  it("updates replacement target-controlled values when installed quantity changes", async () => {
    const view = await renderReplacement();

    fireEvent.changeText(view.getAllByDisplayValue("1")[0], "2");

    await waitFor(() => {
      expect(view.getAllByDisplayValue("2").length).toBeGreaterThanOrEqual(2);
      expect(view.getAllByDisplayValue("150.00").length).toBeGreaterThanOrEqual(2);
    });

    expect(view.getByText("Didn't receive")).toBeTruthy();
    expect(view.getByText("Didn't pay")).toBeTruthy();
  });
});

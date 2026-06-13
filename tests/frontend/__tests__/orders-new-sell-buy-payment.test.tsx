import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import NewOrderScreen from "@/app/orders/new";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: mockPush, replace: jest.fn() },
  useRouter: () => ({ push: mockPush }),
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
        selling_iron_price: 30,
        buying_iron_price: 20,
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

describe("NewOrderScreen sell full / buy empty payment controls", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  const renderOrder = async () => {
    const view = render(<NewOrderScreen />);

    await waitFor(() => {
      expect(view.getByText("Replacement")).toBeTruthy();
    });

    return view;
  };

  it("renders sell full price shortcuts and shared payment toggle", async () => {
    const view = await renderOrder();

    fireEvent.press(view.getByText("Sell Full"));

    await waitFor(() => {
      expect(view.getByText("Iron Selling Price")).toBeTruthy();
    });

    expect(view.getByText("Gas Selling Price")).toBeTruthy();
    expect(view.getByText("Update iron price")).toBeTruthy();
    expect(view.getByText("Update gas price")).toBeTruthy();
    expect(view.getByText("Didn't pay")).toBeTruthy();
    expect(view.getAllByDisplayValue("105.00").length).toBeGreaterThanOrEqual(2);

    fireEvent.press(view.getByTestId("sell-full-payment-toggle"));

    expect(view.getByText("Pay all")).toBeTruthy();
    expect(view.getByDisplayValue("0.00")).toBeTruthy();

    fireEvent.press(view.getByTestId("sell-full-payment-toggle"));

    expect(view.getByText("Didn't pay")).toBeTruthy();
    expect(view.getAllByDisplayValue("105.00").length).toBeGreaterThanOrEqual(2);
  });

  it("routes sell full price shortcuts to canonical price config route", async () => {
    const view = await renderOrder();

    fireEvent.press(view.getByText("Sell Full"));
    fireEvent.press(view.getByTestId("sell-full-update-gas-price"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/account/configuration/prices",
      params: { section: "gasSellToCustomer" },
    });

    fireEvent.press(view.getByTestId("sell-full-update-iron-price"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/account/configuration/prices",
      params: { section: "ironSellToCustomer" },
    });
  });

  it("keeps sell full custom paid values and snaps exact zero/target", async () => {
    const view = await renderOrder();

    fireEvent.press(view.getByText("Sell Full"));

    await waitFor(() => {
      expect(view.getByText("Iron Selling Price")).toBeTruthy();
    });

    const targetInputs = view.getAllByDisplayValue("105.00");
    fireEvent.changeText(targetInputs[targetInputs.length - 1], "40");

    expect(view.getByDisplayValue("40.00")).toBeTruthy();
    expect(view.getByText("Didn't pay")).toBeTruthy();

    fireEvent.changeText(view.getByDisplayValue("40.00"), "0");

    expect(view.getByDisplayValue("0.00")).toBeTruthy();
    expect(view.getByText("Pay all")).toBeTruthy();

    fireEvent.changeText(view.getByDisplayValue("0.00"), "105");

    expect(view.getAllByDisplayValue("105.00").length).toBeGreaterThanOrEqual(2);
    expect(view.getByText("Didn't pay")).toBeTruthy();
  });

  it("keeps sell full custom paid value when price target changes", async () => {
    const view = await renderOrder();

    fireEvent.press(view.getByText("Sell Full"));

    await waitFor(() => {
      expect(view.getByText("Iron Selling Price")).toBeTruthy();
    });

    const targetInputs = view.getAllByDisplayValue("105.00");
    fireEvent.changeText(targetInputs[targetInputs.length - 1], "40");
    fireEvent.press(view.getAllByText("+5")[0]);

    expect(view.getByDisplayValue("40.00")).toBeTruthy();
    expect(view.getByText("Didn't pay")).toBeTruthy();
  });

  it("renders buy empty price shortcut and shared payment toggle", async () => {
    const view = await renderOrder();

    fireEvent.press(view.getByText("Buy Empty"));

    await waitFor(() => {
      expect(view.getByText("Iron Buying Price - From Customer")).toBeTruthy();
    });

    expect(view.getByText("Update iron price")).toBeTruthy();
    expect(view.getByText("Didn't pay")).toBeTruthy();
    expect(view.getAllByDisplayValue("20.00").length).toBeGreaterThanOrEqual(2);

    fireEvent.press(view.getByTestId("buy-empty-payment-toggle"));

    expect(view.getByText("Pay all")).toBeTruthy();
    expect(view.getByDisplayValue("0.00")).toBeTruthy();

    fireEvent.press(view.getByTestId("buy-empty-payment-toggle"));

    expect(view.getByText("Didn't pay")).toBeTruthy();
    expect(view.getAllByDisplayValue("20.00").length).toBeGreaterThanOrEqual(2);
  });

  it("routes buy empty price shortcut to canonical price config route", async () => {
    const view = await renderOrder();

    fireEvent.press(view.getByText("Buy Empty"));
    fireEvent.press(view.getByTestId("buy-empty-update-iron-price"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/account/configuration/prices",
      params: { section: "ironBuyFromCustomer" },
    });
  });
});

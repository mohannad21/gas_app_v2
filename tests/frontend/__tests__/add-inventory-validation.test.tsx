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
}));

jest.mock("@/hooks/useCollections", () => ({
  useCollections: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCollection: () => ({ mutateAsync: jest.fn() }),
  useUpdateCollection: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: { company_money: 0, company_cyl_12: 0, company_cyl_48: 0 },
    isSuccess: true,
  }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock("@/hooks/useExpenses", () => ({
  useExpenses: () => ({ data: [], isLoading: false, error: null }),
  useCreateExpense: () => ({ mutateAsync: jest.fn() }),
  useDeleteExpense: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useBankDeposits", () => ({
  useBankDeposits: () => ({ data: [], isLoading: false, error: null }),
  useCreateBankDeposit: () => ({ mutateAsync: jest.fn() }),
  useDeleteBankDeposit: () => ({ mutate: jest.fn() }),
}));

const mockMutateAsync = jest.fn();
jest.mock("@/hooks/useInventory", () => ({
  useCreateRefill: () => ({ mutateAsync: mockMutateAsync }),
  useInitInventory: () => ({ mutateAsync: jest.fn() }),
  useInventorySnapshot: () => ({
    data: { full12: 10, empty12: 5, full48: 6, empty48: 3 },
  }),
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
  usePriceSettings: () => ({
    data: [
      {
        id: "p1",
        gas_type: "12kg",
        customer_type: "private",
        selling_price: 0,
        buying_price: 100,
        effective_from: "2024-12-01",
      },
      {
        id: "p2",
        gas_type: "48kg",
        customer_type: "private",
        selling_price: 0,
        buying_price: 200,
        effective_from: "2024-12-01",
      },
    ],
    isLoading: false,
    error: null,
  }),
  useSavePriceSetting: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/lib/addShortcut", () => ({
  consumeAddShortcut: () => null,
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("Add inventory validation", () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
  });

  it("renders date and time inputs without morning/evening toggle", () => {
    const { getByText, queryByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Inventory"));
    fireEvent.press(getByText("+ Add Inventory"));

    expect(getByText("Date & time")).toBeTruthy();
    expect(queryByText("Morning")).toBeNull();
    expect(queryByText("Evening")).toBeNull();
  });

  it("blocks save when returned empties exceed available", () => {
    const { getByText, getAllByPlaceholderText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Inventory"));
    fireEvent.press(getByText("+ Add Inventory"));

    const inputs = getAllByPlaceholderText("0");
    fireEvent.changeText(inputs[3], "7");

    fireEvent.press(getByText("Save"));

    expect(getByText("You only have 3 empty 48kg cylinders. You entered return=7.")).toBeTruthy();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("calculates total cost from buy prices", () => {
    const { getByText, getAllByPlaceholderText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Inventory"));
    fireEvent.press(getByText("+ Add Inventory"));

    const inputs = getAllByPlaceholderText("0");
    fireEvent.changeText(inputs[0], "2");
    fireEvent.changeText(inputs[2], "1");

    expect(getByText("Total cost: 400")).toBeTruthy();
  });
});

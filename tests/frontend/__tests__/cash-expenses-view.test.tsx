import React from "react";
import { Alert } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { act } from "react-test-renderer";

import AddChooserScreen from "@/app/(tabs)/add";

const mockCreateExpense = jest.fn();
const mockDeleteExpense = jest.fn();
const mockCreateDeposit = jest.fn();
const mockDeleteDeposit = jest.fn();

jest.mock("@/hooks/useOrders", () => ({
  useOrders: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteOrder: () => ({ mutate: jest.fn() }),
}));

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCustomer: () => ({ mutate: jest.fn() }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock("@/hooks/useExpenses", () => ({
  useExpenses: () => ({
    data: [
      {
        id: "e1",
        date: "2025-01-01",
        expense_type: "fuel",
        amount: 50,
        note: "test",
        created_at: "2025-01-01T09:00:00",
      },
    ],
    isLoading: false,
    error: null,
  }),
  useCreateExpense: () => ({ mutateAsync: mockCreateExpense }),
  useDeleteExpense: () => ({ mutate: mockDeleteExpense }),
}));

jest.mock("@/hooks/useBankDeposits", () => ({
  useBankDeposits: () => ({
    data: [
      {
        id: "d1",
        date: "2025-01-01",
        amount: 100,
        note: "bank",
        effective_at: "2025-01-01T12:00:00",
        created_at: "2025-01-01T12:00:00",
      },
    ],
    isLoading: false,
    error: null,
  }),
  useCreateBankDeposit: () => ({ mutateAsync: mockCreateDeposit }),
  useDeleteBankDeposit: () => ({ mutate: mockDeleteDeposit }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useCreateRefill: () => ({ mutateAsync: jest.fn() }),
  useInitInventory: () => ({ mutateAsync: jest.fn() }),
  useInventoryLatest: () => ({ data: null }),
  useInventorySnapshot: () => ({ data: null }),
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({ data: [], isLoading: false, error: null }),
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

describe("Cash & Expenses view", () => {
  beforeEach(() => {
    mockCreateExpense.mockReset();
    mockDeleteExpense.mockReset();
    mockCreateDeposit.mockReset();
    mockDeleteDeposit.mockReset();
  });

  it("switches modes and renders fields", () => {
    const { getByText, getAllByText, getAllByPlaceholderText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Expenses"));
    expect(getByText("Expense")).toBeTruthy();
    expect(getAllByText("Bank deposit").length).toBeGreaterThan(0);
    expect(getAllByPlaceholderText("0").length).toBeGreaterThan(0);
  });

  it("creates an expense and a bank deposit", async () => {
    const { getByText, getAllByText, getAllByPlaceholderText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Expenses"));
    fireEvent.changeText(getAllByPlaceholderText("0")[0], "25");
    await act(async () => {
      fireEvent.press(getByText("Save"));
    });
    expect(mockCreateExpense).toHaveBeenCalled();

    fireEvent.press(getAllByText("Bank deposit")[0]);
    fireEvent.changeText(getAllByPlaceholderText("0")[0], "80");
    await act(async () => {
      fireEvent.press(getByText("Save"));
    });
    expect(mockCreateDeposit).toHaveBeenCalled();
  });

  it("delete actions call correct endpoints", () => {
    const { getAllByLabelText, getByText } = render(<AddChooserScreen />);

    fireEvent.press(getByText("Expenses"));
    const deleteButtons = getAllByLabelText(/Remove/);
    fireEvent.press(deleteButtons[0]);
    fireEvent.press(deleteButtons[1]);
    expect(mockDeleteExpense).toHaveBeenCalled();
    expect(mockDeleteDeposit).toHaveBeenCalled();
  });

  it("shows Done accessory for keyboard", () => {
    const { getByText } = render(<AddChooserScreen />);
    fireEvent.press(getByText("Expenses"));
    expect(getByText("Done")).toBeTruthy();
  });
});

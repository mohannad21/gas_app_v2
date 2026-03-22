import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import NewExpenseScreen from "@/app/expenses/new";

jest.mock("@/hooks/useExpenses", () => ({
  useCreateExpense: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useBankDeposits", () => ({
  useCreateBankDeposit: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useReports", () => ({
  useDailyReportsV2: () => ({
    data: [{ cash_end: 100 }],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: mockReplace },
  useLocalSearchParams: () => ({}),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("NewExpenseScreen transfer tabs", () => {
  beforeEach(() => {
    mockReplace.mockReset();
  });

  it("shows fixed Expense, Wallet to Bank, and Bank to Wallet tabs only", () => {
    const { getByText, queryByText } = render(<NewExpenseScreen />);

    expect(getByText("Expense")).toBeTruthy();
    expect(getByText("Wallet to Bank")).toBeTruthy();
    expect(getByText("Bank to Wallet")).toBeTruthy();
    expect(queryByText("Bank deposit")).toBeNull();
  });

  it("updates the Bank to Wallet helper text and compact amount control", () => {
    const { getByDisplayValue, getByText } = render(<NewExpenseScreen />);

    fireEvent.press(getByText("Bank to Wallet"));
    fireEvent.changeText(getByDisplayValue("0"), "25");
    expect(
      getByText("You will have 125 shekels in the wallet after moving 25 from bank. (was 100)")
    ).toBeTruthy();

    fireEvent.press(getByText("+5"));
    expect(getByDisplayValue("30")).toBeTruthy();
  });

  it("switches to Bank to Wallet and prefills the shortfall from the inline prompt", () => {
    const { getByDisplayValue, getByText } = render(<NewExpenseScreen />);

    fireEvent.changeText(getByDisplayValue("0"), "150");
    fireEvent.press(getByText("Transfer now"));

    expect(getByDisplayValue("50")).toBeTruthy();
    expect(
      getByText("You will have 150 shekels in the wallet after moving 50 from bank. (was 100)")
    ).toBeTruthy();
  });
});

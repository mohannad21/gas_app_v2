import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

let mockInventoryParams: Record<string, string> = { section: "ledger", tab: "cash" };
let mockRouteParams: Record<string, string> = { customerId: "cust-1", systemId: "sys-1" };

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock("@/components/AddRefillModal", () => ({
  RefillForm: () => null,
}));

jest.mock("@/components/InlineWalletFundingPrompt", () => () => null);

jest.mock("@/components/entry/StandaloneField", () => {
  const React = require("react");
  const { View } = require("react-native");
  return ({ children }: { children: React.ReactNode }) => <View testID="standalone-field">{children}</View>;
});

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({
    data: [
      {
        id: "cust-1",
        name: "Alice",
        money_balance: 120,
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
      money_balance: 120,
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

jest.mock("@/hooks/useCash", () => ({
  useCashAdjustments: () => ({ data: [], isLoading: false, isError: false }),
  useCreateCashAdjustment: () => ({ mutateAsync: jest.fn().mockResolvedValue({}) }),
  useUpdateCashAdjustment: () => ({ mutateAsync: jest.fn().mockResolvedValue({}) }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useAdjustInventory: () => ({ mutateAsync: jest.fn().mockResolvedValue({}) }),
  useInventoryAdjustments: () => ({ data: [], isLoading: false, isError: false }),
  useInventoryLatest: () => ({
    data: { full12: 10, empty12: 5, full48: 6, empty48: 3 },
    isLoading: false,
  }),
  useInitInventory: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useInventoryRefillDetails: () => ({ data: null, isLoading: false }),
  useUpdateInventoryAdjustment: () => ({ mutateAsync: jest.fn().mockResolvedValue({}) }),
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: { company_money: 120, company_cyl_12: 0, company_cyl_48: 0 },
    isSuccess: true,
  }),
}));

jest.mock("@/hooks/useCompanyPayments", () => ({
  useCreateCompanyPayment: () => ({ mutateAsync: jest.fn().mockResolvedValue({}) }),
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
    data: [{ cash_end: 300 }],
    isLoading: false,
    isError: false,
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

import InventoryNewScreen from "@/app/inventory/new";
import NewOrderScreen from "@/app/orders/new";
import CashExpensesView from "@/components/CashExpensesView";

describe("shared standalone field pattern", () => {
  it("uses the shared standalone field in customer payment", async () => {
    mockRouteParams = { customerId: "cust-1", systemId: "sys-1" };
    const { getByText, getAllByTestId } = render(<NewOrderScreen />);

    fireEvent.press(getByText("Payment"));

    await waitFor(() => {
      expect(getByText("Paid")).toBeTruthy();
    });
    expect(getAllByTestId("standalone-field").length).toBeGreaterThan(0);
  });

  it("uses the shared standalone field in adjust wallet", async () => {
    mockInventoryParams = { section: "ledger", tab: "cash" };
    mockRouteParams = mockInventoryParams;
    const { getAllByTestId, getByText } = render(<InventoryNewScreen />);

    await waitFor(() => {
      expect(getByText("Adjust Wallet")).toBeTruthy();
    });
    fireEvent.press(getByText("Amount"));
    expect(getAllByTestId("standalone-field").length).toBeGreaterThan(0);
  });

  it("uses the shared standalone field in expense and transfer modes", () => {
    const noop = () => {};
    const setMode = jest.fn();
    const styles = new Proxy(
      {},
      {
        get: () => ({}),
      }
    ) as Record<string, any>;

    const baseProps = {
      cashBalance: 300,
      onRefreshCash: noop,
      onClose: noop,
      onTransferNow: noop,
      expenseDate: "2026-03-21",
      setExpenseDate: noop,
      expenseTime: "18:00",
      setExpenseTime: noop,
      expenseTimeOpen: false,
      setExpenseTimeOpen: noop,
      expenseCalendarOpen: false,
      setExpenseCalendarOpen: noop,
      setExpenseMode: setMode,
      expenseTypes: ["fuel", "food"],
      expenseType: "fuel",
      setExpenseType: noop,
      expenseAmount: "20",
      setExpenseAmount: noop,
      expenseNote: "",
      setExpenseNote: noop,
      transferAmount: "20",
      setTransferAmount: noop,
      transferNote: "",
      setTransferNote: noop,
      createExpense: { mutateAsync: jest.fn().mockResolvedValue({}) },
      createBankDeposit: { mutateAsync: jest.fn().mockResolvedValue({}) },
      CalendarModal: () => null,
      TimePickerModal: () => null,
      styles,
    };

    const expenseView = render(<CashExpensesView {...baseProps} expenseMode="expense" />);
    fireEvent.press(expenseView.getByText("Amount"));
    expect(expenseView.getAllByTestId("standalone-field").length).toBeGreaterThan(0);
    expenseView.unmount();

    const transferView = render(<CashExpensesView {...baseProps} expenseMode="wallet_to_bank" />);
    expect(transferView.getAllByTestId("standalone-field").length).toBeGreaterThan(0);
    transferView.unmount();

    const bankToWalletView = render(<CashExpensesView {...baseProps} expenseMode="bank_to_wallet" />);
    expect(bankToWalletView.getAllByTestId("standalone-field").length).toBeGreaterThan(0);
  });

  it("disables expense save actions while the expense mutation is pending", () => {
    const createExpense = { mutateAsync: jest.fn().mockResolvedValue({}), isPending: true };
    const styles = new Proxy(
      {},
      {
        get: () => ({}),
      }
    ) as Record<string, any>;

    const { getByText } = render(
      <CashExpensesView
        cashBalance={300}
        onRefreshCash={() => {}}
        onClose={() => {}}
        onTransferNow={() => {}}
        expenseDate="2026-03-21"
        setExpenseDate={() => {}}
        expenseTime="18:00"
        setExpenseTime={() => {}}
        expenseTimeOpen={false}
        setExpenseTimeOpen={() => {}}
        expenseCalendarOpen={false}
        setExpenseCalendarOpen={() => {}}
        expenseMode="expense"
        setExpenseMode={() => {}}
        expenseTypes={["fuel", "food"]}
        expenseType="fuel"
        setExpenseType={() => {}}
        expenseAmount="20"
        setExpenseAmount={() => {}}
        expenseNote=""
        setExpenseNote={() => {}}
        transferAmount="20"
        setTransferAmount={() => {}}
        transferNote=""
        setTransferNote={() => {}}
        createExpense={createExpense}
        createBankDeposit={{ mutateAsync: jest.fn().mockResolvedValue({}), isPending: false }}
        CalendarModal={() => null}
        TimePickerModal={() => null}
        styles={styles}
      />
    );

    expect(getByText("Saving...")).toBeTruthy();
    fireEvent.press(getByText("Saving..."));
    expect(createExpense.mutateAsync).not.toHaveBeenCalled();
  });
});

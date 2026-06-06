import React from "react";
import { Animated } from "react-native";
import { fireEvent, render, within } from "@testing-library/react-native";

import ReportsScreen from "@/app/(tabs)/reports";

const dayRow = {
  date: "2025-01-01",
  cash_start: 1000,
  cash_end: 900,
  sold_12kg: 3,
  sold_48kg: 1,
  net_today: -100,
  cash_math: {
    sales: 0,
    late: 0,
    expenses: 0,
    company: 0,
    adjust: 0,
    other: 0,
  },
  company_start: 0,
  company_end: 0,
  inventory_start: { full12: 10, empty12: 2, full48: 6, empty48: 1 },
  inventory_end: { full12: 9, empty12: 3, full48: 6, empty48: 1 },
  problems: [],
  problem_transitions: [],
  recalculated: false,
};

const makeEvent = (overrides: Record<string, unknown>) => ({
  effective_at: "2025-01-01T10:00:00Z",
  created_at: "2025-01-01T10:00:00Z",
  source_id: "event-1",
  balance_transitions: [],
  ...overrides,
});

const mockHookState = {
  v2Query: { isLoading: false, error: null, data: [dayRow] },
  v2Rows: [dayRow],
  v2Expanded: [],
  setV2Expanded: jest.fn(),
  v2DayByDate: {
    "2025-01-01": {
      date: "2025-01-01",
      cash_start: 1000,
      cash_end: 900,
      company_start: 0,
      company_end: 0,
      inventory_start: { full12: 10, empty12: 2, full48: 6, empty48: 1 },
      inventory_end: { full12: 9, empty12: 3, full48: 6, empty48: 1 },
      audit_summary: { cash_in: 0, new_debt: 0, inv_delta_12: 0, inv_delta_48: 0 },
      recalculated: false,
      events: [] as any[],
    },
  } as Record<string, any>,
  v2DayStatusByDate: { "2025-01-01": "success" as const },
  refetchV2: jest.fn(),
};

jest.mock("@/hooks/useDailyReportScreen", () => ({
  useDailyReportScreen: () => mockHookState,
}));

jest.mock("@/hooks/useBalancesSummary", () => ({
  useBalancesSummary: () => ({
    balanceSummary: {
      money: { receivable: { count: 0, total: 0 }, payable: { count: 0, total: 0 } },
      cyl12: { receivable: { count: 0, total: 0 }, payable: { count: 0, total: 0 } },
      cyl48: { receivable: { count: 0, total: 0 }, payable: { count: 0, total: 0 } },
    },
    companySummary: {
      give12: 0,
      receive12: 0,
      give48: 0,
      receive48: 0,
      payCash: 0,
      receiveCash: 0,
    },
    companyBalancesQuery: { data: null },
  }),
}));

jest.mock("@/hooks/useExpenses", () => ({
  useCreateExpense: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: () => {},
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

describe("ReportsScreen filters", () => {
  beforeEach(() => {
    mockHookState.v2DayByDate["2025-01-01"] = {
      date: "2025-01-01",
      cash_start: 1000,
      cash_end: 900,
      company_start: 0,
      company_end: 0,
      inventory_start: { full12: 10, empty12: 2, full48: 6, empty48: 1 },
      inventory_end: { full12: 9, empty12: 3, full48: 6, empty48: 1 },
      audit_summary: { cash_in: 0, new_debt: 0, inv_delta_12: 0, inv_delta_48: 0 },
      recalculated: false,
      events: [
        makeEvent({
          event_type: "replacement",
          source_id: "order-1",
          customer_name: "Osama",
          label: "Replacement",
          order_mode: "replacement",
          order_installed: 1,
          order_received: 0,
          gas_type: "12kg",
        }),
        makeEvent({
          event_type: "payment_from_customer",
          source_id: "collection-1",
          customer_name: "Adam",
          label: "Payment from customer",
          money_amount: 50,
        }),
        makeEvent({
          event_type: "payment_to_company",
          source_id: "company-payment-1",
          display_name: "Company",
          label: "Payment to company",
          money_amount: 200,
        }),
        makeEvent({
          event_type: "expense",
          source_id: "expense-1",
          expense_type: "Fuel",
          label: "Expense",
        }),
        makeEvent({
          event_type: "adjust_wallet",
          source_id: "cash-adjust-1",
          label: "Wallet adjustment",
          reason: "Manual wallet fix",
        }),
      ],
    };
    jest.spyOn(Animated, "timing").mockImplementation(
      ((value: Animated.Value, config: { toValue: number }) =>
        ({
          start: (callback?: (result: { finished: boolean }) => void) => {
            value.setValue(config.toValue);
            callback?.({ finished: true });
          },
        }) as Animated.CompositeAnimation) as typeof Animated.timing
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("replaces day summary with group and subtype filters", () => {
    const { getByText, queryByText, getByTestId } = render(<ReportsScreen />);
    const groupRow = within(getByTestId("reports-filter-groups"));

    expect(queryByText("Day summary")).toBeNull();
    expect(queryByText("All")).toBeNull();
    expect(groupRow.getByText("Customer")).toBeTruthy();
    expect(groupRow.getByText("Company")).toBeTruthy();
    expect(groupRow.getByText("Money")).toBeTruthy();
    expect(groupRow.getByText("Ledger")).toBeTruthy();
    expect(groupRow.getAllByText(/Customer|Company|Money|Ledger/).map((node) => node.props.children)).toEqual([
      "Customer",
      "Company",
      "Money",
      "Ledger",
    ]);

    fireEvent.press(groupRow.getByText("Customer"));
    const subtypeRow = getByTestId("reports-filter-subtypes");
    expect(within(subtypeRow).getByText("Replace")).toBeTruthy();
    expect(within(subtypeRow).getByText("Payment from customer")).toBeTruthy();
    expect(queryByText("Payment to company")).toBeNull();
  });

  it("filters the visible activity list by selected group", () => {
    const { getAllByText, getByText, queryByText } = render(<ReportsScreen />);

    expect(getAllByText("Replace").length).toBeGreaterThan(0);
    expect(getByText("Payment to company")).toBeTruthy();
    expect(getByText("Fuel")).toBeTruthy();

    fireEvent.press(getByText("Money"));

    expect(getByText("Fuel")).toBeTruthy();
    expect(queryByText("Replace")).toBeNull();
    expect(queryByText("Payment to company")).toBeNull();

    fireEvent.press(getByText("Money"));

    expect(getAllByText("Replace").length).toBeGreaterThan(0);
    expect(getByText("Payment to company")).toBeTruthy();
  });

  it("hides empty filter groups when the selected day only has one kind of activity", () => {
    mockHookState.v2DayByDate["2025-01-01"] = {
      ...mockHookState.v2DayByDate["2025-01-01"],
      events: [
        makeEvent({
          event_type: "replacement",
          source_id: "order-only-1",
          customer_name: "Osama",
          label: "Replacement",
          order_mode: "replacement",
          order_installed: 1,
          order_received: 0,
          gas_type: "12kg",
        }),
      ],
    };

    const { queryByTestId } = render(<ReportsScreen />);

    expect(queryByTestId("reports-filter-groups")).toBeNull();
  });
});

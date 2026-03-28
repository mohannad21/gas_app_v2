import React from "react";
import { Animated } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import ReportsScreen from "@/app/(tabs)/reports";

const mockRouter = { push: jest.fn() };

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

const dayDetail = {
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
    {
      event_type: "expense",
      effective_at: "2025-01-01T14:09:00Z",
      created_at: "2025-01-01T14:09:00Z",
      source_id: "expense-1",
      expense_type: "fuel",
      label: "Expense",
      display_name: "Expense",
      hero_text: "Paid 100",
      cash_before: 900,
      cash_after: 800,
      balance_transitions: [],
    },
  ],
};

const mockGetDailyReportV2 = jest.fn();

jest.mock("@/hooks/useDailyReportScreen", () => ({
  useDailyReportScreen: () => ({
    v2Query: { isLoading: false, error: null, data: [dayRow] },
    v2Rows: [dayRow],
    v2Expanded: [],
    setV2Expanded: jest.fn(),
    v2DayByDate: { "2025-01-01": dayDetail },
    v2DayStatusByDate: { "2025-01-01": "success" },
    refetchV2: jest.fn(),
  }),
}));

jest.mock("@/hooks/useBalancesSummary", () => ({
  useBalancesSummary: () => ({
    balanceSummary: {
      money: { receivable: { count: 2, total: 500 }, payable: { count: 1, total: 120 } },
      cyl12: { receivable: { count: 1, total: 3 }, payable: { count: 0, total: 0 } },
      cyl48: { receivable: { count: 1, total: 1 }, payable: { count: 1, total: 2 } },
    },
    companySummary: {
      give12: 0,
      receive12: 4,
      give48: 1,
      receive48: 0,
      payCash: 200,
      receiveCash: 0,
    },
    companyBalancesQuery: { data: { company_cyl_12: 4, company_cyl_48: -1, company_money: 200 } },
    refetchCustomers: jest.fn(),
  }),
}));

jest.mock("@/hooks/useExpenses", () => ({
  useCreateExpense: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getDailyReportV2: (...args: unknown[]) => mockGetDailyReportV2(...args),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  router: {
    push: (...args: unknown[]) => mockRouter.push(...args),
  },
  useLocalSearchParams: () => ({}),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: () => {},
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

describe("ReportsScreen reveal controls", () => {
  const scrollEvent = (y: number) => ({
    nativeEvent: {
      contentOffset: { y, x: 0 },
      contentSize: { height: 1200, width: 390 },
      layoutMeasurement: { height: 700, width: 390 },
    },
  });

  beforeEach(() => {
    jest.useFakeTimers();
    mockRouter.push.mockReset();
    mockGetDailyReportV2.mockReset();
    mockGetDailyReportV2.mockResolvedValue(dayDetail);
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
    jest.useRealTimers();
  });

  it("starts hidden and reveals only the top bar with no default shelf selected", () => {
    const { getByTestId, getByText, queryByText } = render(<ReportsScreen />);

    expect(mockGetDailyReportV2).not.toHaveBeenCalled();

    expect(getByTestId("reports-reveal-layer").props.pointerEvents).toBe("none");
    expect(getByTestId("reports-quick-actions").props.pointerEvents).toBe("none");

    fireEvent.scroll(getByTestId("reports-activity-list"), scrollEvent(120));
    fireEvent.scroll(getByTestId("reports-activity-list"), scrollEvent(40));

    expect(getByTestId("reports-reveal-layer").props.pointerEvents).toBe("auto");
    expect(getByTestId("reports-quick-actions").props.pointerEvents).toBe("none");
    expect(getByText("Ledger")).toBeTruthy();
    expect(queryByText("Adjust Inventory")).toBeNull();
    expect(queryByText("Customer Balances")).toBeNull();
    expect(queryByText("Company Balances")).toBeNull();

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(getByTestId("reports-quick-actions").props.pointerEvents).toBe("auto");
  });

  it("does not reveal on slow upward browsing", () => {
    const { getByTestId } = render(<ReportsScreen />);

    fireEvent.scroll(getByTestId("reports-activity-list"), scrollEvent(120));

    act(() => {
      jest.advanceTimersByTime(260);
    });
    fireEvent.scroll(getByTestId("reports-activity-list"), scrollEvent(104));

    act(() => {
      jest.advanceTimersByTime(260);
    });
    fireEvent.scroll(getByTestId("reports-activity-list"), scrollEvent(88));

    expect(getByTestId("reports-reveal-layer").props.pointerEvents).toBe("none");
    expect(getByTestId("reports-quick-actions").props.pointerEvents).toBe("none");
  });

  it("switches reused sections and routes the three quick actions", () => {
    const { getByTestId, getByText } = render(<ReportsScreen />);

    fireEvent.scroll(getByTestId("reports-activity-list"), scrollEvent(120));
    fireEvent.scroll(getByTestId("reports-activity-list"), scrollEvent(40));

    act(() => {
      jest.advanceTimersByTime(200);
    });

    fireEvent.press(getByText("Ledger"));
    expect(getByText("Adjust Inventory")).toBeTruthy();
    fireEvent.press(getByText("Ledger"));

    fireEvent.press(getByText("Customers"));
    expect(getByText("Customer Balances")).toBeTruthy();
    expect(getByText("Money debt")).toBeTruthy();

    fireEvent.press(getByText("Company"));
    expect(getByText("Company Balances")).toBeTruthy();
    expect(getByText("Adjust balances")).toBeTruthy();

    fireEvent.press(getByTestId("reports-quick-replacement"));
    expect(mockRouter.push).toHaveBeenCalledWith("/orders/new");

    fireEvent.press(getByTestId("reports-quick-refill"));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/inventory/new",
      params: { section: "company", tab: "refill" },
    });

    fireEvent.press(getByTestId("reports-quick-expense"));
    expect(mockRouter.push).toHaveBeenCalledWith("/expenses/new");
  });
});

import React from "react";
import { Animated } from "react-native";
import { render } from "@testing-library/react-native";

import ReportsScreen from "@/app/(tabs)/reports";

const mockHookState = {
  v2Query: { isLoading: false, error: null, data: [{ date: "2025-01-01" }] },
  v2Rows: [
    {
      date: "2025-01-01",
      cash_start: 100,
      cash_end: 100,
      sold_12kg: 0,
      sold_48kg: 0,
      net_today: 0,
      cash_math: { sales: 0, late: 0, expenses: 0, company: 0, adjust: 0, other: 0 },
      company_start: 0,
      company_end: 0,
      inventory_start: { full12: 0, empty12: 0, full48: 0, empty48: 0 },
      inventory_end: { full12: 0, empty12: 0, full48: 0, empty48: 0 },
      problems: [],
      problem_transitions: [],
      recalculated: false,
    },
  ],
  v2Expanded: [],
  setV2Expanded: jest.fn(),
  v2DayByDate: {} as Record<string, any>,
  v2DayStatusByDate: {} as Record<string, "loading" | "error" | "success">,
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

describe("ReportsScreen day activity state", () => {
  beforeEach(() => {
    mockHookState.v2DayByDate = {};
    mockHookState.v2DayStatusByDate = {};
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

  it("shows loading activities while the selected day is still loading", () => {
    mockHookState.v2DayStatusByDate = { "2025-01-01": "loading" };

    const { getByText } = render(<ReportsScreen />);

    expect(getByText("Loading activities...")).toBeTruthy();
  });

  it("shows a load failure message when the selected day fetch fails", () => {
    mockHookState.v2DayStatusByDate = { "2025-01-01": "error" };

    const { getByText } = render(<ReportsScreen />);

    expect(getByText("Failed to load activities.")).toBeTruthy();
  });
});

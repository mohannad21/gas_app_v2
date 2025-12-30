import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import ReportsScreen from "@/app/(tabs)/reports";

const expectedDate = "2025-01-01";

jest.mock("@/hooks/useReports", () => {
  const dailyReportsData: any[] = [];
  const v2Cards = [
    {
      date: "2025-01-01",
      cash_start: 1000,
      cash_end: 1200,
      company_start: 50,
      company_end: 200,
      inventory_start: { full12: 10, empty12: 2, full48: 5, empty48: 1 },
      inventory_end: { full12: 8, empty12: 4, full48: 6, empty48: 0 },
      problems: ["Missing cash", "Low stock"],
      recalculated: true,
    },
    {
      date: "2025-01-02",
      cash_start: 1200,
      cash_end: 1200,
      company_start: 0,
      company_end: 0,
      inventory_start: { full12: 8, empty12: 4, full48: 6, empty48: 0 },
      inventory_end: { full12: 8, empty12: 4, full48: 6, empty48: 0 },
      problems: [],
      recalculated: false,
    },
  ];
  return {
    useDailyReports: () => ({ data: dailyReportsData, isLoading: false, error: null, refetch: jest.fn() }),
    useDailyReportsV2: () => ({ data: v2Cards, isLoading: false, error: null, refetch: jest.fn() }),
  };
});

jest.mock("@/hooks/useInventory", () => {
  const refillsData: any[] = [];
  return {
    useCreateRefill: () => ({ mutateAsync: jest.fn() }),
    useAdjustInventory: () => ({ mutateAsync: jest.fn() }),
    useInventoryRefills: () => ({ data: refillsData }),
    useInventoryRefillDetails: () => ({ data: null, isLoading: false }),
    useUpdateRefill: () => ({ mutateAsync: jest.fn() }),
  };
});

jest.mock("@/hooks/useExpenses", () => {
  const expensesData: any[] = [];
  return {
    useCreateExpense: () => ({ mutateAsync: jest.fn() }),
    useDeleteExpense: () => ({ mutateAsync: jest.fn() }),
    useExpenses: () => ({ data: expensesData, isLoading: false, error: null }),
  };
});

jest.mock("@/hooks/usePrices", () => {
  const pricesData: any[] = [];
  return {
    usePriceSettings: () => ({ data: pricesData }),
  };
});

jest.mock("@/hooks/useOrders", () => ({
  useOrdersByDay: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock("@/lib/addShortcut", () => ({
  setAddShortcut: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  getDailyReportV2: jest.fn().mockResolvedValue({
    date: "2025-01-01",
    cash_start: 1000,
    cash_end: 1200,
    company_start: 50,
    company_end: 200,
    recalculated: true,
    inventory_start: { full12: 10, empty12: 2, full48: 5, empty48: 1 },
    inventory_end: { full12: 8, empty12: 4, full48: 6, empty48: 0 },
    events: [
      {
        event_type: "refill",
        effective_at: "2025-01-01T08:00:00Z",
        source_id: "r1",
        label: "Refill",
        cash_before: 1000,
        cash_after: 800,
        company_before: 50,
        company_after: 200,
        inventory_before: { full12: 10, empty12: 2, full48: 5, empty48: 1 },
        inventory_after: { full12: 12, empty12: 0, full48: 7, empty48: 0 },
      },
      {
        event_type: "company_payment",
        effective_at: "2025-01-01T10:00:00Z",
        source_id: "cp1",
        label: "Company Payment",
        cash_before: 800,
        cash_after: 750,
        company_before: 200,
        company_after: 150,
      },
    ],
  }),
  getInventoryDay: jest.fn().mockResolvedValue({ business_date: "2025-01-01", business_tz: "UTC", summaries: [], events: [] }),
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

describe("ReportsScreen New Approach tab", () => {
  it("renders tab labels without breaking classic view", () => {
    const { getByText } = render(<ReportsScreen />);
    expect(getByText("Classic")).toBeTruthy();
    expect(getByText("Quick")).toBeTruthy();
    expect(getByText("New Approach")).toBeTruthy();
  });

  it("renders bookend values in the New Approach collapsed card", () => {
    const { getByText } = render(<ReportsScreen />);
    fireEvent.press(getByText("New Approach"));

    expect(getByText("Cash Total")).toBeTruthy();
    expect(getByText("Open 1000")).toBeTruthy();
    expect(getByText("12kg")).toBeTruthy();
    expect(getByText("48kg")).toBeTruthy();
    expect(getByText("FULL")).toBeTruthy();
    expect(getByText("EMPTY")).toBeTruthy();
  });

  it("hides payable line when company end is zero", () => {
    const { getByText, queryAllByText } = render(<ReportsScreen />);
    fireEvent.press(getByText("New Approach"));

    expect(queryAllByText("To Company").length).toBe(1);
  });

  it("renders stacked timeline lines in the New Approach expand view", async () => {
    const { getByText, getAllByText, queryByText } = render(<ReportsScreen />);
    fireEvent.press(getByText("New Approach"));
    fireEvent.press(getByText(new RegExp(expectedDate)));

    await waitFor(() => expect(queryByText("Timeline")).toBeTruthy());
    expect(getByText("Cash")).toBeTruthy();
    expect(getAllByText("To Company").length).toBeGreaterThan(0);
    expect(getByText("12kg Full")).toBeTruthy();
    expect(getByText("48kg Full")).toBeTruthy();
    expect(getByText("This day was recalculated.")).toBeTruthy();
  });

  it("shows the recalculated badge when the flag is true", () => {
    const { getByText } = render(<ReportsScreen />);
    fireEvent.press(getByText("New Approach"));

    expect(getByText("Sync Update")).toBeTruthy();
  });
});

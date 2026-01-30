import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import ReportsScreen from "@/app/(tabs)/reports";

const mockUpdateRefill = jest.fn();
const refillsData = [
  {
    refill_id: "refill_123",
    date: "2025-01-02",
    time_of_day: "morning",
    buy12: 2,
    return12: 3,
    buy48: 1,
    return48: 2,
  },
];

jest.mock("@/hooks/useReports", () => {
  const dailyReportsData = [
    {
      date: "2025-01-02",
      display: "2025-01-02",
      installed12: 0,
      received12: 0,
      installed48: 0,
      received48: 0,
      expected: 0,
      received: 0,
      inventory_start: {
        as_of: "2025-01-02T00:00:00Z",
        full12: 50,
        empty12: 10,
        total12: 60,
        full48: 20,
        empty48: 5,
        total48: 25,
      },
      inventory_end: {
        as_of: "2025-01-02T23:59:59Z",
        full12: 52,
        empty12: 7,
        total12: 59,
        full48: 21,
        empty48: 3,
        total48: 24,
      },
      orders: [],
    },
  ];
  return {
    useDailyReports: () => ({ data: dailyReportsData, isLoading: false, error: null, refetch: jest.fn() }),
    useDailyReportsV2: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  };
});

jest.mock("@/hooks/useInventory", () => ({
  useCreateRefill: () => ({ mutateAsync: jest.fn() }),
  useAdjustInventory: () => ({ mutateAsync: jest.fn() }),
  useInventoryRefills: () => ({ data: refillsData }),
  useInventoryRefillDetails: () => ({
    data: {
      refill_id: "refill_123",
      business_date: "2025-01-02",
      time_of_day: "morning",
      effective_at: "2025-01-02T09:00:00Z",
      buy12: 2,
      return12: 3,
      buy48: 1,
      return48: 2,
      total_cost: 0,
      paid_now: 0,
      before_full_12: 50,
      before_empty_12: 10,
      after_full_12: 52,
      after_empty_12: 7,
      before_full_48: 20,
      before_empty_48: 5,
      after_full_48: 21,
      after_empty_48: 3,
    },
    isLoading: false,
  }),
  useUpdateRefill: () => ({ mutateAsync: mockUpdateRefill }),
}));

jest.mock("@/hooks/useExpenses", () => ({
  useCreateExpense: () => ({ mutateAsync: jest.fn() }),
  useDeleteExpense: () => ({ mutateAsync: jest.fn() }),
  useExpenses: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock("@/hooks/useOrders", () => ({
  useOrdersByDay: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({ data: [] }),
}));

jest.mock("@/lib/addShortcut", () => ({
  setAddShortcut: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  getDailyReportV2: jest.fn(),
  getInventoryDay: jest.fn(),
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

describe("ReportsScreen refill edit", () => {
  beforeEach(() => {
    mockUpdateRefill.mockReset();
  });

  it("loads time-correct before values from refill details", async () => {
    const { getByText, getByTestId, queryByText } = render(<ReportsScreen />);

    fireEvent.press(getByText(/2025-01-02/));
    fireEvent.press(getByTestId("refill-edit-2025-01-02"));

    await waitFor(() =>
      expect(
        queryByText("Inventory: 12kg Full 50 - Empty 10 - 48kg Full 20 - Empty 5")
      ).toBeTruthy()
    );
  });

  it("saves refill edits via update endpoint", async () => {
    const { getByText, getByTestId } = render(<ReportsScreen />);

    fireEvent.press(getByText(/2025-01-02/));
    fireEvent.press(getByTestId("refill-edit-2025-01-02"));

    fireEvent.press(getByText("Save"));

    await waitFor(() =>
      expect(mockUpdateRefill).toHaveBeenCalledWith({
        refillId: "refill_123",
        buy12: 2,
        return12: 3,
        buy48: 1,
        return48: 2,
        total_cost: 0,
      })
    );
  });
});

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import ReportsScreen from "@/app/(tabs)/reports";

const dayRow = {
  date: "2025-01-01",
  cash_start: 1000,
  cash_end: 900,
  company_start: 0,
  company_end: 0,
  inventory_start: { full12: 10, empty12: 2, full48: 6, empty48: 1 },
  inventory_end: { full12: 9, empty12: 3, full48: 6, empty48: 1 },
  problems: [],
  recalculated: false,
};

const orderEvent = {
  event_type: "order",
  effective_at: "2025-01-01T08:00:00Z",
  created_at: "2025-01-01T08:00:00Z",
  source_id: "order-1",
  gas_type: "12kg",
  order_mode: "replacement",
  order_installed: 1,
  order_received: 0,
  order_total: 500,
  order_paid: 500,
  customer_id: "cust-1",
  customer_name: "Acme",
  cash_before: 1000,
  cash_after: 900,
  inventory_before: { full12: 10, empty12: 2, full48: 0, empty48: 0 },
  inventory_after: { full12: 9, empty12: 3, full48: 0, empty48: 0 },
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
  events: [orderEvent],
};

jest.mock("@/hooks/useReports", () => ({
  useDailyReportsV2: () => ({
    data: [dayRow],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    dataUpdatedAt: Date.now(),
  }),
}));

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({ data: [], refetch: jest.fn() }),
}));

jest.mock("@/hooks/useExpenses", () => ({
  useCreateExpense: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getDailyReportV2: jest.fn().mockResolvedValue(dayDetail),
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

describe("ReportsScreen expanded DeltaBox", () => {
  it("renders three DeltaBox blocks for 12kg replacement when expanded", async () => {
    const { getByText, queryByText } = render(<ReportsScreen />);

    fireEvent.press(getByText(/2025-01-01/));

    await waitFor(() => expect(getByText("Installed 1x12kg")).toBeTruthy());

    expect(queryByText("12kg F")).toBeNull();

    fireEvent.press(getByText("Installed 1x12kg"));

    await waitFor(() => expect(getByText("12kg F")).toBeTruthy());
    expect(getByText("12kg E")).toBeTruthy();
    expect(getByText("Cash")).toBeTruthy();
  });
});

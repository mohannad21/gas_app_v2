import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import ReportsScreen from "@/app/(tabs)/reports";

const dayRow = {
  date: "2025-01-01",
  cash_start: 1000,
  cash_end: 900,
  sold_12kg: 0,
  sold_48kg: 0,
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
      event_type: "collection_money",
      effective_at: "2025-01-01T07:30:00Z",
      created_at: "2025-01-01T07:30:00Z",
      source_id: "pay-1",
      customer_id: "cust-1",
      customer_name: "Acme",
      hero_text: "Received ₪150",
      cash_before: 1000,
      cash_after: 1150,
      customer_money_before: 200,
      customer_money_after: 50,
      balance_transitions: [],
    },
    {
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
      customer_money_before: 0,
      customer_money_after: 0,
      customer_12kg_before: 0,
      customer_12kg_after: 1,
      customer_48kg_before: 0,
      customer_48kg_after: 0,
      inventory_before: { full12: 10, empty12: 2, full48: 0, empty48: 0 },
      inventory_after: { full12: 9, empty12: 3, full48: 0, empty48: 0 },
      balance_transitions: [],
    },
    {
      event_type: "collection_empty",
      effective_at: "2025-01-01T08:30:00Z",
      created_at: "2025-01-01T08:30:00Z",
      source_id: "return-group-1",
      customer_id: "cust-1",
      customer_name: "Acme",
      return12: 1,
      return48: 3,
      hero_text: "Returned 1x12kg | 3x48kg empties",
      cash_before: 1150,
      cash_after: 1150,
      customer_12kg_before: 2,
      customer_12kg_after: 1,
      customer_48kg_before: 5,
      customer_48kg_after: 2,
      inventory_before: { full12: 9, empty12: 3, full48: 6, empty48: 1 },
      inventory_after: { full12: 9, empty12: 4, full48: 6, empty48: 4 },
      balance_transitions: [],
    },
    {
      event_type: "company_payment",
      effective_at: "2025-01-01T09:00:00Z",
      created_at: "2025-01-01T09:00:00Z",
      source_id: "cp-1",
      label: "Pay Company",
      cash_before: 900,
      cash_after: 800,
      company_before: 100,
      company_after: 50,
      company_12kg_before: 0,
      company_12kg_after: 0,
      company_48kg_before: 0,
      company_48kg_after: 0,
      balance_transitions: [],
    },
    {
      event_type: "company_buy_iron",
      effective_at: "2025-01-01T10:00:00Z",
      created_at: "2025-01-01T10:00:00Z",
      source_id: "cbi-1",
      hero_text: "Bought 2x12kg",
      buy12: 2,
      buy48: 0,
      cash_before: 800,
      cash_after: 700,
      company_before: 0,
      company_after: 120,
      company_12kg_before: 0,
      company_12kg_after: 0,
      company_48kg_before: 0,
      company_48kg_after: 0,
      inventory_before: { full12: 9, empty12: 3, full48: 0, empty48: 0 },
      inventory_after: { full12: 11, empty12: 3, full48: 0, empty48: 0 },
      balance_transitions: [],
    },
    {
      event_type: "refill",
      effective_at: "2025-01-01T11:00:00Z",
      created_at: "2025-01-01T11:00:00Z",
      source_id: "refill-1",
      label: "Refill",
      buy12: 0,
      return12: 1,
      buy48: 2,
      return48: 0,
      cash_before: 700,
      cash_after: 650,
      company_before: 0,
      company_after: 80,
      company_12kg_before: 0,
      company_12kg_after: -1,
      company_48kg_before: 0,
      company_48kg_after: 2,
      inventory_before: { full12: 11, empty12: 3, full48: 6, empty48: 1 },
      inventory_after: { full12: 11, empty12: 2, full48: 8, empty48: 1 },
      balance_transitions: [],
    },
    {
      event_type: "bank_deposit",
      effective_at: "2025-01-01T12:00:00Z",
      created_at: "2025-01-01T12:00:00Z",
      source_id: "deposit-1",
      hero_text: "Transferred ₪500 to bank",
      cash_before: 650,
      cash_after: 150,
      bank_before: 0,
      bank_after: 500,
      balance_transitions: [],
    },
  ],
};

jest.mock("@/hooks/useDailyReportScreen", () => ({
  useDailyReportScreen: () => ({
    v2Query: { isLoading: false, error: null },
    v2Rows: [dayRow],
    v2Expanded: ["2025-01-01"],
    setV2Expanded: jest.fn(),
    v2DayByDate: { "2025-01-01": dayDetail },
    setV2DayByDate: jest.fn(),
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
    companyBalancesQuery: { isSuccess: true },
    refetchV2: jest.fn(),
    refetchCustomers: jest.fn(),
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
}));

const rowChildTestIds = (node: any) =>
  React.Children.toArray(node.props.children)
    .map((child: any) => child?.props?.testID)
    .filter(Boolean);

describe("ReportsScreen expanded DeltaBox", () => {
  it("renders customer operational boxes in full-empty-wallet order", () => {
    const { getByText, getAllByText, getByTestId } = render(<ReportsScreen />);

    expect(getByText("Installed 1x12kg")).toBeTruthy();

    fireEvent.press(getByText("Installed 1x12kg"));

    expect(getAllByText("12kg F").length).toBeGreaterThan(0);
    expect(getAllByText("12kg E").length).toBeGreaterThan(0);
    expect(getAllByText("Wallet").length).toBeGreaterThan(0);
    expect(rowChildTestIds(getByTestId("12kg-triplet"))).toEqual(["12kg-full", "12kg-empty", "12kg-cash"]);
  });

  it("renders company relationship boxes for company payment and buy iron", () => {
    const { getAllByText } = render(<ReportsScreen />);

    fireEvent.press(getAllByText("Pay Company")[0]);
    expect(getAllByText("Wallet").length).toBeGreaterThan(0);

    fireEvent.press(getAllByText("Bought 2x12kg")[0]);
    expect(getAllByText("12kg F").length).toBeGreaterThan(0);
  });

  it("renders customer relationship boxes for payment and grouped return", () => {
    const { getAllByText } = render(<ReportsScreen />);

    fireEvent.press(getAllByText("Received ₪150")[0]);
    expect(getAllByText("Wallet").length).toBeGreaterThan(0);

    fireEvent.press(getAllByText("Returned 1x12kg | 3x48kg empties")[0]);
    expect(getAllByText("12kg E").length).toBeGreaterThan(0);
    expect(getAllByText("48kg E").length).toBeGreaterThan(0);
  });

  it("renders split company relationship result on fixed 2-2-1 rows", () => {
    const { getAllByText, getByTestId } = render(<ReportsScreen />);

    fireEvent.press(getAllByText("Refill")[0]);
    expect(getAllByText("12kg E").length).toBeGreaterThan(0);
    expect(getAllByText("48kg F").length).toBeGreaterThan(0);
    expect(rowChildTestIds(getByTestId("mixed-12-row"))).toEqual(["mixed-12-full", "mixed-12-empty"]);
    expect(rowChildTestIds(getByTestId("mixed-48-row"))).toEqual(["mixed-48-full", "mixed-48-empty"]);
    expect(rowChildTestIds(getByTestId("mixed-cash-row"))).toEqual([
      "mixed-cash-left",
      "mixed-cash",
      "mixed-cash-right",
    ]);
  });

  it("renders bank deposit as a centered wallet-only row", () => {
    const { getAllByText, getByTestId, queryByText } = render(<ReportsScreen />);

    fireEvent.press(getAllByText("Transferred ₪500 to bank")[0]);
    expect(getAllByText("Wallet").length).toBeGreaterThan(0);
    expect(rowChildTestIds(getByTestId("bank_deposit-cash-row"))).toEqual([
      "bank_deposit-cash-left",
      "bank_deposit-cash",
      "bank_deposit-cash-right",
    ]);
    expect(queryByText("Received ₪500")).toBeNull();
  });
});

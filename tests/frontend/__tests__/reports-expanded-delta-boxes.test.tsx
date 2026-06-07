import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
      event_type: "payment_from_customer",
      effective_at: "2025-01-01T07:30:00Z",
      created_at: "2025-01-01T07:30:00Z",
      source_id: "pay-1",
      customer_id: "cust-1",
      customer_name: "Acme",
      hero_text: "Received ₪150",
      cash_before: 1000,
      cash_after: 1150,
      wallet_before: 1000,
      wallet_after: 1150,
      customer_money_before: 200,
      customer_money_after: 50,
      balance_transitions: [],
    },
    {
      event_type: "replacement",
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
      wallet_before: 1000,
      wallet_after: 900,
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
      event_type: "customer_return_empties",
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
      wallet_before: 1150,
      wallet_after: 1150,
      customer_12kg_before: 2,
      customer_12kg_after: 1,
      customer_48kg_before: 5,
      customer_48kg_after: 2,
      inventory_before: { full12: 9, empty12: 3, full48: 6, empty48: 1 },
      inventory_after: { full12: 9, empty12: 4, full48: 6, empty48: 4 },
      balance_transitions: [],
    },
    {
      event_type: "payment_to_company",
      effective_at: "2025-01-01T09:00:00Z",
      created_at: "2025-01-01T09:00:00Z",
      source_id: "cp-1",
      label: "Pay Company",
      hero_text: "Payment to company",
      cash_before: 900,
      cash_after: 800,
      wallet_before: 900,
      wallet_after: 800,
      company_before: 100,
      company_after: 50,
      company_12kg_before: 0,
      company_12kg_after: 0,
      company_48kg_before: 0,
      company_48kg_after: 0,
      balance_transitions: [],
    },
    {
      event_type: "buy_full_from_company",
      effective_at: "2025-01-01T10:00:00Z",
      created_at: "2025-01-01T10:00:00Z",
      source_id: "cbi-1",
      hero_text: "Bought 2x12kg",
      buy12: 2,
      buy48: 0,
      cash_before: 800,
      cash_after: 700,
      wallet_before: 800,
      wallet_after: 700,
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
      wallet_before: 700,
      wallet_after: 650,
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
      event_type: "wallet_to_bank",
      effective_at: "2025-01-01T12:00:00Z",
      created_at: "2025-01-01T12:00:00Z",
      source_id: "deposit-1",
      hero_text: "Transferred ₪500 to bank",
      cash_before: 650,
      cash_after: 150,
      wallet_before: 650,
      wallet_after: 150,
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
    v2DayStatusByDate: { "2025-01-01": "success" },
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
    companyBalancesQuery: { data: { company_money: 0, company_cyl_12: 0, company_cyl_48: 0 }, isSuccess: true },
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

const rowChildTestIds = (node: any) =>
  React.Children.toArray(node.props.children)
    .map((child: any) => child?.props?.testID)
    .filter(Boolean);

function renderReportsScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportsScreen />
    </QueryClientProvider>
  );
}

describe("ReportsScreen expanded DeltaBox", () => {
  it("renders customer operational boxes in full-empty-wallet order", () => {
    const { getByText, getAllByText, getByTestId } = renderReportsScreen();

    expect(getByText("Installed: 1x 12kg")).toBeTruthy();

    fireEvent.press(getByText("Installed: 1x 12kg"));

    expect(getAllByText("12kg Full").length).toBeGreaterThan(0);
    expect(getAllByText("12kg Empty").length).toBeGreaterThan(0);
    expect(getAllByText("Wallet").length).toBeGreaterThan(0);
    expect(rowChildTestIds(getByTestId("12kg-triplet"))).toEqual(["12kg-full", "12kg-empty", "12kg-cash"]);
  });

  it("renders company relationship boxes for company payment and buy iron", () => {
    const { getAllByText } = renderReportsScreen();

    fireEvent.press(getAllByText("Payment to company")[0]);
    expect(getAllByText("Wallet").length).toBeGreaterThan(0);

    fireEvent.press(getAllByText("Bought: 2x 12kg")[0]);
    expect(getAllByText("12kg Full").length).toBeGreaterThan(0);
  });

  it("renders customer relationship boxes for payment and grouped return", () => {
    const { getAllByText, getByTestId } = renderReportsScreen();

    fireEvent.press(getAllByText("Received ₪150")[0]);
    expect(getAllByText("Wallet").length).toBeGreaterThan(0);

    fireEvent.press(getAllByText("Returned 1x12kg | 3x48kg empties")[0]);
    expect(getAllByText("Wallet").length).toBeGreaterThan(0);
    expect(rowChildTestIds(getByTestId("customer_return_empties-cash-row"))).toEqual([
      "customer_return_empties-cash-left",
      "customer_return_empties-cash",
      "customer_return_empties-cash-right",
    ]);
  });

  it("renders split company relationship result on fixed 2-2-1 rows", () => {
    const { getAllByText, getByTestId } = renderReportsScreen();

    fireEvent.press(getAllByText("Refill")[0]);
    expect(getAllByText("12kg Empty").length).toBeGreaterThan(0);
    expect(getAllByText("48kg Full").length).toBeGreaterThan(0);
    expect(rowChildTestIds(getByTestId("refill-mixed-12-row"))).toEqual(["refill-mixed-12-full", "refill-mixed-12-empty"]);
    expect(rowChildTestIds(getByTestId("refill-mixed-48-row"))).toEqual(["refill-mixed-48-full", "refill-mixed-48-empty"]);
    expect(rowChildTestIds(getByTestId("refill-mixed-cash-row"))).toEqual([
      "refill-mixed-cash-left",
      "refill-mixed-cash",
      "refill-mixed-cash-right",
    ]);
  });

  it("renders bank deposit as a centered wallet-only row", () => {
    const { getAllByText, getByTestId, queryByText } = renderReportsScreen();

    fireEvent.press(getAllByText("Transferred ₪500 to bank")[0]);
    expect(getAllByText("Wallet").length).toBeGreaterThan(0);
    expect(rowChildTestIds(getByTestId("wallet_to_bank-cash-row"))).toEqual([
      "wallet_to_bank-cash-left",
      "wallet_to_bank-cash",
      "wallet_to_bank-cash-right",
    ]);
    expect(queryByText("Received ₪500")).toBeNull();
  });
});

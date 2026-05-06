import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import CustomersHomeScreen from "@/app/(tabs)/customers-home";
import { AddCustomersSection } from "@/app/(tabs)/add";

const mockPush = jest.fn();

let mockCustomersData: any[] = [];
let mockSystemsData: any[] = [];

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({
    data: mockCustomersData,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useDeleteCustomer: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useOrders", () => ({
  useOrders: () => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({
    data: mockSystemsData,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("expo-router", () => ({
  router: { push: mockPush, replace: jest.fn() },
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("@/components/customers/CustomersTabBalances", () => () => null);

function makeCustomer(overrides: Record<string, unknown>) {
  return {
    id: "cust-default",
    name: "Default Customer",
    note: "",
    address: "Unknown",
    phone: "",
    money_balance: 0,
    cylinder_balance_12kg: 0,
    cylinder_balance_48kg: 0,
    order_count: 0,
    created_at: "2026-05-01T10:00:00Z",
    ...overrides,
  };
}

function makeSystem(overrides: Record<string, unknown>) {
  return {
    id: "sys-default",
    customer_id: "cust-default",
    is_active: true,
    requires_security_check: false,
    next_security_check_at: null,
    ...overrides,
  };
}

describe("Customers tab filters", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockCustomersData = [
      makeCustomer({
        id: "cust-money-debt",
        name: "Money Debt",
        note: "Route North",
        address: "Alpha street",
        phone: "111",
        money_balance: 120,
        cylinder_balance_12kg: 2,
        cylinder_balance_48kg: -1,
      }),
      makeCustomer({
        id: "cust-money-credit",
        name: "Money Credit",
        note: "Route South",
        address: "Beta street",
        phone: "222",
        money_balance: -80,
        cylinder_balance_12kg: -3,
        cylinder_balance_48kg: 4,
      }),
      makeCustomer({
        id: "cust-active-implicit",
        name: "Implicit Active",
        note: "Warehouse lane",
        address: "Gamma street",
        phone: "333",
      }),
      makeCustomer({
        id: "cust-inactive",
        name: "Inactive Systems",
        note: "Needs follow-up",
        address: "Delta street",
        phone: "444",
      }),
      makeCustomer({
        id: "cust-security-required",
        name: "Security Required",
        note: "Check due soon",
        address: "Epsilon street",
        phone: "555",
      }),
      makeCustomer({
        id: "cust-no-systems",
        name: "No Systems",
        note: "Fresh lead",
        address: "Zeta street",
        phone: "666",
      }),
    ];
    mockSystemsData = [
      makeSystem({
        id: "sys-active-implicit",
        customer_id: "cust-active-implicit",
        is_active: undefined,
      }),
      makeSystem({
        id: "sys-inactive-explicit",
        customer_id: "cust-inactive",
        is_active: false,
      }),
      makeSystem({
        id: "sys-security-required",
        customer_id: "cust-security-required",
        is_active: true,
        requires_security_check: true,
        next_security_check_at: "2026-05-03",
      }),
    ];
  });

  it("shows second-level filters only after choosing a top filter and resets the sub-filter when top filter changes", async () => {
    const view = render(<CustomersHomeScreen />);

    expect(view.queryAllByText("Debt").length).toBe(0);

    fireEvent.press(view.getByText("Money"));
    expect(view.getByText("Debt")).toBeTruthy();

    fireEvent.press(view.getByText("Debt"));
    await waitFor(() => {
      expect(view.getByText("Money Debt")).toBeTruthy();
      expect(view.queryByText("Money Credit")).toBeNull();
    });

    fireEvent.press(view.getByText("12kg"));
    await waitFor(() => {
      expect(view.getByText("Money Debt")).toBeTruthy();
      expect(view.getByText("Money Credit")).toBeTruthy();
    });
  });

  it("filters systems active/inactive using the same active semantics as the rest of the app", async () => {
    const view = render(<AddCustomersSection topFilter="systems" subFilter="active" />);

    await waitFor(() => {
      expect(view.getByText("Implicit Active")).toBeTruthy();
      expect(view.getByText("Security Required")).toBeTruthy();
      expect(view.queryByText("Inactive Systems")).toBeNull();
      expect(view.queryByText("No Systems")).toBeNull();
    });

    view.rerender(<AddCustomersSection topFilter="systems" subFilter="inactive" />);

    await waitFor(() => {
      expect(view.getByText("Inactive Systems")).toBeTruthy();
      expect(view.getByText("No Systems")).toBeTruthy();
      expect(view.queryByText("Implicit Active")).toBeNull();
      expect(view.queryByText("Security Required")).toBeNull();
    });
  });

  it("combines search with filters", async () => {
    const view = render(<AddCustomersSection searchQuery="south" topFilter="money" subFilter="credit" />);

    await waitFor(() => {
      expect(view.getByText("Money Credit")).toBeTruthy();
      expect(view.queryByText("Money Debt")).toBeNull();
      expect(view.queryByText("Implicit Active")).toBeNull();
    });
  });

  it("filters security check required and not required correctly", async () => {
    const view = render(<AddCustomersSection topFilter="security_check" subFilter="required" />);

    await waitFor(() => {
      expect(view.getByText("Security Required")).toBeTruthy();
      expect(view.queryByText("Money Debt")).toBeNull();
      expect(view.queryByText("No Systems")).toBeNull();
    });

    view.rerender(<AddCustomersSection topFilter="security_check" subFilter="not_required" />);

    await waitFor(() => {
      expect(view.getByText("Money Debt")).toBeTruthy();
      expect(view.getByText("No Systems")).toBeTruthy();
      expect(view.queryByText("Security Required")).toBeNull();
    });
  });

  it("shows only the matching pill family for a focused top filter", async () => {
    const view = render(<AddCustomersSection topFilter="money" />);

    await waitFor(() => {
      expect(view.getByText("Debts on customer 120.00 $")).toBeTruthy();
      expect(view.queryByText("Debts on customer 2x 12kg")).toBeNull();
      expect(view.queryByText("Credit for customer 1x 48kg")).toBeNull();
      expect(view.queryByText("Needs check")).toBeNull();
    });
  });

  it("uses the correct empty-state copy for no data vs filtered no-match", async () => {
    mockCustomersData = [];
    mockSystemsData = [];

    const emptyView = render(<AddCustomersSection />);
    await waitFor(() => {
      expect(emptyView.getByText("No customers yet.")).toBeTruthy();
    });

    const filteredView = render(<AddCustomersSection searchQuery="missing" />);
    await waitFor(() => {
      expect(filteredView.getByText("No customers match these filters.")).toBeTruthy();
    });
  });
});

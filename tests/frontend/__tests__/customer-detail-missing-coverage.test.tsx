import React from "react";
import { Alert } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import CustomerDetailsScreen from "@/app/customers/[id]";

const mockRouterPush = jest.fn();
let mockOpenURL: jest.Mock;
const mockOrdersRefetch = jest.fn();
const mockCollectionsRefetch = jest.fn();
const mockAdjustmentsRefetch = jest.fn();
const mockDeleteOrderMutate = jest.fn();
const mockDeleteCollectionMutate = jest.fn();
const mockDeleteAdjustmentMutate = jest.fn();

let mockCustomersLoading = false;
let mockCustomersData: any[] = [];
let mockBalanceData: any = null;
let mockOrdersData: any[] = [];
let mockOrdersLoading = false;
let mockOrdersFetching = false;
let mockOrdersError: any = null;
let mockCollectionsData: any[] = [];
let mockCollectionsLoading = false;
let mockCollectionsFetching = false;
let mockCollectionsError: any = null;
let mockAdjustmentsData: any[] = [];
let mockAdjustmentsLoading = false;
let mockAdjustmentsFetching = false;
let mockAdjustmentsError: any = null;
let mockSystemsData: any[] = [];
let mockSystemsLoading = false;

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "cust-1" }),
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));

jest.mock("expo-linking", () => ({
  openURL: jest.fn(() => Promise.resolve()),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require("react");
    React.useEffect(() => cb(), [cb]);
  },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("@/constants/gas", () => ({
  gasColor: jest.fn(() => "#000"),
}));

jest.mock("@/lib/date", () => ({
  formatDateTimeMedium: jest.fn((value: string) => value),
  formatDateTimeYMDHM: jest.fn((value: string) => value),
}));

jest.mock("@/lib/money", () => ({
  formatDisplayMoney: jest.fn((value: number) => Number(value).toFixed(2)),
  getCurrencySymbol: jest.fn(() => "$"),
  getMoneyDecimals: jest.fn(() => 2),
}));

jest.mock("@/hooks/useCustomers", () => ({
  CUSTOMER_DELETE_BLOCKED_MESSAGE: "blocked",
  isCustomerDeleteBlockedError: jest.fn(() => false),
  useCustomers: () => ({
    data: mockCustomersData,
    isLoading: mockCustomersLoading,
    refetch: jest.fn(),
  }),
  useCustomerBalance: () => ({
    data: mockBalanceData,
  }),
  useCustomerAdjustments: () => ({
    data: mockAdjustmentsData,
    isLoading: mockAdjustmentsLoading,
    isFetching: mockAdjustmentsFetching,
    error: mockAdjustmentsError,
    refetch: mockAdjustmentsRefetch,
  }),
  useDeleteCustomerAdjustment: () => ({ mutate: mockDeleteAdjustmentMutate }),
  useDeleteCustomer: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCollections", () => ({
  useCollections: () => ({
    data: mockCollectionsData,
    isLoading: mockCollectionsLoading,
    isFetching: mockCollectionsFetching,
    error: mockCollectionsError,
    refetch: mockCollectionsRefetch,
  }),
  useDeleteCollection: () => ({ mutate: mockDeleteCollectionMutate }),
}));

jest.mock("@/hooks/useOrders", () => ({
  useOrders: () => ({
    data: mockOrdersData,
    isLoading: mockOrdersLoading,
    isFetching: mockOrdersFetching,
    error: mockOrdersError,
    refetch: mockOrdersRefetch,
  }),
  useDeleteOrder: () => ({ mutate: mockDeleteOrderMutate }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({
    data: mockSystemsData,
    isLoading: mockSystemsLoading,
    refetch: jest.fn(),
  }),
  useDeleteSystem: () => ({ mutateAsync: jest.fn() }),
}));

function makeCustomer(overrides: any = {}) {
  return {
    id: "cust-1",
    name: "Test Customer",
    note: "Regular route",
    address: "Main street",
    phone: "+1 (555) 123-4567",
    money_balance: 120,
    cylinder_balance_12kg: 2,
    cylinder_balance_48kg: -1,
    order_count: 1,
    ...overrides,
  };
}

function makeOrder(overrides: any = {}) {
  return {
    id: "order-1",
    customer_id: "cust-1",
    system_id: "sys-1",
    order_mode: "replacement",
    gas_type: "12kg",
    cylinders_installed: 1,
    cylinders_received: 0,
    price_total: 100,
    paid_amount: 40,
    debt_cash: 60,
    debt_cylinders_12: 1,
    debt_cylinders_48: 0,
    delivered_at: "2026-05-01T09:00:00Z",
    created_at: "2026-05-01T09:00:00Z",
    is_deleted: false,
    ...overrides,
  };
}

function makeCollection(overrides: any = {}) {
  return {
    id: "collection-1",
    customer_id: "cust-1",
    action_type: "payment",
    amount_money: 30,
    debt_cash: 30,
    debt_cylinders_12: 1,
    debt_cylinders_48: 0,
    effective_at: "2026-05-02T10:00:00Z",
    created_at: "2026-05-02T10:00:00Z",
    note: null,
    ...overrides,
  };
}

function makeAdjustment(overrides: any = {}) {
  return {
    id: "adjustment-1",
    customer_id: "cust-1",
    amount_money: 20,
    count_12kg: -1,
    count_48kg: 0,
    debt_cash: 50,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    reason: "Correction",
    effective_at: "2026-05-03T11:00:00Z",
    created_at: "2026-05-03T11:00:00Z",
    ...overrides,
  };
}

function confirmAlertDelete() {
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
  const deleteButton = buttons.find((button) => button.text === "Delete");
  deleteButton?.onPress?.();
}

describe("Customer detail missing coverage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenURL = require("expo-linking").openURL as jest.Mock;
    mockOpenURL.mockClear();
    mockCustomersLoading = false;
    mockCustomersData = [makeCustomer()];
    mockBalanceData = {
      customer_id: "cust-1",
      money_balance: 120,
      cylinder_balance_12kg: 2,
      cylinder_balance_48kg: -1,
    };
    mockOrdersData = [];
    mockOrdersLoading = false;
    mockOrdersFetching = false;
    mockOrdersError = null;
    mockCollectionsData = [];
    mockCollectionsLoading = false;
    mockCollectionsFetching = false;
    mockCollectionsError = null;
    mockAdjustmentsData = [];
    mockAdjustmentsLoading = false;
    mockAdjustmentsFetching = false;
    mockAdjustmentsError = null;
    mockSystemsData = [{ id: "sys-1", name: "Main system", gas_type: "12kg", is_active: true }];
    mockSystemsLoading = false;
    jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows customer loading and missing-customer states before customer detail content", () => {
    mockCustomersLoading = true;
    mockCustomersData = [];

    const loading = render(<CustomerDetailsScreen />);

    expect(loading.getByText("Loading...")).toBeTruthy();
    expect(loading.queryByText("Customer Balances")).toBeNull();

    loading.unmount();
    mockCustomersLoading = false;
    mockCustomersData = [];

    const missing = render(<CustomerDetailsScreen />);

    expect(missing.getByText("Customer not found.")).toBeTruthy();
    expect(missing.queryByText("Customer Balances")).toBeNull();
  });

  it("renders header profile data, last order, and customer actions from customer-level state", () => {
    mockOrdersData = [
      makeOrder({ id: "replacement-old", delivered_at: "2026-05-01T09:00:00Z" }),
      makeOrder({
        id: "sell-full-newer",
        order_mode: "sell_iron",
        gas_type: "48kg",
        delivered_at: "2026-05-03T09:00:00Z",
      }),
      makeOrder({
        id: "buy-empty-newest",
        order_mode: "buy_iron",
        delivered_at: "2026-05-04T09:00:00Z",
      }),
    ];

    const { getByLabelText, getByText } = render(<CustomerDetailsScreen />);

    expect(getByText("Phone")).toBeTruthy();
    expect(getByText("+1 (555) 123-4567")).toBeTruthy();
    expect(getByText("Last order")).toBeTruthy();
    expect(getByText("2026-05-03T09:00:00Z")).toBeTruthy();

    fireEvent.press(getByLabelText("Edit customer"));
    expect(mockRouterPush).toHaveBeenCalledWith("/customers/cust-1/edit");

    fireEvent.press(getByLabelText("Add order for customer"));
    expect(mockRouterPush).toHaveBeenCalledWith("/orders/new?customerId=cust-1");

    fireEvent.press(getByLabelText("WhatsApp customer"));
    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    const url = mockOpenURL.mock.calls[0][0] as string;
    expect(url).toContain("https://wa.me/+15551234567?text=");
    expect(decodeURIComponent(url.split("text=")[1])).toContain("current balance is 120.00 $");
  });

  it("renders activity list loading, error, empty, and refreshing states for customer activity history", () => {
    mockOrdersLoading = true;

    const loading = render(<CustomerDetailsScreen />);

    expect(loading.getByText("Loading activities...")).toBeTruthy();

    loading.unmount();
    mockOrdersLoading = false;
    mockCollectionsError = new Error("collections failed");

    const error = render(<CustomerDetailsScreen />);

    expect(error.getByText("Could not load customer activities.")).toBeTruthy();

    error.unmount();
    mockCollectionsError = null;

    const empty = render(<CustomerDetailsScreen />);

    expect(empty.getByText("0 shown")).toBeTruthy();
    expect(empty.getByText("No activities match this filter yet.")).toBeTruthy();

    empty.unmount();
    mockOrdersFetching = true;

    const refreshing = render(<CustomerDetailsScreen />);

    expect(refreshing.getByText("Refreshing...")).toBeTruthy();
  });

  it("wires delete actions for customer order, collection, and adjustment activity families", () => {
    mockOrdersData = [makeOrder({ id: "order-delete" })];
    const order = render(<CustomerDetailsScreen />);

    fireEvent.press(order.getByLabelText("Delete"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Delete order?",
      "This will reverse the order and update related balances.",
      expect.any(Array)
    );
    confirmAlertDelete();
    expect(mockDeleteOrderMutate).toHaveBeenCalledWith("order-delete");

    order.unmount();
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
    mockOrdersData = [];
    mockCollectionsData = [makeCollection({ id: "collection-delete" })];

    const collection = render(<CustomerDetailsScreen />);

    fireEvent.press(collection.getByLabelText("Delete"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Delete collection?",
      "This will remove the collection and update related balances.",
      expect.any(Array)
    );
    confirmAlertDelete();
    expect(mockDeleteCollectionMutate).toHaveBeenCalledWith("collection-delete");

    collection.unmount();
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
    mockCollectionsData = [];
    mockAdjustmentsData = [makeAdjustment({ id: "adjustment-delete" })];

    const adjustment = render(<CustomerDetailsScreen />);

    fireEvent.press(adjustment.getByLabelText("Delete"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Delete adjustment?",
      "This will reverse the balance adjustment and update the customer's ledger.",
      expect.any(Array)
    );
    confirmAlertDelete();
    expect(mockDeleteAdjustmentMutate).toHaveBeenCalledWith({ id: "adjustment-delete", customerId: "cust-1" });
  });
});

import React from "react";
import { Alert } from "react-native";
import { act } from "react-test-renderer";
import { fireEvent, render } from "@testing-library/react-native";

import { AddCustomersSection } from "@/app/(tabs)/add";
import CustomerDetailsScreen from "@/app/customers/[id]";
import { CUSTOMER_DELETE_BLOCKED_MESSAGE } from "@/hooks/useCustomers";

const mockDeleteCustomerMutateAsync = jest.fn();
const mockPush = jest.fn();

let mockCustomersData = [
  {
    id: "cust-1",
    name: "Test Customer",
    note: "Regular route",
    address: "Main street",
    phone: "123456",
    money_balance: 120,
    cylinder_balance_12kg: -2,
    cylinder_balance_48kg: 3,
    order_count: 2,
    created_at: "2026-03-16T10:00:00",
  },
];
let mockOrdersData: any[] = [];
let deleteCustomerError: any = null;

jest.mock("@/hooks/useCustomers", () => {
  const actual = jest.requireActual("@/hooks/useCustomers");
  return {
    ...actual,
    useCustomers: () => ({
      data: mockCustomersData,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    }),
    useCustomerBalance: () => ({
      data: {
        customer_id: "cust-1",
        money_balance: 120,
        cylinder_balance_12kg: -2,
        cylinder_balance_48kg: 3,
      },
    }),
    useCustomerAdjustments: () => ({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    }),
    useAllCustomerAdjustments: () => ({
      data: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    }),
    useDeleteCustomer: () => ({ mutateAsync: mockDeleteCustomerMutateAsync }),
  };
});

jest.mock("@/hooks/useOrders", () => ({
  useOrders: () => ({
    data: mockOrdersData,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  }),
  useDeleteOrder: () => ({ mutate: jest.fn() }),
}));

jest.mock("@/hooks/useCollections", () => ({
  useCollections: () => ({
    data: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  }),
  useDeleteCollection: () => ({ mutateAsync: jest.fn() }),
  useUpdateCollection: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useDeleteSystem: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCompanyPayments", () => ({
  useCompanyPayments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

jest.mock("@/hooks/useBalancesSummary", () => ({
  useBalancesSummary: () => ({
    companySummary: null,
    companyBalancesQuery: { refetch: jest.fn() },
  }),
}));

jest.mock("@/hooks/useBankDeposits", () => ({
  useBankDeposits: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteBankDeposit: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useCash", () => ({
  useCashAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteCashAdjustment: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useExpenses", () => ({
  useExpenses: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteExpense: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useInventoryAdjustments: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useInventoryRefills: () => ({ data: [], isLoading: false, error: null, refetch: jest.fn() }),
  useDeleteInventoryAdjustment: () => ({ mutateAsync: jest.fn() }),
  useDeleteRefill: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({ data: [], isLoading: false, error: null }),
  useSavePriceSetting: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/lib/addShortcut", () => ({
  consumeAddShortcut: () => null,
}));

jest.mock("expo-router", () => ({
  router: { push: mockPush, replace: jest.fn() },
  useLocalSearchParams: () => ({ id: "cust-1" }),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock("expo-linking", () => ({
  openURL: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("Customer delete rule alignment", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockDeleteCustomerMutateAsync.mockReset();
    mockDeleteCustomerMutateAsync.mockImplementation(async () => {
      if (deleteCustomerError) {
        throw deleteCustomerError;
      }
    });
    mockCustomersData = [
      {
        id: "cust-1",
        name: "Test Customer",
        note: "Regular route",
        address: "Main street",
        phone: "123456",
        money_balance: 120,
        cylinder_balance_12kg: -2,
        cylinder_balance_48kg: 3,
        order_count: 2,
        created_at: "2026-03-16T10:00:00",
      },
    ];
    mockOrdersData = [];
    deleteCustomerError = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("allows the add-screen delete flow to proceed even when order_count is non-zero", async () => {
    const { getByLabelText, getByText, queryByText } = render(
      <AddCustomersSection searchQuery="" topFilter="all" subFilter="all" />
    );

    fireEvent(getByLabelText("Remove customer"), "press", { stopPropagation: jest.fn() });

    expect(getByText("Delete customer?")).toBeTruthy();
    expect(
      queryByText(
        "You cannot delete this customer while they still have orders. Remove or reassign their orders first."
      )
    ).toBeNull();

    await act(async () => {
      fireEvent.press(getByText("Delete"));
    });

    expect(mockDeleteCustomerMutateAsync).toHaveBeenCalledWith("cust-1");
  });

  it("shows transaction-based delete messaging on the add screen when the backend blocks deletion", async () => {
    deleteCustomerError = {
      response: {
        status: 409,
        data: { detail: "customer_has_transactions" },
      },
    };

    const { getByLabelText, getByText, queryByText } = render(
      <AddCustomersSection searchQuery="" topFilter="all" subFilter="all" />
    );

    fireEvent(getByLabelText("Remove customer"), "press", { stopPropagation: jest.fn() });

    await act(async () => {
      fireEvent.press(getByText("Delete"));
    });

    expect(getByText(CUSTOMER_DELETE_BLOCKED_MESSAGE)).toBeTruthy();
    expect(
      queryByText(
        "You cannot delete this customer while they still have orders. Remove or reassign their orders first."
      )
    ).toBeNull();
  });

  it("does not block customer-detail deletion from local order-count prechecks", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const { getByLabelText } = render(<CustomerDetailsScreen />);

    fireEvent.press(getByLabelText("Remove customer"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Delete customer?",
      "This will remove the customer from the list.",
      expect.any(Array)
    );

    const confirmButtons = alertSpy.mock.calls[0][2] as Array<{ text?: string; onPress?: () => Promise<void> | void }>;
    const deleteButton = confirmButtons.find((button) => button.text === "Delete");

    await act(async () => {
      await deleteButton?.onPress?.();
    });

    expect(mockDeleteCustomerMutateAsync).toHaveBeenCalledWith("cust-1");
  });

  it("shows transaction-based delete messaging on the customer detail screen when the backend blocks deletion", async () => {
    deleteCustomerError = {
      response: {
        status: 409,
        data: { detail: "customer_has_transactions" },
      },
    };
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const { getByLabelText } = render(<CustomerDetailsScreen />);

    fireEvent.press(getByLabelText("Remove customer"));

    const confirmButtons = alertSpy.mock.calls[0][2] as Array<{ text?: string; onPress?: () => Promise<void> | void }>;
    const deleteButton = confirmButtons.find((button) => button.text === "Delete");

    await act(async () => {
      await deleteButton?.onPress?.();
    });

    expect(alertSpy).toHaveBeenNthCalledWith(
      2,
      "Cannot delete customer",
      CUSTOMER_DELETE_BLOCKED_MESSAGE
    );
  });
});

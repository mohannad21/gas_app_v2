import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

let mockCustomerBalance = {
  money_balance: 120,
  cylinder_balance_12kg: 0,
  cylinder_balance_48kg: 0,
};
let mockNextCustomerBalance: typeof mockCustomerBalance | null = null;
const mockBalanceSubscribers = new Set<
  React.Dispatch<
    React.SetStateAction<{
      money_balance: number;
      cylinder_balance_12kg: number;
      cylinder_balance_48kg: number;
    }>
  >
>();

const mockCreateCollection = jest.fn();
const mockBuildHappenedAt = jest.fn(() => "2025-01-10T17:21:00.000Z");
const mockRouterReplace = jest.fn();
const mockCustomerBalanceRefetch = jest.fn(async () => {
  if (mockNextCustomerBalance) {
    mockCustomerBalance = mockNextCustomerBalance;
    mockNextCustomerBalance = null;
  }
  mockBalanceSubscribers.forEach((update) => update(mockCustomerBalance));
  return { data: mockCustomerBalance };
});

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: mockRouterReplace },
  useLocalSearchParams: () => ({ customerId: "cust-1", systemId: "sys-1" }),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("@/lib/date", () => {
  const actual = jest.requireActual("@/lib/date");
  return {
    ...actual,
    buildHappenedAt: (...args: unknown[]) => mockBuildHappenedAt(...args),
  };
});

jest.mock("@/hooks/useCustomers", () => {
  const React = jest.requireActual("react");
  return {
    useCustomers: () => ({
      data: [
        {
          id: "cust-1",
          name: "Alice",
          money_balance: mockCustomerBalance.money_balance,
          cylinder_balance_12kg: mockCustomerBalance.cylinder_balance_12kg,
          cylinder_balance_48kg: mockCustomerBalance.cylinder_balance_48kg,
        },
      ],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    }),
    useCustomerBalance: () => {
      const [data, setData] = React.useState(mockCustomerBalance);
      React.useEffect(() => {
        mockBalanceSubscribers.add(setData);
        setData(mockCustomerBalance);
        return () => {
          mockBalanceSubscribers.delete(setData);
        };
      }, []);
      return {
        data,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: mockCustomerBalanceRefetch,
      };
    },
  };
});

jest.mock("@/hooks/useOrders", () => ({
  useCreateOrder: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/useCollections", () => ({
  useCreateCollection: () => ({ mutateAsync: mockCreateCollection, isPending: false }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useInventoryLatest: () => ({
    data: { full12: 10, empty12: 5, full48: 6, empty48: 3 },
    isLoading: false,
  }),
  useInitInventory: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({
    data: [
      {
        id: "price-1",
        gas_type: "12kg",
        selling_price: 75,
        buying_price: 60,
        effective_from: "2026-01-01T00:00:00Z",
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/hooks/useReports", () => ({
  useDailyReportsV2: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({
    data: [{ id: "sys-1", name: "Main kitchen", gas_type: "12kg", is_active: true }],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/components/InlineWalletFundingPrompt", () => () => null);

import NewOrderScreen from "@/app/orders/new";

describe("NewOrderScreen collection request_id forwarding", () => {
  beforeEach(() => {
    mockCreateCollection.mockReset();
    mockCreateCollection.mockResolvedValue({ id: "collection-1" });
    mockBuildHappenedAt.mockClear();
    mockRouterReplace.mockReset();
    mockCustomerBalanceRefetch.mockClear();
    mockBalanceSubscribers.clear();
    mockCustomerBalance = {
      money_balance: 120,
      cylinder_balance_12kg: 0,
      cylinder_balance_48kg: 0,
    };
    mockNextCustomerBalance = null;
  });

  it("generates and submits request_id for payment saves", async () => {
    const { getByText } = render(<NewOrderScreen />);

    fireEvent.press(getByText("Payment"));
    fireEvent.press(getByText("Receive all"));
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(mockCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: "cust-1",
          action_type: "payment",
          request_id: expect.any(String),
          effective_at: "2025-01-10T17:21:00.000Z",
        })
      );
    });
  });

  it("generates and submits request_id for return saves", async () => {
    mockCustomerBalance = {
      money_balance: 120,
      cylinder_balance_12kg: 2,
      cylinder_balance_48kg: 0,
    };

    const { getByText } = render(<NewOrderScreen />);

    fireEvent.press(getByText("Return"));
    fireEvent.press(getByText("Return all"));
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(mockCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: "cust-1",
          action_type: "return",
          request_id: expect.any(String),
          effective_at: "2025-01-10T17:21:00.000Z",
        })
      );
    });
  });

  it("refreshes the payment preview after save and add more before the next payment", async () => {
    mockNextCustomerBalance = {
      money_balance: 80,
      cylinder_balance_12kg: 0,
      cylinder_balance_48kg: 0,
    };

    const { getByText } = render(<NewOrderScreen />);

    fireEvent.press(getByText("Payment"));
    fireEvent.press(getByText("+20"));
    fireEvent.press(getByText("+20"));
    fireEvent.press(getByText("Save & Add More"));

    await waitFor(() => {
      expect(mockCreateCollection).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          customer_id: "cust-1",
          action_type: "payment",
          amount_money: 40,
          debt_cash: 80,
        })
      );
    });

    await waitFor(() => {
      expect(mockCustomerBalanceRefetch).toHaveBeenCalledTimes(1);
      expect(getByText("Customer owes you 80")).toBeTruthy();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(getByText("Save & Add More")).toBeTruthy();

    mockNextCustomerBalance = {
      money_balance: 0,
      cylinder_balance_12kg: 0,
      cylinder_balance_48kg: 0,
    };
    fireEvent.press(getByText("Receive all"));
    fireEvent.press(getByText("Save & Add More"));

    await waitFor(() => {
      expect(mockCreateCollection).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          customer_id: "cust-1",
          action_type: "payment",
          amount_money: 80,
          debt_cash: 0,
        })
      );
    });
  });

  it("refreshes the return preview after save and add more before the next return", async () => {
    mockCustomerBalance = {
      money_balance: 120,
      cylinder_balance_12kg: 3,
      cylinder_balance_48kg: 0,
    };
    mockNextCustomerBalance = {
      money_balance: 120,
      cylinder_balance_12kg: 1,
      cylinder_balance_48kg: 0,
    };

    const { getByText } = render(<NewOrderScreen />);

    fireEvent.press(getByText("Return"));
    fireEvent.press(getByText("+1"));
    fireEvent.press(getByText("Save & Add More"));

    await waitFor(() => {
      expect(mockCreateCollection).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          customer_id: "cust-1",
          action_type: "return",
          qty_12kg: 2,
          debt_cylinders_12: 1,
        })
      );
    });

    await waitFor(() => {
      expect(mockCustomerBalanceRefetch).toHaveBeenCalledTimes(1);
      expect(getByText("Customer owes you 1 12kg empty cylinder")).toBeTruthy();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(getByText("Save & Add More")).toBeTruthy();

    mockNextCustomerBalance = {
      money_balance: 120,
      cylinder_balance_12kg: 0,
      cylinder_balance_48kg: 0,
    };
    fireEvent.press(getByText("Return all"));
    fireEvent.press(getByText("Save & Add More"));

    await waitFor(() => {
      expect(mockCreateCollection).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          customer_id: "cust-1",
          action_type: "return",
          qty_12kg: 1,
          debt_cylinders_12: 0,
        })
      );
    });
  });
});

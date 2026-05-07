import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

let mockParams: Record<string, string> = { customerId: "cust-1", systemId: "sys-1" };

jest.mock("expo-router", () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(false),
  };
  return {
    __esModule: true,
    router,
    useLocalSearchParams: () => mockParams,
  };
});

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock("@/components/AddRefillModal", () => ({
  RefillForm: () => null,
}));

jest.mock("@/components/InlineWalletFundingPrompt", () => () => null);

jest.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({
    data: [
      {
        id: "cust-1",
        name: "Alice",
        money_balance: 0,
        cylinder_balance_12kg: 0,
        cylinder_balance_48kg: 0,
      },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useCustomerBalance: () => ({
    data: {
      money_balance: 0,
      cylinder_balance_12kg: 0,
      cylinder_balance_48kg: 0,
    },
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/hooks/useOrders", () => ({
  useCreateOrder: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/useCollections", () => ({
  useCreateCollection: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useInventoryLatest: () => ({
    data: { full12: 10, empty12: 5, full48: 6, empty48: 3 },
    isLoading: false,
  }),
  useInitInventory: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAdjustInventory: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useInventoryAdjustments: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
  useInventoryRefillDetails: () => ({ data: null, isLoading: false }),
  useUpdateInventoryAdjustment: () => ({ mutateAsync: jest.fn(), isPending: false }),
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
    data: [{ cash_end: 0 }],
    isLoading: false,
    error: null,
    isError: false,
  }),
}));

jest.mock("@/hooks/useSystems", () => ({
  useSystems: () => ({
    data: [{ id: "sys-1", name: "Main kitchen", gas_type: "12kg", is_active: true }],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: { company_money: 0, company_cyl_12: 0, company_cyl_48: 0 },
    isSuccess: true,
  }),
  useCompanyBalanceAdjustments: () => ({ data: [], isLoading: false, refetch: jest.fn() }),
}));

jest.mock("@/hooks/useCompanyPayments", () => ({
  useCreateCompanyPayment: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/useCash", () => ({
  useCashAdjustments: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
  useCreateCashAdjustment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateCashAdjustment: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import InventoryNewScreen from "@/app/inventory/new";
import NewOrderScreen from "@/app/orders/new";
import { router as expoRouter } from "expo-router";

describe("balance adjustment entry points", () => {
  beforeEach(() => {
    (expoRouter.push as jest.Mock).mockClear();
  });

  it("opens customer balance adjustment from the add-customer flow", () => {
    mockParams = { customerId: "cust-1", systemId: "sys-1" };
    const { getByText } = render(<NewOrderScreen />);

    fireEvent.press(getByText("Adjust balances"));

    expect(expoRouter.push).toHaveBeenCalledWith("/customers/cust-1/edit?tab=balances");
  });

  it("opens company balance adjustment from the add-company flow", () => {
    mockParams = { section: "company", tab: "refill" };
    const { getByText } = render(<InventoryNewScreen />);

    fireEvent.press(getByText("Adjust balances"));

    expect(expoRouter.push).toHaveBeenCalledWith("/inventory/company-balance-adjust");
  });
});

import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

let mockParams: Record<string, string> = { section: "company", tab: "payment" };
let mockCreateCompanyPaymentPending = false;
const mockCreateCompanyPaymentMutateAsync = jest.fn().mockResolvedValue({});

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
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

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: { company_money: 120, company_cyl_12: 0, company_cyl_48: 0 },
    isSuccess: true,
  }),
}));

jest.mock("@/hooks/useCompanyPayments", () => ({
  useCreateCompanyPayment: () => ({
    mutateAsync: mockCreateCompanyPaymentMutateAsync,
    isPending: mockCreateCompanyPaymentPending,
  }),
}));

jest.mock("@/hooks/useCash", () => ({
  useCashAdjustments: () => ({ data: [], isLoading: false, isError: false }),
  useCreateCashAdjustment: () => ({ mutateAsync: jest.fn().mockResolvedValue({}) }),
  useUpdateCashAdjustment: () => ({ mutateAsync: jest.fn().mockResolvedValue({}) }),
}));

jest.mock("@/hooks/useInventory", () => ({
  useAdjustInventory: () => ({ mutateAsync: jest.fn().mockResolvedValue({}) }),
  useInventoryAdjustments: () => ({ data: [], isLoading: false, isError: false }),
  useInventoryLatest: () => ({
    data: { full12: 10, empty12: 5, full48: 6, empty48: 3 },
    isLoading: false,
  }),
  useInventoryRefillDetails: () => ({ data: null, isLoading: false }),
  useUpdateInventoryAdjustment: () => ({ mutateAsync: jest.fn().mockResolvedValue({}) }),
}));

jest.mock("@/hooks/useReports", () => ({
  useDailyReportsV2: () => ({
    data: [{ cash_end: 300 }],
    isLoading: false,
    isError: false,
  }),
}));

import InventoryNewScreen from "@/app/inventory/new";

function hasWidthValue(node: any, target: string): boolean {
  if (!node || typeof node !== "object") return false;
  const styles = Array.isArray(node.props?.style) ? node.props.style : [node.props?.style];
  if (styles.some((style) => style && typeof style === "object" && style.width === target)) {
    return true;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  return children.some((child) => hasWidthValue(child, target));
}

describe("InventoryNewScreen company payment layout", () => {
  beforeEach(() => {
    mockCreateCompanyPaymentPending = false;
    mockCreateCompanyPaymentMutateAsync.mockClear();
  });

  it("renders boxed sections for date, direction, and reason/type", () => {
    const { getByText, getByPlaceholderText, toJSON } = render(<InventoryNewScreen />);

    expect(getByText("Date & time")).toBeTruthy();
    expect(getByText("Payment direction")).toBeTruthy();
    expect(getByText("Reason / type")).toBeTruthy();
    expect(getByPlaceholderText("Optional note")).toBeTruthy();
    expect(hasWidthValue(toJSON(), "50%")).toBe(false);
  });

  it("disables company payment save actions while the payment mutation is pending", () => {
    mockCreateCompanyPaymentPending = true;
    const { getByText } = render(<InventoryNewScreen />);

    expect(getByText("Saving...")).toBeTruthy();
    fireEvent.press(getByText("Saving..."));
    expect(mockCreateCompanyPaymentMutateAsync).not.toHaveBeenCalled();
  });
});

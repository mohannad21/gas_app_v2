import React from "react";
import { render, waitFor } from "@testing-library/react-native";

import CompanyBalanceAdjustScreen from "@/app/inventory/company-balance-adjust";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

jest.mock("@/lib/money", () => ({
  formatDisplayMoney: (v: number) => String(v),
  getMoneyDecimals: () => 2,
  getCurrencySymbol: () => "$",
}));

jest.mock("@/components/MinuteTimePickerModal", () => () => null);

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: { company_money: 120, company_cyl_12: -3, company_cyl_48: 0 },
    isSuccess: true,
  }),
  useCompanyBalanceAdjustments: () => ({ data: [], isLoading: false }),
  useCreateCompanyBalanceAdjustment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateCompanyBalanceAdjustment: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

describe("CompanyBalanceAdjustScreen — create mode prefill", () => {
  it("prefills balance state from live company balances", async () => {
    const { getByText } = render(<CompanyBalanceAdjustScreen />);

    await waitFor(() => {
      expect(getByText("Current Debts on distributor 120 -> Debts on distributor 120")).toBeTruthy();
    });
    expect(getByText("Current Debts on distributor 3 -> Debts on distributor 3")).toBeTruthy();
    expect(getByText("Current Balanced -> Balanced")).toBeTruthy();
  });
});

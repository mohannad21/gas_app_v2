import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockCreateCompanyBalanceAdjustment = jest.fn().mockResolvedValue({});
const mockCompanyBalances = { company_money: 120, company_cyl_12: 4, company_cyl_48: -2 };

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
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

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: mockCompanyBalances,
    isSuccess: true,
  }),
  useCreateCompanyBalanceAdjustment: () => ({
    mutateAsync: mockCreateCompanyBalanceAdjustment,
    isPending: false,
  }),
}));

import CompanyBalanceAdjustScreen from "@/app/inventory/company-balance-adjust";

describe("CompanyBalanceAdjustScreen", () => {
  beforeEach(() => {
    mockCreateCompanyBalanceAdjustment.mockClear();
  });

  it("renders the form and submits the adjustment", async () => {
    const { getByDisplayValue, getByPlaceholderText, getByText } = render(
      <CompanyBalanceAdjustScreen />
    );

    expect(getByText("Adjust Company Balances")).toBeTruthy();
    expect(getByDisplayValue("120")).toBeTruthy();
    expect(getByDisplayValue("4")).toBeTruthy();
    expect(getByDisplayValue("-2")).toBeTruthy();
    expect(getByPlaceholderText("Optional note")).toBeTruthy();

    fireEvent.changeText(getByDisplayValue("120"), "125");
    fireEvent.changeText(getByPlaceholderText("Optional note"), "manual fix");
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(mockCreateCompanyBalanceAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          money_balance: 125,
          cylinder_balance_12: 4,
          cylinder_balance_48: -2,
          note: "manual fix",
        })
      );
    });
  });
});

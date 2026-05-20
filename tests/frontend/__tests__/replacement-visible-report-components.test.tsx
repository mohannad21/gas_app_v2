import React from "react";
import { render, within } from "@testing-library/react-native";

import CompanyBalancesSection from "@/components/reports/CompanyBalancesSection";
import CustomerBalancesSection from "@/components/reports/CustomerBalancesSection";
import DayPickerStrip from "@/components/reports/DayPickerStrip";
import ReportHeader from "@/components/reports/ReportHeader";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
    MaterialCommunityIcons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Svg = ({ children }: { children?: any }) => <View>{children}</View>;
  return {
    __esModule: true,
    default: Svg,
    Line: () => <View />,
    Path: () => <View />,
    Rect: () => <View />,
  };
});

jest.mock("@/lib/money", () => ({
  getCurrencySymbol: () => "$",
}));

describe("replacement visible report components", () => {
  it("renders Daily Report ledger values from report header props", () => {
    const { getByText } = render(
      <ReportHeader
        inventory={{ full12: "8", empty12: "6", full48: "4", empty48: "2" }}
        walletEnd="1070"
        onAdjustInventory={() => {}}
        onAdjustCash={() => {}}
      />
    );

    expect(getByText("8")).toBeTruthy();
    expect(getByText("6")).toBeTruthy();
    expect(getByText("4")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
    expect(getByText("1070")).toBeTruthy();
    expect(getByText("Adjust Inventory")).toBeTruthy();
    expect(getByText("Adjust Wallet")).toBeTruthy();
  });

  it("renders collection payment ledger header with wallet changed and inventory unchanged", () => {
    const { getByText } = render(
      <ReportHeader
        inventory={{ full12: "10", empty12: "5", full48: "4", empty48: "2" }}
        walletEnd="1070"
        onAdjustInventory={() => {}}
        onAdjustCash={() => {}}
      />
    );

    expect(getByText("10")).toBeTruthy();
    expect(getByText("5")).toBeTruthy();
    expect(getByText("4")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
    expect(getByText("1070")).toBeTruthy();
  });

  it("renders return-empties ledger header with empty inventory changed and wallet unchanged", () => {
    const { getByText } = render(
      <ReportHeader
        inventory={{ full12: "10", empty12: "7", full48: "4", empty48: "3" }}
        walletEnd="1000"
        onAdjustInventory={() => {}}
        onAdjustCash={() => {}}
      />
    );

    expect(getByText("10")).toBeTruthy();
    expect(getByText("7")).toBeTruthy();
    expect(getByText("4")).toBeTruthy();
    expect(getByText("3")).toBeTruthy();
    expect(getByText("1000")).toBeTruthy();
  });

  it("renders Customer Balances tab values for replacement debt", () => {
    const { getAllByText, getByText } = render(
      <CustomerBalancesSection
        initiallyExpanded
        balanceSummary={{
          money: {
            receivable: { count: 1, total: 30 },
            payable: { count: 0, total: 0 },
          },
          cyl12: {
            receivable: { count: 1, total: 1 },
            payable: { count: 0, total: 0 },
          },
          cyl48: {
            receivable: { count: 0, total: 0 },
            payable: { count: 0, total: 0 },
          },
        }}
        formatMoney={(value) => String(value)}
        formatCustomerCount={(count) => `${count} customers`}
      />
    );

    expect(getByText("Money debt")).toBeTruthy();
    expect(getByText("30 $")).toBeTruthy();
    expect(getByText("12kg debt")).toBeTruthy();
    expect(getByText("1 cyl")).toBeTruthy();
    expect(getByText("48kg debt")).toBeTruthy();
    expect(getAllByText("0 cyl").length).toBeGreaterThan(0);
  });

  it("renders Company Balances tab unchanged for customer replacements", () => {
    const { getByText, getAllByText } = render(
      <CompanyBalancesSection
        initiallyExpanded
        companyBalancesReady
        companySummary={{
          payCash: 200,
          receiveCash: 0,
          give12: 0,
          receive12: 5,
          give48: 0,
          receive48: 3,
        }}
        formatMoney={(value) => String(value)}
        formatCount={(value) => String(value)}
      />
    );

    expect(getByText("Money balance")).toBeTruthy();
    expect(getByText("200 $")).toBeTruthy();
    expect(getByText("12kg balance")).toBeTruthy();
    expect(getByText("5 cyl")).toBeTruthy();
    expect(getByText("48kg balance")).toBeTruthy();
    expect(getByText("3 cyl")).toBeTruthy();
    expect(getByText("Debts on distributor")).toBeTruthy();
    expect(getAllByText("Credit for distributor")).toHaveLength(2);
  });

  it("renders Date Picker strip values for replacement business date", () => {
    const { getByTestId } = render(
      <DayPickerStrip
        selectedDate="2026-05-14"
        onSelect={() => {}}
        rows={[
          {
            date: "2026-05-14",
            sold_12kg: 2,
            sold_48kg: 1,
            net_today: 220,
            has_refill: false,
          } as any,
        ]}
      />
    );

    const card = getByTestId("day-card-2026-05-14");
    expect(within(card).getByText("12kg")).toBeTruthy();
    expect(within(card).getByText("2")).toBeTruthy();
    expect(within(card).getByText("48kg")).toBeTruthy();
    expect(within(card).getByText("1")).toBeTruthy();
    expect(within(card).getByText("Net")).toBeTruthy();
    expect(within(card).getByText("+$220")).toBeTruthy();
  });
});

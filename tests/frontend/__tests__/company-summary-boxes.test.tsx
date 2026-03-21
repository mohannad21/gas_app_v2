import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import CompanyBalancesSection from "@/components/reports/CompanyBalancesSection";

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

describe("CompanyBalancesSection", () => {
  it("starts collapsed and expands with positive values and directional labels", () => {
    const { getAllByText, getByText, queryByText } = render(
      <CompanyBalancesSection
        companySummary={{
          payCash: 120,
          receiveCash: 0,
          give12: 4,
          receive12: 0,
          give48: 0,
          receive48: 2,
        }}
        companyBalancesReady
        formatMoney={(value) => Number(value || 0).toFixed(0)}
        formatCount={(value) => Number(value || 0).toFixed(0)}
      />
    );

    expect(getByText("Company Balances")).toBeTruthy();
    expect(queryByText("Money balance")).toBeNull();

    fireEvent.press(getByText("Company Balances"));

    expect(getByText("Money balance")).toBeTruthy();
    expect(getByText("12kg balance")).toBeTruthy();
    expect(getByText("48kg balance")).toBeTruthy();
    expect(getByText("120 shekels")).toBeTruthy();
    expect(getByText("4 cyl")).toBeTruthy();
    expect(getByText("2 cyl")).toBeTruthy();
    expect(getAllByText("Credit to company")).toHaveLength(2);
    expect(getByText("Debts to company")).toBeTruthy();
    expect(queryByText("+120 shekels")).toBeNull();
    expect(queryByText("+ = you owe company. - = company owes you.")).toBeNull();
  });
});

import React from "react";
import { render } from "@testing-library/react-native";

import CustomersHomeScreen from "@/app/(tabs)/customers-home";

jest.mock("@/app/(tabs)/add/index", () => {
  const React = require("react");
  const { Text, View } = require("react-native");

  return {
    AddCustomerEntryAction: () => <View><Text>Add action marker</Text></View>,
    AddCustomersSection: () => <View><Text>Customer list marker</Text></View>,
  };
});

jest.mock("@/hooks/useBalancesSummary", () => ({
  useBalancesSummary: () => ({
    balanceSummary: {
      money: {
        receivable: { count: 1, total: 20 },
        payable: { count: 1, total: 15 },
      },
      cyl12: {
        receivable: { count: 1, total: 3 },
        payable: { count: 1, total: 4 },
      },
      cyl48: {
        receivable: { count: 1, total: 2 },
        payable: { count: 1, total: 1 },
      },
    },
  }),
}));

describe("Customer summary boxes", () => {
  it("renders the 6 compact boxes in the required order between filters and list", () => {
    const { getByText, queryByText, toJSON } = render(<CustomersHomeScreen />);

    expect(getByText("Cash debt")).toBeTruthy();
    expect(getByText("12kg debt")).toBeTruthy();
    expect(getByText("48kg debt")).toBeTruthy();
    expect(getByText("Cash credit")).toBeTruthy();
    expect(getByText("12kg credit")).toBeTruthy();
    expect(getByText("48kg credit")).toBeTruthy();
    expect(queryByText("Customer Balances")).toBeNull();

    expect(getByText("20 shekels")).toBeTruthy();
    expect(getByText("15 shekels")).toBeTruthy();
    expect(getByText("3 cyl")).toBeTruthy();
    expect(getByText("4 cyl")).toBeTruthy();
    expect(getByText("2 cyl")).toBeTruthy();
    expect(getByText("1 cyl")).toBeTruthy();
    expect(queryByText("-15 shekels")).toBeNull();
    expect(queryByText("-4 cyl")).toBeNull();

    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf("Replacement")).toBeLessThan(tree.indexOf("Cash debt"));
    expect(tree.indexOf("Cash debt")).toBeLessThan(tree.indexOf("Customer list marker"));
    expect(tree.indexOf("Cash debt")).toBeLessThan(tree.indexOf("12kg debt"));
    expect(tree.indexOf("12kg debt")).toBeLessThan(tree.indexOf("48kg debt"));
    expect(tree.indexOf("48kg debt")).toBeLessThan(tree.indexOf("Cash credit"));
    expect(tree.indexOf("Cash credit")).toBeLessThan(tree.indexOf("12kg credit"));
    expect(tree.indexOf("12kg credit")).toBeLessThan(tree.indexOf("48kg credit"));
  });
});

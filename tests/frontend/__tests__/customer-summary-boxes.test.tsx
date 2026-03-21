import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import CustomerBalancesSection from "@/components/reports/CustomerBalancesSection";

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

describe("CustomerBalancesSection", () => {
  it("starts collapsed and expands with money wording", () => {
    const { getByText, queryByText } = render(
      <CustomerBalancesSection
        balanceSummary={{
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
        }}
        formatMoney={(value) => Number(value || 0).toFixed(0)}
        formatCustomerCount={(count) => `${count} cust`}
      />
    );

    expect(getByText("Customer Balances")).toBeTruthy();
    expect(queryByText("Money debt")).toBeNull();

    fireEvent.press(getByText("Customer Balances"));

    expect(getByText("Money debt")).toBeTruthy();
    expect(getByText("12kg debt")).toBeTruthy();
    expect(getByText("48kg debt")).toBeTruthy();
    expect(getByText("Money credit")).toBeTruthy();
    expect(getByText("12kg credit")).toBeTruthy();
    expect(getByText("48kg credit")).toBeTruthy();
    expect(getByText("20 shekels")).toBeTruthy();
    expect(getByText("15 shekels")).toBeTruthy();
    expect(queryByText("Wallet debt")).toBeNull();
    expect(queryByText("Wallet credit")).toBeNull();
  });
});

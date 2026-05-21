import React from "react";
import { render, within } from "@testing-library/react-native";

import EventExpandedPanel from "@/components/reports/EventExpandedPanel";

jest.mock("@/constants/gas", () => ({
  gasColor: jest.fn(() => "#000"),
}));

describe("EventExpandedPanel company activity rendering", () => {
  const formatMoney = (value: number) => String(value);
  const formatCount = (value: number) => String(value);

  it("renders refill inventory and wallet before-after values", () => {
    const { getByTestId } = render(
      <EventExpandedPanel
        ev={{
          event_type: "refill",
          buy12: 3,
          return12: 2,
          wallet_before: 1000,
          wallet_after: 880,
          inventory_before: { full12: 5, empty12: 7, full48: null, empty48: null },
          inventory_after: { full12: 8, empty12: 5, full48: null, empty48: null },
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(within(getByTestId("12kg-full")).getByText("+3")).toBeTruthy();
    expect(within(getByTestId("12kg-empty")).getByText("-2")).toBeTruthy();
    expect(within(getByTestId("12kg-cash")).getByText("-120")).toBeTruthy();
  });

  it("renders expense wallet before-after values", () => {
    const { getByText, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "expense",
          wallet_before: 1000,
          wallet_after: 955,
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(getByText("Wallet")).toBeTruthy();
    expect(getByText("-45")).toBeTruthy();
    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("48kg Full")).toBeNull();
  });

  it("renders cash adjustment wallet before-after values", () => {
    const { getByText, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "cash_adjust",
          wallet_before: 955,
          wallet_after: 980,
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(getByText("Wallet")).toBeTruthy();
    expect(getByText("+25")).toBeTruthy();
    expect(queryByText("12kg Empty")).toBeNull();
    expect(queryByText("48kg Empty")).toBeNull();
  });

  it("renders bank deposit wallet before-after values", () => {
    const { getByText, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "bank_deposit",
          wallet_before: 980,
          wallet_after: 780,
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(getByText("Wallet")).toBeTruthy();
    expect(getByText("-200")).toBeTruthy();
    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("48kg Full")).toBeNull();
  });
});

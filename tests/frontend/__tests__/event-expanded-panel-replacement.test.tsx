import React from "react";
import { render, within } from "@testing-library/react-native";

import EventExpandedPanel from "@/components/reports/EventExpandedPanel";

jest.mock("@/constants/gas", () => ({
  gasColor: jest.fn(() => "#000"),
}));

describe("EventExpandedPanel replacement rendering", () => {
  it("renders 12kg replacement inventory and wallet before-after values", () => {
    const { getByTestId, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "order",
          gas_type: "12kg",
          wallet_before: 1000,
          wallet_after: 1070,
          inventory_before: { full12: 10, empty12: 5, full48: null, empty48: null },
          inventory_after: { full12: 8, empty12: 6, full48: null, empty48: null },
        }}
        formatMoney={(value) => String(value)}
        formatCount={(value) => String(value)}
      />
    );

    const full = getByTestId("12kg-full");
    expect(within(full).getByText("12kg Full")).toBeTruthy();
    expect(within(full).getByText("-2")).toBeTruthy();
    expect(within(full).getByText("10")).toBeTruthy();
    expect(within(full).getByText("8")).toBeTruthy();

    const empty = getByTestId("12kg-empty");
    expect(within(empty).getByText("12kg Empty")).toBeTruthy();
    expect(within(empty).getByText("+1")).toBeTruthy();
    expect(within(empty).getByText("5")).toBeTruthy();
    expect(within(empty).getByText("6")).toBeTruthy();

    const wallet = getByTestId("12kg-cash");
    expect(within(wallet).getByText("Wallet")).toBeTruthy();
    expect(within(wallet).getByText("+70")).toBeTruthy();
    expect(within(wallet).getByText("1000")).toBeTruthy();
    expect(within(wallet).getByText("1070")).toBeTruthy();

    expect(queryByText("48kg Full")).toBeNull();
    expect(queryByText("48kg Empty")).toBeNull();
  });

  it("renders 48kg replacement values without 12kg boxes", () => {
    const { getByTestId, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "order",
          gas_type: "48kg",
          wallet_before: 1000,
          wallet_after: 1150,
          inventory_before: { full12: null, empty12: null, full48: 4, empty48: 2 },
          inventory_after: { full12: null, empty12: null, full48: 3, empty48: 2 },
        }}
        formatMoney={(value) => String(value)}
        formatCount={(value) => String(value)}
      />
    );

    const full = getByTestId("48kg-full");
    expect(within(full).getByText("48kg Full")).toBeTruthy();
    expect(within(full).getByText("-1")).toBeTruthy();
    expect(within(full).getByText("4")).toBeTruthy();
    expect(within(full).getByText("3")).toBeTruthy();

    const empty = getByTestId("48kg-empty");
    expect(within(empty).getByText("48kg Empty")).toBeTruthy();
    expect(within(empty).getByText("No change")).toBeTruthy();
    expect(within(empty).getAllByText("2")).toHaveLength(2);

    const wallet = getByTestId("48kg-cash");
    expect(within(wallet).getByText("Wallet")).toBeTruthy();
    expect(within(wallet).getByText("+150")).toBeTruthy();
    expect(within(wallet).getByText("1000")).toBeTruthy();
    expect(within(wallet).getByText("1150")).toBeTruthy();

    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("12kg Empty")).toBeNull();
  });
});

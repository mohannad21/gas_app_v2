import React from "react";
import { render, within } from "@testing-library/react-native";

import EventExpandedPanel from "@/components/reports/EventExpandedPanel";

jest.mock("@/constants/gas", () => ({
  gasColor: jest.fn(() => "#000"),
}));

describe("EventExpandedPanel order rendering", () => {
  it("renders sell full 12kg as full-empty-wallet with empty shown as No change", () => {
    const { getByTestId, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "order",
          order_mode: "sell_iron",
          gas_type: "12kg",
          wallet_before: 1000,
          wallet_after: 1070,
          inventory_before: { full12: 10, empty12: 5, full48: null, empty48: null },
          inventory_after: { full12: 9, empty12: 5, full48: null, empty48: null },
        }}
        formatMoney={(value) => String(value)}
        formatCount={(value) => String(value)}
      />
    );

    expect(within(getByTestId("12kg-full")).getByText("-1")).toBeTruthy();
    expect(within(getByTestId("12kg-empty")).getByText("No change")).toBeTruthy();
    expect(within(getByTestId("12kg-cash")).getByText("+70")).toBeTruthy();
    expect(queryByText("48kg Full")).toBeNull();
    expect(queryByText("48kg Empty")).toBeNull();
  });

  it("renders sell full 48kg as full-empty-wallet with empty shown as No change", () => {
    const { getByTestId, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "order",
          order_mode: "sell_iron",
          gas_type: "48kg",
          wallet_before: 1000,
          wallet_after: 1080,
          inventory_before: { full12: null, empty12: null, full48: 4, empty48: 2 },
          inventory_after: { full12: null, empty12: null, full48: 3, empty48: 2 },
        }}
        formatMoney={(value) => String(value)}
        formatCount={(value) => String(value)}
      />
    );

    expect(within(getByTestId("48kg-full")).getByText("-1")).toBeTruthy();
    expect(within(getByTestId("48kg-empty")).getByText("No change")).toBeTruthy();
    expect(within(getByTestId("48kg-cash")).getByText("+80")).toBeTruthy();
    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("12kg Empty")).toBeNull();
  });

  it("renders buy empty 12kg as full-empty-wallet with full shown as No change", () => {
    const { getByTestId, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "order",
          order_mode: "buy_iron",
          gas_type: "12kg",
          wallet_before: 1000,
          wallet_after: 970,
          inventory_before: { full12: 10, empty12: 5, full48: null, empty48: null },
          inventory_after: { full12: 10, empty12: 6, full48: null, empty48: null },
        }}
        formatMoney={(value) => String(value)}
        formatCount={(value) => String(value)}
      />
    );

    expect(within(getByTestId("12kg-full")).getByText("No change")).toBeTruthy();
    expect(within(getByTestId("12kg-empty")).getByText("+1")).toBeTruthy();
    expect(within(getByTestId("12kg-cash")).getByText("-30")).toBeTruthy();
    expect(queryByText("48kg Full")).toBeNull();
    expect(queryByText("48kg Empty")).toBeNull();
  });

  it("renders buy empty 48kg as full-empty-wallet with full shown as No change", () => {
    const { getByTestId, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "order",
          order_mode: "buy_iron",
          gas_type: "48kg",
          wallet_before: 1000,
          wallet_after: 980,
          inventory_before: { full12: null, empty12: null, full48: 4, empty48: 2 },
          inventory_after: { full12: null, empty12: null, full48: 4, empty48: 3 },
        }}
        formatMoney={(value) => String(value)}
        formatCount={(value) => String(value)}
      />
    );

    expect(within(getByTestId("48kg-full")).getByText("No change")).toBeTruthy();
    expect(within(getByTestId("48kg-empty")).getByText("+1")).toBeTruthy();
    expect(within(getByTestId("48kg-cash")).getByText("-20")).toBeTruthy();
    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("12kg Empty")).toBeNull();
  });
});

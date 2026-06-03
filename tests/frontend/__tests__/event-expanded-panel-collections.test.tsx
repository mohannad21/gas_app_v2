import React from "react";
import { render } from "@testing-library/react-native";

import EventExpandedPanel from "@/components/reports/EventExpandedPanel";

jest.mock("@/constants/gas", () => ({
  gasColor: () => "#0a7ea4",
}));

describe("EventExpandedPanel collection boxes", () => {
  const formatMoney = (value: number) => String(value);
  const formatCount = (value: number) => String(value);

  it("shows only the wallet box for payment received", () => {
    const { getByText, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "payment_from_customer",
          wallet_before: 1000,
          wallet_after: 1070,
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(getByText("Wallet")).toBeTruthy();
    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("12kg Empty")).toBeNull();
    expect(queryByText("48kg Full")).toBeNull();
    expect(queryByText("48kg Empty")).toBeNull();
  });

  it("shows only the wallet box for payout", () => {
    const { getByText, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "payment_to_customer",
          wallet_before: 1000,
          wallet_after: 960,
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(getByText("Wallet")).toBeTruthy();
    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("12kg Empty")).toBeNull();
    expect(queryByText("48kg Full")).toBeNull();
    expect(queryByText("48kg Empty")).toBeNull();
  });

  it("shows only the 12kg empty box for a 12kg return", () => {
    const { getByText, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "customer_return_empties",
          gas_type: "12kg",
          inventory_before: { full12: null, empty12: 5, full48: null, empty48: null },
          inventory_after: { full12: null, empty12: 7, full48: null, empty48: null },
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(getByText("12kg Empty")).toBeTruthy();
    expect(queryByText("Wallet")).toBeNull();
    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("48kg Full")).toBeNull();
    expect(queryByText("48kg Empty")).toBeNull();
  });

  it("shows only the 48kg empty box for a 48kg return", () => {
    const { getByText, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "customer_return_empties",
          gas_type: "48kg",
          inventory_before: { full12: null, empty12: null, full48: null, empty48: 2 },
          inventory_after: { full12: null, empty12: null, full48: null, empty48: 3 },
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(getByText("48kg Empty")).toBeTruthy();
    expect(queryByText("Wallet")).toBeNull();
    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("12kg Empty")).toBeNull();
    expect(queryByText("48kg Full")).toBeNull();
  });
});

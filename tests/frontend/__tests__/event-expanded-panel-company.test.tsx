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

    expect(within(getByTestId("refill-mixed-12-full")).getByText("+3")).toBeTruthy();
    expect(within(getByTestId("refill-mixed-12-empty")).getByText("-2")).toBeTruthy();
    expect(within(getByTestId("refill-mixed-cash")).getByText("-120")).toBeTruthy();
    expect(within(getByTestId("refill-mixed-48-full")).getByText("No change")).toBeTruthy();
    expect(within(getByTestId("refill-mixed-48-empty")).getByText("No change")).toBeTruthy();
  });

  it("renders refill with both sizes and always shows all 4 gas boxes", () => {
    const { getByTestId } = render(
      <EventExpandedPanel
        ev={{
          event_type: "refill",
          buy12: 2,
          buy48: 1,
          return12: 1,
          return48: 0,
          wallet_before: 800,
          wallet_after: 650,
          inventory_before: { full12: 4, empty12: 3, full48: 2, empty48: 1 },
          inventory_after: { full12: 6, empty12: 2, full48: 3, empty48: 1 },
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(within(getByTestId("refill-mixed-12-full")).getByText("+2")).toBeTruthy();
    expect(within(getByTestId("refill-mixed-12-empty")).getByText("-1")).toBeTruthy();
    expect(within(getByTestId("refill-mixed-48-full")).getByText("+1")).toBeTruthy();
    expect(within(getByTestId("refill-mixed-48-empty")).getByText("No change")).toBeTruthy();
    expect(within(getByTestId("refill-mixed-cash")).getByText("-150")).toBeTruthy();
  });

  it("renders dist_return_empties with both 12kg and 48kg empty boxes", () => {
    const { getByTestId, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "dist_return_empties",
          return12: 3,
          return48: 2,
          inventory_before: { full12: null, empty12: 5, full48: null, empty48: 4 },
          inventory_after: { full12: null, empty12: 2, full48: null, empty48: 2 },
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(within(getByTestId("dre-12-empty")).getByText("-3")).toBeTruthy();
    expect(within(getByTestId("dre-48-empty")).getByText("-2")).toBeTruthy();
    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("48kg Full")).toBeNull();
  });

  it("renders buy_full_from_company with full boxes and wallet but no empty boxes", () => {
    const { getByTestId, queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "buy_full_from_company",
          buy12: 4,
          buy48: 2,
          wallet_before: 1000,
          wallet_after: 700,
          inventory_before: { full12: 2, empty12: 5, full48: 1, empty48: 3 },
          inventory_after: { full12: 6, empty12: 5, full48: 3, empty48: 3 },
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(within(getByTestId("bfc-12-full")).getByText("+4")).toBeTruthy();
    expect(within(getByTestId("bfc-48-full")).getByText("+2")).toBeTruthy();
    expect(within(getByTestId("bfc-cash")).getByText("-300")).toBeTruthy();
    expect(queryByText("12kg Empty")).toBeNull();
    expect(queryByText("48kg Empty")).toBeNull();
  });

  it("renders adjust_inventory with all 4 gas boxes always", () => {
    const { getByTestId } = render(
      <EventExpandedPanel
        ev={{
          event_type: "adjust_inventory",
          inventory_before: { full12: 3, empty12: 2, full48: 1, empty48: 4 },
          inventory_after: { full12: 5, empty12: 2, full48: 1, empty48: 3 },
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(within(getByTestId("adjust-mixed-12-full")).getByText("+2")).toBeTruthy();
    expect(within(getByTestId("adjust-mixed-12-empty")).getByText("No change")).toBeTruthy();
    expect(within(getByTestId("adjust-mixed-48-full")).getByText("No change")).toBeTruthy();
    expect(within(getByTestId("adjust-mixed-48-empty")).getByText("-1")).toBeTruthy();
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

  it("renders payment_from_company without cylinder boxes", () => {
    const { queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "payment_from_company",
          money_direction: "in",
          money_amount: 300,
          company_before: 400,
          company_after: 100,
          wallet_before: 500,
          wallet_after: 500,
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("48kg Full")).toBeNull();
    expect(queryByText("12kg Empty")).toBeNull();
    expect(queryByText("48kg Empty")).toBeNull();
  });
});

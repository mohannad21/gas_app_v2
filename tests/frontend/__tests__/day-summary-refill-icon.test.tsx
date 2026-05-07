import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import DaySummaryBox from "@/components/reports/DaySummaryBox";
import { DailyReportCard } from "@/types/domain";

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text>,
  };
});

jest.mock("@/lib/money", () => ({
  getCurrencySymbol: () => "$",
  formatDisplayMoney: (v: number) => String(v),
}));

function makeCard(overrides: Partial<DailyReportCard> = {}): DailyReportCard {
  return {
    date: "2026-06-01",
    cash_start: 0,
    cash_end: 0,
    sold_12kg: 0,
    sold_48kg: 0,
    net_today: 0,
    has_refill: false,
    cash_math: { collections: 0, expenses: 0, bank_in: 0, bank_out: 0 },
    inventory_start: { full12: 0, empty12: 0, full48: 0, empty48: 0 },
    inventory_end: { full12: 0, empty12: 0, full48: 0, empty48: 0 },
    problems: [],
    ...overrides,
  } as unknown as DailyReportCard;
}

describe("DaySummaryBox refill icon", () => {
  it("renders reload-circle icon when has_refill is true", () => {
    const { getByTestId } = render(<DaySummaryBox card={makeCard({ has_refill: true })} />);
    expect(getByTestId("icon-reload-circle")).toBeTruthy();
  });

  it("does not render reload-circle icon when has_refill is false", () => {
    const { queryByTestId } = render(<DaySummaryBox card={makeCard({ has_refill: false })} />);
    expect(queryByTestId("icon-reload-circle")).toBeNull();
  });

  it("does not render reload-circle icon when has_refill is missing", () => {
    const card = makeCard();
    delete (card as any).has_refill;
    const { queryByTestId } = render(<DaySummaryBox card={card} />);
    expect(queryByTestId("icon-reload-circle")).toBeNull();
  });

  it("shows net_today in expanded body", () => {
    const { getByText, getByTestId } = render(
      <DaySummaryBox card={makeCard({ net_today: 250, has_refill: true })} />
    );
    fireEvent.press(getByTestId("icon-chevron-down").parent!);
    expect(getByText(/250/)).toBeTruthy();
  });
});

import React from "react";
import { StyleSheet } from "react-native";
import { render, within } from "@testing-library/react-native";

import DayPickerStrip from "@/components/reports/DayPickerStrip";

jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, name);
  },
}));

const rows = [
  {
    date: "2026-03-22",
    sold_12kg: 4,
    sold_48kg: 2,
    net_today: 120,
    has_refill: true,
  },
  {
    date: "2026-03-23",
    sold_12kg: 1,
    sold_48kg: 0,
    net_today: 0,
    has_refill: false,
  },
] as any[];

describe("DayPickerStrip", () => {
  it("renders top, center, and bottom sections for a card", () => {
    const { getByTestId } = render(<DayPickerStrip rows={rows} selectedDate="2026-03-22" onSelect={() => {}} />);
    const card = getByTestId("day-card-2026-03-22");

    expect(getByTestId("day-card-top-2026-03-22")).toBeTruthy();
    expect(getByTestId("day-card-center-2026-03-22")).toBeTruthy();
    expect(getByTestId("day-card-bottom-2026-03-22")).toBeTruthy();
    expect(within(card).getByText("22")).toBeTruthy();
    expect(within(card).getByText("Mar")).toBeTruthy();
  });

  it("keeps the bottom row inside the card structure", () => {
    const { getByTestId } = render(<DayPickerStrip rows={rows} selectedDate="2026-03-22" onSelect={() => {}} />);

    const card = getByTestId("day-card-2026-03-22");
    expect(within(card).getByTestId("day-card-bottom-2026-03-22")).toBeTruthy();
  });

  it("renders the truck icon in the top row when has_refill is true", () => {
    const { getByTestId, getByText } = render(
      <DayPickerStrip rows={rows} selectedDate="2026-03-22" onSelect={() => {}} />
    );

    const topRow = getByTestId("day-card-top-2026-03-22");
    expect(within(topRow).getByText("truck-delivery")).toBeTruthy();
    expect(getByText("truck-delivery")).toBeTruthy();
  });

  it("renders the three bottom metric boxes", () => {
    const { getByTestId } = render(<DayPickerStrip rows={rows} selectedDate="2026-03-22" onSelect={() => {}} />);
    const card = getByTestId("day-card-2026-03-22");

    expect(within(card).getByText("12kg")).toBeTruthy();
    expect(within(card).getByText("48kg")).toBeTruthy();
    expect(within(card).getByText("Net")).toBeTruthy();
    expect(within(card).getByText("4")).toBeTruthy();
    expect(within(card).getByText("2")).toBeTruthy();
    expect(within(card).getByText("+$120")).toBeTruthy();
  });

  it("highlights the selected day with a blue border instead of a filled card", () => {
    const { getByTestId } = render(<DayPickerStrip rows={rows} selectedDate="2026-03-22" onSelect={() => {}} />);
    const card = getByTestId("day-card-2026-03-22");
    const styles = StyleSheet.flatten(card.props.style);

    expect(styles.borderColor).toBe("#0a7ea4");
    expect(styles.backgroundColor).toBe("#fff");
    expect(styles.borderWidth).toBe(2);
  });
});

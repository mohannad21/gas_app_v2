import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import PricesScreen from "@/app/prices";

const mockRefetch = jest.fn();
const mockUsePriceSettings = jest.fn();

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => mockUsePriceSettings(),
}));

describe("PricesScreen states", () => {
  beforeEach(() => {
    mockRefetch.mockReset();
    mockUsePriceSettings.mockReset();
  });

  it("shows a loading state while prices are loading", () => {
    mockUsePriceSettings.mockReturnValue({
      data: [],
      isLoading: true,
      isFetching: false,
      error: null,
      refetch: mockRefetch,
    });

    const view = render(<PricesScreen />);

    expect(view.getByText("Loading...")).toBeTruthy();
  });

  it("shows a retryable error state when prices fail to load", () => {
    mockUsePriceSettings.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: new Error("boom"),
      refetch: mockRefetch,
    });

    const view = render(<PricesScreen />);
    fireEvent.press(view.getByText("Retry"));

    expect(view.getByText("Failed to load prices.")).toBeTruthy();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("shows a distinct empty state when there are no prices", () => {
    mockUsePriceSettings.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: mockRefetch,
    });

    const view = render(<PricesScreen />);

    expect(view.getByText("No prices yet.")).toBeTruthy();
    expect(view.queryByText("Failed to load prices.")).toBeNull();
  });
});

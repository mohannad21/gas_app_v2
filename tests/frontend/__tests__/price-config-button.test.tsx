import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import PriceConfigButton from "@/components/entry/PriceConfigButton";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("PriceConfigButton", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders the default label", () => {
    const view = render(<PriceConfigButton />);
    expect(view.getByText("Update price")).toBeTruthy();
  });

  it("renders a custom label", () => {
    const view = render(<PriceConfigButton label="Update gas price" />);
    expect(view.getByText("Update gas price")).toBeTruthy();
  });

  it("navigates to the canonical price config route", () => {
    const view = render(<PriceConfigButton testID="price-button" />);
    fireEvent.press(view.getByTestId("price-button"));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/account/configuration/prices");
  });

  it("does not navigate to the old Add price modal route", () => {
    const view = render(<PriceConfigButton testID="price-button" />);
    fireEvent.press(view.getByTestId("price-button"));
    expect(mockPush).not.toHaveBeenCalledWith("/add?prices=1");
  });
});

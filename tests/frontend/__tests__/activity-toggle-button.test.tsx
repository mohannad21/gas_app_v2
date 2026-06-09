import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import ActivityToggleButton from "@/components/entry/ActivityToggleButton";

describe("ActivityToggleButton", () => {
  it("renders payment target label", () => {
    const view = render(<ActivityToggleButton variant="payment" state="target" onPress={jest.fn()} />);

    expect(view.getByText("Didn't pay")).toBeTruthy();
  });

  it("renders payment zero label", () => {
    const view = render(<ActivityToggleButton variant="payment" state="zero" onPress={jest.fn()} />);

    expect(view.getByText("Pay all")).toBeTruthy();
  });

  it("renders receive target and zero labels", () => {
    const targetView = render(<ActivityToggleButton variant="receive" state="target" onPress={jest.fn()} />);
    expect(targetView.getByText("Didn't receive")).toBeTruthy();

    const zeroView = render(<ActivityToggleButton variant="receive" state="zero" onPress={jest.fn()} />);
    expect(zeroView.getByText("Receive all")).toBeTruthy();
  });

  it("renders return target and zero labels", () => {
    const targetView = render(<ActivityToggleButton variant="return" state="target" onPress={jest.fn()} />);
    expect(targetView.getByText("Didn't return")).toBeTruthy();

    const zeroView = render(<ActivityToggleButton variant="return" state="zero" onPress={jest.fn()} />);
    expect(zeroView.getByText("Return all")).toBeTruthy();
  });

  it("uses danger color for target state", () => {
    const view = render(
      <ActivityToggleButton testID="toggle" variant="payment" state="target" onPress={jest.fn()} />
    );

    const style = StyleSheet.flatten(view.getByTestId("toggle").props.style);
    expect(style.backgroundColor).toBe("#dc2626");
  });

  it("uses success color for zero state", () => {
    const view = render(
      <ActivityToggleButton testID="toggle" variant="payment" state="zero" onPress={jest.fn()} />
    );

    const style = StyleSheet.flatten(view.getByTestId("toggle").props.style);
    expect(style.backgroundColor).toBe("#16a34a");
  });

  it("calls onPress", () => {
    const onPress = jest.fn();
    const view = render(
      <ActivityToggleButton testID="toggle" variant="payment" state="target" onPress={onPress} />
    );

    fireEvent.press(view.getByTestId("toggle"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { FieldCell } from "@/components/entry/FieldPair";

describe("FieldCell stepper repeat", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("increments once on single press", () => {
    const onIncrement = jest.fn();
    const { getByText } = render(
      <FieldCell title="Qty" value={0} onIncrement={onIncrement} onDecrement={jest.fn()} />
    );

    fireEvent.press(getByText("+"));

    expect(onIncrement).toHaveBeenCalledTimes(1);
  });

  it("repeats on long press and stops on release", () => {
    const onIncrement = jest.fn();
    const { getByText } = render(
      <FieldCell title="Qty" value={0} onIncrement={onIncrement} onDecrement={jest.fn()} />
    );

    const plusButton = getByText("+");

    fireEvent(plusButton, "onPressIn");
    fireEvent(plusButton, "onLongPress");
    act(() => {
      jest.advanceTimersByTime(225);
    });
    fireEvent(plusButton, "onPressOut");

    const callsAtRelease = onIncrement.mock.calls.length;
    act(() => {
      jest.advanceTimersByTime(225);
    });

    expect(callsAtRelease).toBeGreaterThan(1);
    expect(onIncrement).toHaveBeenCalledTimes(callsAtRelease);
  });
});

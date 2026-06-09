import React from "react";
import { Keyboard, KeyboardAvoidingView, ScrollView, Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import KeyboardAwareForm from "@/components/entry/KeyboardAwareForm";
import KeyboardDismissView from "@/components/entry/KeyboardDismissView";

describe("KeyboardAwareForm", () => {
  it("renders non-scroll content without a ScrollView", () => {
    const view = render(
      <KeyboardAwareForm testID="form" dismissOnTapOutside={false}>
        <Text>Amount</Text>
      </KeyboardAwareForm>
    );

    expect(view.getByText("Amount")).toBeTruthy();
    expect(view.UNSAFE_queryByType(ScrollView)).toBeNull();
    expect(view.UNSAFE_getByType(KeyboardAvoidingView)).toBeTruthy();
  });

  it("renders scroll content with keyboard-aware ScrollView props", () => {
    const view = render(
      <KeyboardAwareForm scrollable dismissOnTapOutside={false}>
        <Text>Amount</Text>
      </KeyboardAwareForm>
    );

    const scrollView = view.UNSAFE_getByType(ScrollView);
    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");
    expect(scrollView.props.keyboardDismissMode).toBe("on-drag");
  });

  it("passes behavior override to KeyboardAvoidingView", () => {
    const view = render(
      <KeyboardAwareForm behavior="height" dismissOnTapOutside={false}>
        <Text>Amount</Text>
      </KeyboardAwareForm>
    );

    const keyboardAvoidingView = view.UNSAFE_getByType(KeyboardAvoidingView);
    expect(keyboardAvoidingView.props.behavior).toBe("height");
  });
});

describe("KeyboardDismissView", () => {
  it("renders children", () => {
    const view = render(
      <KeyboardDismissView>
        <Text>Amount</Text>
      </KeyboardDismissView>
    );

    expect(view.getByText("Amount")).toBeTruthy();
  });

  it("dismisses keyboard when pressing outside content", () => {
    const dismissSpy = jest.spyOn(Keyboard, "dismiss").mockImplementation(jest.fn());
    const view = render(
      <KeyboardDismissView testID="outside" contentTestID="inside">
        <Text>Amount</Text>
      </KeyboardDismissView>
    );

    fireEvent.press(view.getByTestId("outside"));

    expect(dismissSpy).toHaveBeenCalledTimes(1);
    dismissSpy.mockRestore();
  });

  it("does not dismiss keyboard when pressing inside content", () => {
    const dismissSpy = jest.spyOn(Keyboard, "dismiss").mockImplementation(jest.fn());
    const view = render(
      <KeyboardDismissView testID="outside" contentTestID="inside">
        <Text>Amount</Text>
      </KeyboardDismissView>
    );

    fireEvent.press(view.getByTestId("inside"));

    expect(dismissSpy).not.toHaveBeenCalled();
    dismissSpy.mockRestore();
  });
});

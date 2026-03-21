import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

import BigBox from "@/components/entry/BigBox";

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

describe("BigBox", () => {
  it("shows a success icon for Settled status", () => {
    const { getByText } = render(
      <BigBox title="Money" statusLine="Settled">
        <Text>Body</Text>
      </BigBox>
    );

    expect(getByText("Settled")).toBeTruthy();
    expect(getByText("checkmark-circle")).toBeTruthy();
  });

  it("does not show the success icon for other statuses", () => {
    const { queryByText } = render(
      <BigBox title="Money" statusLine="Balance due">
        <Text>Body</Text>
      </BigBox>
    );

    expect(queryByText("checkmark-circle")).toBeNull();
  });
});

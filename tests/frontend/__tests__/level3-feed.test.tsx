import React from "react";
import renderer from "react-test-renderer";
import { render } from "@testing-library/react-native";
import { View } from "react-native";

import SlimActivityRow from "@/components/reports/SlimActivityRow";
import { level3Fixtures } from "@/dev/level3-fixtures";

describe("Level 3 feed rendering", () => {
  it("matches snapshot output", () => {
    let tree: renderer.ReactTestRendererJSON | renderer.ReactTestRendererJSON[] | null = null;
    renderer.act(() => {
      tree = renderer
        .create(
          <View>
            {level3Fixtures.map((event) => (
              <SlimActivityRow key={event.source_id ?? event.effective_at} event={event} />
            ))}
          </View>
        )
        .toJSON();
    });
    expect(tree).toMatchSnapshot();
  });

  it("renders system only for replacement events", () => {
    level3Fixtures.forEach((event) => {
      const { queryByText } = render(<SlimActivityRow event={event} />);
      const hasSystem = queryByText(/System:/i) !== null;
      const shouldHaveSystem = event.event_type === "order" && event.order_mode === "replacement";
      expect(hasSystem).toBe(shouldHaveSystem);
    });
  });

  it("renders action chips with directional text", () => {
    const event = level3Fixtures.find((item) => (item.notes?.length ?? 0) > 0);
    expect(event).toBeTruthy();
    const { getByText } = render(<SlimActivityRow event={event!} />);
    expect(getByText(/Customer still owes/i)).toBeTruthy();
  });

  it("does not render notes when status is atomic_ok", () => {
    const event = level3Fixtures.find((item) => item.status === "atomic_ok");
    expect(event).toBeTruthy();
    const { queryByText } = render(<SlimActivityRow event={event!} />);
    expect(queryByText(/Customer still owes/i)).toBeNull();
  });
});

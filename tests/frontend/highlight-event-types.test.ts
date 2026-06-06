jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

import { getRefillHighlightEventType } from "../../frontend/components/AddRefillModal";

describe("refill highlight event types", () => {
  it("maps buy mode to buy_full_from_company", () => {
    expect(getRefillHighlightEventType("buy")).toBe("buy_full_from_company");
  });

  it("maps return mode to dist_return_empties", () => {
    expect(getRefillHighlightEventType("return")).toBe("dist_return_empties");
  });

  it("maps refill mode to refill", () => {
    expect(getRefillHighlightEventType("refill")).toBe("refill");
  });
});

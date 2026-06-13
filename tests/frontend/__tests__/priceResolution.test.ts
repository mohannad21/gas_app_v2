import { resolvePriceValue } from "@/lib/priceResolution";
import type { PriceSetting } from "@/types/price";

function price(overrides: Partial<PriceSetting>): PriceSetting {
  return {
    id: "price",
    gas_type: "12kg",
    selling_price: 0,
    buying_price: 0,
    selling_iron_price: 0,
    buying_iron_price: 0,
    company_iron_price: 0,
    effective_from: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolvePriceValue", () => {
  it("returns the newest matching price in latest mode", () => {
    const prices = [
      price({ id: "old", buying_price: 307, effective_from: "2026-01-01T00:00:00Z" }),
      price({ id: "new", buying_price: 317, effective_from: "2099-01-01T00:00:00Z" }),
    ];

    expect(resolvePriceValue(prices, "12kg", "buying_price", { mode: "latest" })).toBe(317);
  });

  it("returns the newest matching price at or before the target in effectiveAt mode", () => {
    const prices = [
      price({ id: "old", buying_price: 307, effective_from: "2026-01-01T00:00:00Z" }),
      price({ id: "target", buying_price: 312, effective_from: "2026-02-01T00:00:00Z" }),
      price({ id: "future", buying_price: 317, effective_from: "2026-03-01T00:00:00Z" }),
    ];

    expect(
      resolvePriceValue(prices, "12kg", "buying_price", {
        mode: "effectiveAt",
        target: new Date("2026-02-15T00:00:00Z"),
      })
    ).toBe(312);
  });

  it("excludes future prices in effectiveAt mode", () => {
    const prices = [
      price({ id: "old", buying_price: 307, effective_from: "2026-01-01T00:00:00Z" }),
      price({ id: "future", buying_price: 317, effective_from: "2026-03-01T00:00:00Z" }),
    ];

    expect(
      resolvePriceValue(prices, "12kg", "buying_price", {
        mode: "effectiveAt",
        target: new Date("2026-02-01T00:00:00Z"),
      })
    ).toBe(307);
  });

  it("ignores null and undefined price fields", () => {
    const prices = [
      price({ id: "null", buying_price: null, effective_from: "2026-03-01T00:00:00Z" }),
      price({ id: "undefined", buying_price: undefined, effective_from: "2026-02-01T00:00:00Z" }),
      price({ id: "valid", buying_price: 307, effective_from: "2026-01-01T00:00:00Z" }),
    ];

    expect(resolvePriceValue(prices, "12kg", "buying_price", { mode: "latest" })).toBe(307);
  });

  it("returns zero when no matching price exists", () => {
    const prices = [
      price({ id: "other-gas", gas_type: "48kg", buying_price: 480 }),
    ];

    expect(resolvePriceValue(prices, "12kg", "buying_price", { mode: "latest" })).toBe(0);
  });
});

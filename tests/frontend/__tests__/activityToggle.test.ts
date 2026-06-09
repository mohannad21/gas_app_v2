import {
  ACTIVITY_TOGGLE_VARIANTS,
  applyActivityToggleTap,
  applyActivityToggleTargetChange,
  computeActivityToggleSnap,
  getActivityToggleSnapshot,
  getActivityToggleVariant,
  initActivityToggle,
} from "@/lib/activityToggle";

describe("activity toggle snapshots", () => {
  it("initializes at target with success color", () => {
    expect(initActivityToggle(100)).toEqual({
      state: "target",
      fieldValue: 100,
      colorRole: "success",
    });
  });

  it("creates a zero snapshot with danger color", () => {
    expect(getActivityToggleSnapshot("zero", 100)).toEqual({
      state: "zero",
      fieldValue: 0,
      colorRole: "danger",
    });
  });

  it("supports decimal targets", () => {
    expect(initActivityToggle(49.99)).toEqual({
      state: "target",
      fieldValue: 49.99,
      colorRole: "success",
    });
  });

  it("initializes target zero as target state", () => {
    expect(initActivityToggle(0)).toEqual({
      state: "target",
      fieldValue: 0,
      colorRole: "success",
    });
  });
});

describe("activity toggle tap cycle", () => {
  it("moves from target to zero", () => {
    expect(applyActivityToggleTap("target", 100)).toEqual({
      state: "zero",
      fieldValue: 0,
      colorRole: "danger",
    });
  });

  it("moves from zero to target", () => {
    expect(applyActivityToggleTap("zero", 100)).toEqual({
      state: "target",
      fieldValue: 100,
      colorRole: "success",
    });
  });

  it("restores decimal target when moving from zero to target", () => {
    expect(applyActivityToggleTap("zero", 99.5)).toEqual({
      state: "target",
      fieldValue: 99.5,
      colorRole: "success",
    });
  });
});

describe("activity toggle field snap", () => {
  it("snaps to target when field equals target", () => {
    expect(computeActivityToggleSnap(100, 100)).toEqual({ state: "target" });
  });

  it("snaps to zero when field is 0 and target is non-zero", () => {
    expect(computeActivityToggleSnap(0, 100)).toEqual({ state: "zero" });
  });

  it("snaps to target when field and target are both 0", () => {
    expect(computeActivityToggleSnap(0, 0)).toEqual({ state: "target" });
  });

  it("returns null for custom values", () => {
    expect(computeActivityToggleSnap(50, 100)).toBeNull();
  });

  it("returns null for a value just below target", () => {
    expect(computeActivityToggleSnap(99, 100)).toBeNull();
  });

  it("supports decimal target snapping", () => {
    expect(computeActivityToggleSnap(99.5, 99.5)).toEqual({ state: "target" });
    expect(computeActivityToggleSnap(0, 99.5)).toEqual({ state: "zero" });
    expect(computeActivityToggleSnap(50.25, 99.5)).toBeNull();
  });
});

describe("activity toggle target changes", () => {
  it("updates field when previous field was old target", () => {
    expect(
      applyActivityToggleTargetChange({
        previousFieldValue: 100,
        previousTarget: 100,
        nextTarget: 200,
        previousState: "target",
      })
    ).toEqual({ state: "target", fieldValue: 200 });
  });

  it("preserves manual custom field value", () => {
    expect(
      applyActivityToggleTargetChange({
        previousFieldValue: 75,
        previousTarget: 100,
        nextTarget: 200,
        previousState: "target",
      })
    ).toEqual({ state: "target", fieldValue: 75 });
  });

  it("preserves zero field when previous state was zero", () => {
    expect(
      applyActivityToggleTargetChange({
        previousFieldValue: 0,
        previousTarget: 100,
        nextTarget: 200,
        previousState: "zero",
      })
    ).toEqual({ state: "zero", fieldValue: 0 });
  });
});

describe("activity toggle field mapping", () => {
  it("covers exactly the 16 button-controlled fields", () => {
    expect(Object.keys(ACTIVITY_TOGGLE_VARIANTS)).toHaveLength(16);
  });

  it("maps receive fields correctly", () => {
    expect(getActivityToggleVariant("payment_from_company_money")).toBe("receive");
    expect(getActivityToggleVariant("replacement_cylinders")).toBe("receive");
  });

  it("maps return fields correctly", () => {
    expect(getActivityToggleVariant("customer_return_empties_12kg")).toBe("return");
    expect(getActivityToggleVariant("customer_return_empties_48kg")).toBe("return");
    expect(getActivityToggleVariant("refill_12kg_return")).toBe("return");
    expect(getActivityToggleVariant("refill_48kg_return")).toBe("return");
    expect(getActivityToggleVariant("dist_return_empties_12kg")).toBe("return");
    expect(getActivityToggleVariant("dist_return_empties_48kg")).toBe("return");
  });

  it("maps payment fields correctly", () => {
    expect(getActivityToggleVariant("replacement_money")).toBe("payment");
    expect(getActivityToggleVariant("payment_from_customer_money")).toBe("payment");
    expect(getActivityToggleVariant("payment_to_customer_money")).toBe("payment");
    expect(getActivityToggleVariant("sell_full_money")).toBe("payment");
    expect(getActivityToggleVariant("buy_empty_from_customer_money")).toBe("payment");
    expect(getActivityToggleVariant("refill_money")).toBe("payment");
    expect(getActivityToggleVariant("buy_full_from_company_money")).toBe("payment");
    expect(getActivityToggleVariant("payment_to_company_money")).toBe("payment");
  });

  it("does not include no-button activities", () => {
    expect(ACTIVITY_TOGGLE_VARIANTS).not.toHaveProperty("adjust_customer_balance");
    expect(ACTIVITY_TOGGLE_VARIANTS).not.toHaveProperty("adjust_company_balance");
    expect(ACTIVITY_TOGGLE_VARIANTS).not.toHaveProperty("adjust_inventory");
    expect(ACTIVITY_TOGGLE_VARIANTS).not.toHaveProperty("bank_to_wallet");
    expect(ACTIVITY_TOGGLE_VARIANTS).not.toHaveProperty("wallet_to_bank");
    expect(ACTIVITY_TOGGLE_VARIANTS).not.toHaveProperty("adjust_wallet");
    expect(ACTIVITY_TOGGLE_VARIANTS).not.toHaveProperty("expense");
  });
});

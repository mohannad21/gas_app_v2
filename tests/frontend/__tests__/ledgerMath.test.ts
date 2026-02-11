import {
  calcCompanyCylinderLedgerDelta,
  calcCompanyCylinderUiResult,
  calcCustomerCylinderDelta,
  calcCustomerMoneyDelta,
  calcMoneyUiResult,
} from "@/lib/ledgerMath";

describe("ledgerMath helpers", () => {
  it("calculates customer money delta with buy_iron sign flip", () => {
    expect(calcCustomerMoneyDelta("replacement", 100, 40)).toBe(60);
    expect(calcCustomerMoneyDelta("buy_iron", 100, 40)).toBe(-60);
  });

  it("calculates customer cylinder delta for replacement and return only", () => {
    expect(calcCustomerCylinderDelta("replacement", 5, 2)).toBe(3);
    expect(calcCustomerCylinderDelta("return", 0, 3)).toBe(-3);
    expect(calcCustomerCylinderDelta("sell_iron", 5, 2)).toBe(0);
  });

  it("calculates company cylinder deltas for ledger and UI", () => {
    expect(calcCompanyCylinderLedgerDelta(5, 2)).toBe(-3);
    expect(calcCompanyCylinderUiResult(5, 2)).toBe(3);
  });

  it("calculates money UI result as total minus paid", () => {
    expect(calcMoneyUiResult(200, 50)).toBe(150);
  });
});

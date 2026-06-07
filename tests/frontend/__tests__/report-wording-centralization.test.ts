import {
  BALANCE_SUMMARY_WORDING,
  formatCylinderUnitLabel,
  formatReportTimestampLabel,
  getLedgerBoxLabel,
  REPORT_WORDING,
} from "@/lib/wording";

describe("report wording registry", () => {
  it("preserves expanded panel labels", () => {
    expect(REPORT_WORDING.expanded.noChange).toBe("No change");
    expect(REPORT_WORDING.expanded.noTopLevelStateChange).toBe("No top-level state change for this activity.");
    expect(REPORT_WORDING.ledgerBoxes.wallet).toBe("Wallet");
    expect(getLedgerBoxLabel("12kg", "full")).toBe("12kg Full");
    expect(getLedgerBoxLabel("12kg", "empty")).toBe("12kg Empty");
    expect(getLedgerBoxLabel("48kg", "full")).toBe("48kg Full");
    expect(getLedgerBoxLabel("48kg", "empty")).toBe("48kg Empty");
  });

  it("preserves report section and action labels", () => {
    expect(REPORT_WORDING.sections.customerBalances).toBe("Customer Balances");
    expect(REPORT_WORDING.sections.companyBalances).toBe("Company Balances");
    expect(REPORT_WORDING.buttons.adjustInventory).toBe("Adjust Inventory");
    expect(REPORT_WORDING.buttons.adjustWallet).toBe("Adjust Wallet");
    expect(REPORT_WORDING.buttons.adjustBalances).toBe("Adjust balances");
    expect(REPORT_WORDING.actions.deleted).toBe("Deleted");
    expect(REPORT_WORDING.actions.delete).toBe("Delete");
    expect(REPORT_WORDING.metrics.net).toBe("Net");
  });

  it("preserves timestamp formatting", () => {
    expect(formatReportTimestampLabel("createdAt", "2026-06-01 10:00:00")).toBe("Created at: 2026-06-01 10:00:00");
    expect(formatReportTimestampLabel("effectiveAt", "2026-06-01 10:00:00")).toBe("Effective at: 2026-06-01 10:00:00");
  });

  it("preserves balance summary labels and cylinder units", () => {
    expect(BALANCE_SUMMARY_WORDING.labels.moneyDebt).toBe("Money debt");
    expect(BALANCE_SUMMARY_WORDING.componentLabels.money).toBe("Money balance");
    expect(BALANCE_SUMMARY_WORDING.units.cylinderShort).toBe("cyl");
    expect(formatCylinderUnitLabel(1, "empty")).toBe("empty cylinder");
    expect(formatCylinderUnitLabel(2, "empty")).toBe("empty cylinders");
    expect(formatCylinderUnitLabel(1, "full")).toBe("full cylinder");
    expect(formatCylinderUnitLabel(2, "full")).toBe("full cylinders");
  });
});

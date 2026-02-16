import { buildCollapsedLines } from "@/lib/reports/smartTicket";

const fixtures = require("../test/fixtures/smart-ticket.json");

const formatters = {
  formatMoney: (value: number) => String(value),
  formatCount: (value: number) => String(value),
  formatSigned: (value: number) => (value > 0 ? `+${value}` : `${value}`),
};

describe("SmartTicket collapsed output", () => {
  it("matches fixture expectations", () => {
    fixtures.forEach((fixture: any) => {
      const lines = buildCollapsedLines(fixture.ctx, formatters).map((line) => line.text);
      expect(lines).toEqual(fixture.expected);
      const joined = lines.join(" ");
      expect(joined).not.toMatch(/Result/i);
      expect(joined).not.toMatch(/owes/i);
      expect(joined).not.toMatch(/credit/i);
      expect(joined).not.toMatch(/debt/i);
      expect(fixture.ctx?.ev && typeof fixture.ctx.ev.is_balanced === "boolean").toBe(true);
      expect(Array.isArray(fixture.ctx?.ev?.action_lines)).toBe(true);
      if (fixture.expectOk === true) {
        expect(joined).toContain("\u2705 OK");
      }
      if (fixture.expectOk === false) {
        expect(joined).not.toContain("\u2705 OK");
      }
      if (Array.isArray(fixture.forbid)) {
        fixture.forbid.forEach((token: string) => {
          expect(joined).not.toContain(token);
        });
      }
    });
  });
});

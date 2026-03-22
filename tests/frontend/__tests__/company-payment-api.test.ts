const mockBuildHappenedAt = jest.fn(() => "2025-01-10T17:21:00.000Z");

jest.mock("@/lib/date", () => ({
  buildHappenedAt: (...args: unknown[]) => mockBuildHappenedAt(...args),
}));

import { api, createCompanyPayment } from "@/lib/api";

describe("createCompanyPayment", () => {
  const mockPost = jest.fn();

  beforeEach(() => {
    mockPost.mockReset();
    mockBuildHappenedAt.mockClear();
    (api as any).post = mockPost;
  });

  it("uses the shared happened_at builder and posts happened_at instead of raw date/time", async () => {
    mockPost.mockResolvedValue({
      data: {
        id: "payment-1",
        happened_at: "2025-01-10T17:21:00.000Z",
        amount: 5000,
        note: "supplier",
      },
    });

    await createCompanyPayment({
      amount: 50,
      date: "2025-01-10",
      time: "18:21",
      note: "supplier",
      request_id: "req-1",
    });

    expect(mockBuildHappenedAt).toHaveBeenCalledWith({
      date: "2025-01-10",
      time: "18:21",
    });
    expect(mockPost).toHaveBeenCalledWith("/company/payments", {
      amount: 5000,
      note: "supplier",
      request_id: "req-1",
      happened_at: "2025-01-10T17:21:00.000Z",
    });
  });
});

import { api, createCollection } from "@/lib/api";

describe("createCollection", () => {
  const mockPost = jest.fn();

  beforeEach(() => {
    mockPost.mockReset();
    (api as any).post = mockPost;
  });

  it("forwards request_id when creating a payment collection", async () => {
    mockPost.mockResolvedValue({
      data: {
        id: "collection-1",
        customer_id: "cust-1",
        action_type: "payment",
        amount_money: 5000,
        qty_12kg: null,
        qty_48kg: null,
        debt_cash: 10000,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        system_id: null,
        created_at: "2025-01-10T17:21:00.000Z",
        effective_at: "2025-01-10T17:21:00.000Z",
        note: "payment",
      },
    });

    await createCollection({
      customer_id: "cust-1",
      action_type: "payment",
      amount_money: 50,
      debt_cash: 100,
      debt_cylinders_12: 0,
      debt_cylinders_48: 0,
      effective_at: "2025-01-10T17:21:00.000Z",
      note: "payment",
      request_id: "req-123",
    });

    expect(mockPost).toHaveBeenCalledWith("/collections", {
      customer_id: "cust-1",
      action_type: "payment",
      amount_money: 5000,
      debt_cash: 10000,
      debt_cylinders_12: 0,
      debt_cylinders_48: 0,
      effective_at: "2025-01-10T17:21:00.000Z",
      happened_at: "2025-01-10T17:21:00.000Z",
      note: "payment",
      request_id: "req-123",
    });
  });
});

import { api, createOrder } from "@/lib/api";

describe("createOrder", () => {
  const mockPost = jest.fn();

  beforeEach(() => {
    mockPost.mockReset();
    (api as any).post = mockPost;
  });

  it("forwards request_id when creating an order", async () => {
    mockPost.mockResolvedValue({
      data: {
        id: "order-1",
        customer_id: "cust-1",
        system_id: "sys-1",
        delivered_at: "2025-01-10T10:00:00.000Z",
        created_at: "2025-01-10T10:00:00.000Z",
        order_mode: "replacement",
        gas_type: "12kg",
        cylinders_installed: 1,
        cylinders_received: 1,
        price_total: 5000,
        paid_amount: 5000,
        debt_cash: 0,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        note: "test",
      },
    });

    await createOrder({
      customer_id: "cust-1",
      system_id: "sys-1",
      delivered_at: "2025-01-10T10:00:00.000Z",
      gas_type: "12kg",
      cylinders_installed: 1,
      cylinders_received: 1,
      price_total: 50,
      paid_amount: 50,
      debt_cash: 0,
      debt_cylinders_12: 0,
      debt_cylinders_48: 0,
      note: "test",
      request_id: "req-123",
    });

    expect(mockPost).toHaveBeenCalledWith("/orders", {
      customer_id: "cust-1",
      system_id: "sys-1",
      delivered_at: "2025-01-10T10:00:00.000Z",
      gas_type: "12kg",
      cylinders_installed: 1,
      cylinders_received: 1,
      price_total: 5000,
      paid_amount: 5000,
      debt_cash: 0,
      debt_cylinders_12: 0,
      debt_cylinders_48: 0,
      note: "test",
      request_id: "req-123",
      happened_at: "2025-01-10T10:00:00.000Z",
    });
  });
});

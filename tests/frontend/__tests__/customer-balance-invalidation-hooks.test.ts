import {
  useCreateCustomerAdjustment,
  customerBalanceQueryKey,
} from "@/hooks/useCustomers";
import { useCreateOrder, useDeleteOrder, useUpdateOrder } from "@/hooks/useOrders";
import {
  useCreateCollection,
  useDeleteCollection,
  useUpdateCollection,
} from "@/hooks/useCollections";

const mockUseMutation = jest.fn((config) => config);
const mockUseQuery = jest.fn();
const mockShowToast = jest.fn();

const mockQueryClient = {
  invalidateQueries: jest.fn(),
  getQueryData: jest.fn(),
  setQueryData: jest.fn(),
};

jest.mock("@tanstack/react-query", () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => mockQueryClient,
}));

jest.mock("@/lib/toast", () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

jest.mock("@/lib/api", () => ({
  createOrder: jest.fn(),
  deleteOrder: jest.fn(),
  listOrders: jest.fn(),
  listOrdersByDate: jest.fn(),
  updateOrder: jest.fn(),
  createCollection: jest.fn(),
  deleteCollection: jest.fn(),
  listCollections: jest.fn(),
  updateCollection: jest.fn(),
  createCustomer: jest.fn(),
  createCustomerAdjustment: jest.fn(),
  deleteCustomer: jest.fn(),
  getCustomerBalance: jest.fn(),
  listCustomerAdjustments: jest.fn(),
  listCustomers: jest.fn(),
  updateCustomer: jest.fn(),
}));

describe("customer balance invalidation hooks", () => {
  beforeEach(() => {
    mockUseMutation.mockClear();
    mockUseQuery.mockClear();
    mockShowToast.mockClear();
    mockQueryClient.invalidateQueries.mockClear();
    mockQueryClient.getQueryData.mockReset();
    mockQueryClient.setQueryData.mockClear();
  });

  it("invalidates the exact customer balance query after create order", () => {
    const mutation = useCreateOrder() as any;

    mutation.onSuccess({}, { customer_id: "cust-1" });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: customerBalanceQueryKey("cust-1"),
    });
  });

  it("invalidates the exact customer balance query after update order", () => {
    const mutation = useUpdateOrder() as any;

    mutation.onSuccess(
      {},
      {
        id: "order-1",
        payload: { customer_id: "cust-2" },
      }
    );

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: customerBalanceQueryKey("cust-2"),
    });
  });

  it("invalidates the cached customer balance query after delete order", () => {
    mockQueryClient.getQueryData.mockReturnValue([{ id: "order-1", customer_id: "cust-3" }]);
    const mutation = useDeleteOrder() as any;

    mutation.onSuccess({}, "order-1");

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: customerBalanceQueryKey("cust-3"),
    });
  });

  it("invalidates the exact customer balance query after create collection", () => {
    const mutation = useCreateCollection() as any;

    mutation.onSuccess({}, { customer_id: "cust-4", action_type: "payment" });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: customerBalanceQueryKey("cust-4"),
    });
  });

  it("invalidates the cached customer balance query after update collection", () => {
    mockQueryClient.getQueryData.mockReturnValue([{ id: "col-1", customer_id: "cust-5" }]);
    const mutation = useUpdateCollection() as any;

    mutation.onSuccess(
      {},
      {
        id: "col-1",
        payload: { action_type: "return" },
      }
    );

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: customerBalanceQueryKey("cust-5"),
    });
  });

  it("invalidates the cached customer balance query after delete collection", () => {
    mockQueryClient.getQueryData.mockReturnValue([{ id: "col-2", customer_id: "cust-6" }]);
    const mutation = useDeleteCollection() as any;

    mutation.onSuccess({}, "col-2");

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: customerBalanceQueryKey("cust-6"),
    });
  });

  it("invalidates the exact customer balance query after create customer adjustment", () => {
    const mutation = useCreateCustomerAdjustment({ showToast: false }) as any;

    mutation.onSuccess({}, { customer_id: "cust-7", amount: 25 });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: customerBalanceQueryKey("cust-7"),
    });
  });
});

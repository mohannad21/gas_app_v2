const mockInvalidateQueries = jest.fn();
const mockGetQueryData = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries, getQueryData: mockGetQueryData }),
  useQuery: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  createCompanyBalanceAdjustment: jest.fn(),
  deleteCompanyBalanceAdjustment: jest.fn(),
  getCompanyBalances: jest.fn(),
  listCompanyBalanceAdjustments: jest.fn(),
  updateCompanyBalanceAdjustment: jest.fn(),
  createCompanyPayment: jest.fn(),
  deleteCompanyPayment: jest.fn(),
  listCompanyPayments: jest.fn(),
  createCompanyBuyIron: jest.fn(),
  createInventoryAdjust: jest.fn(),
  createInventoryRefill: jest.fn(),
  deleteInventoryAdjustment: jest.fn(),
  deleteInventoryRefill: jest.fn(),
  getInventoryLatest: jest.fn(),
  getInventoryRefillDetails: jest.fn(),
  getInventorySnapshot: jest.fn(),
  initInventory: jest.fn(),
  listInventoryAdjustments: jest.fn(),
  listInventoryRefills: jest.fn(),
  updateInventoryAdjustment: jest.fn(),
  updateInventoryRefill: jest.fn(),
  createCustomer: jest.fn(),
  createCustomerAdjustment: jest.fn(),
  deleteCustomer: jest.fn(),
  deleteCustomerAdjustment: jest.fn(),
  getCustomerBalance: jest.fn(),
  listCustomerAdjustments: jest.fn(),
  listCustomers: jest.fn(),
  updateCustomer: jest.fn(),
  createCollection: jest.fn(),
  deleteCollection: jest.fn(),
  listCollections: jest.fn(),
  updateCollection: jest.fn(),
}));

jest.mock("@/lib/apiErrors", () => ({
  getUserFacingApiError: () => "error",
  logApiError: jest.fn(),
}));

jest.mock("@/lib/toast", () => ({
  showToast: jest.fn(),
}));

import {
  useCreateCompanyBalanceAdjustment,
  useDeleteCompanyBalanceAdjustment,
  useUpdateCompanyBalanceAdjustment,
} from "@/hooks/useCompanyBalances";
import { useCreateCompanyPayment, useDeleteCompanyPayment } from "@/hooks/useCompanyPayments";
import { useCreateRefill, useDeleteRefill, useUpdateRefill } from "@/hooks/useInventory";
import { useCreateCustomerAdjustment, useDeleteCustomerAdjustment } from "@/hooks/useCustomers";
import { useDeleteCollection, useUpdateCollection } from "@/hooks/useCollections";

describe("activity cross invalidation", () => {
  beforeEach(() => {
    mockInvalidateQueries.mockClear();
    mockGetQueryData.mockReset();
  });

  function expectInvalidated(queryKey: unknown[], options?: { exact?: boolean }) {
    if (options) {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey, ...options });
      return;
    }
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey });
  }

  it("company balance adjustment mutations invalidate later refill and payment queries", async () => {
    await useCreateCompanyBalanceAdjustment().onSuccess?.();
    await useUpdateCompanyBalanceAdjustment().onSuccess?.();
    await useDeleteCompanyBalanceAdjustment().onSuccess?.();

    expectInvalidated(["company", "payments"]);
    expectInvalidated(["inventory", "refills"]);
    expectInvalidated(["company", "adjustments"]);
    expectInvalidated(["company", "balances"]);
    expectInvalidated(["reports-v2"], { exact: false });
    expectInvalidated(["reports-day-v2"], { exact: false });
  });

  it("company payment mutations invalidate refills and adjustments", async () => {
    await useCreateCompanyPayment().onSuccess?.();
    await useDeleteCompanyPayment().onSuccess?.();

    expectInvalidated(["inventory", "refills"]);
    expectInvalidated(["company", "adjustments"]);
    expectInvalidated(["company", "payments"]);
  });

  it("refill mutations invalidate company payments and adjustments", async () => {
    await useCreateRefill().onSuccess?.();
    await useUpdateRefill().onSuccess?.();
    await useDeleteRefill().onSuccess?.();

    expectInvalidated(["company", "payments"]);
    expectInvalidated(["company", "adjustments"]);
    expectInvalidated(["inventory", "refills"]);
  });

  it("customer adjustment mutations invalidate later orders and collections", async () => {
    await useCreateCustomerAdjustment().onSuccess?.({}, { customer_id: "cust-1" });
    await useDeleteCustomerAdjustment().onSuccess?.({}, { id: "adj-1", customerId: "cust-1" });

    expectInvalidated(["orders"]);
    expectInvalidated(["collections"]);
    expectInvalidated(["customers", "adjustments", "cust-1"]);
    expectInvalidated(["customers", "adjustments", "all"], { exact: false });
    expectInvalidated(["reports-day-v2"], { exact: false });
  });

  it("collection update and delete invalidate later orders", async () => {
    mockGetQueryData.mockReturnValue([{ id: "col-1", customer_id: "cust-1" }]);

    await useUpdateCollection().onSuccess?.({}, { id: "col-1", payload: { note: "updated" } });
    await useDeleteCollection().onSuccess?.({}, "col-1");

    expectInvalidated(["orders"]);
    expectInvalidated(["collections"]);
    expectInvalidated(["customers", "adjustments", "cust-1"]);
    expectInvalidated(["customers", "adjustments", "all"], { exact: false });
  });
});

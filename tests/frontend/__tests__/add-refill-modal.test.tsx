import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { PriceSetting } from "@/types/price";

const mockCreateRefillMutateAsync = jest.fn().mockResolvedValue({});
const mockCreateBuyFullFromCompanyMutateAsync = jest.fn().mockResolvedValue({});
const mockUpdateRefillMutateAsync = jest.fn().mockResolvedValue({});
const mockInitInventoryMutateAsync = jest.fn().mockResolvedValue({});
let mockPriceRows: PriceSetting[] = [];

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("@/hooks/useInventory", () => ({
  useCreateBuyFullFromCompany: () => ({ mutateAsync: mockCreateBuyFullFromCompanyMutateAsync, isPending: false }),
  useCreateRefill: () => ({ mutateAsync: mockCreateRefillMutateAsync, isPending: false }),
  useInitInventory: () => ({ mutateAsync: mockInitInventoryMutateAsync, isPending: false }),
  useInventoryRefillDetails: () => ({ data: null }),
  useInventoryLatest: () => ({
    data: { full12: 10, empty12: 3, full48: 6, empty48: 1 },
    isLoading: false,
  }),
  useInventorySnapshot: () => ({
    data: { full12: 10, empty12: 3, full48: 6, empty48: 1 },
  }),
  useUpdateRefill: () => ({ mutateAsync: mockUpdateRefillMutateAsync, isPending: false }),
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({
    data: mockPriceRows,
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: { company_money: 0, company_cyl_12: 2, company_cyl_48: -1 },
    isSuccess: true,
  }),
}));

jest.mock("@/components/InlineWalletFundingPrompt", () => () => null);

import { RefillForm, sanitizeBuyCountInput } from "@/components/AddRefillModal";

describe("AddRefillModal company activity behavior", () => {
  beforeEach(() => {
    mockCreateRefillMutateAsync.mockClear();
    mockCreateBuyFullFromCompanyMutateAsync.mockClear();
    mockUpdateRefillMutateAsync.mockClear();
    mockInitInventoryMutateAsync.mockClear();
    mockPriceRows = [
      {
        id: "price-12",
        gas_type: "12kg",
        selling_price: 0,
        buying_price: 75,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 0,
        effective_from: "2026-01-01T00:00:00Z",
      },
      {
        id: "price-48",
        gas_type: "48kg",
        selling_price: 0,
        buying_price: 480,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 0,
        effective_from: "2026-01-01T00:00:00Z",
      },
    ];
  });

  it("does not cap buy-full quantities by empties", () => {
    expect(sanitizeBuyCountInput("8", 3, true)).toBe("8");
  });

  it("still caps non-buy quantities by available empties", () => {
    expect(sanitizeBuyCountInput("8", 3, false)).toBe("3");
  });

  it("uses the dedicated company buy path and hides refill return wording in buy mode", async () => {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    const { getAllByText, getByText, queryByText } = render(
      <RefillForm visible onClose={onClose} onSaved={onSaved} mode="buy" walletBalance={500} />
    );

    expect(queryByText("12kg Return")).toBeNull();
    expect(queryByText("48kg Return")).toBeNull();

    fireEvent.press(getAllByText("+")[0]);
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(mockCreateBuyFullFromCompanyMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          new12: 1,
          new48: 0,
          total_cost: 75,
          paid_amount: 75,
        })
      );
    });
    expect(mockCreateRefillMutateAsync).not.toHaveBeenCalled();
  });

  it("uses the latest gas buying price for new refill entries", async () => {
    mockPriceRows = [
      {
        id: "old-12",
        gas_type: "12kg",
        selling_price: 0,
        buying_price: 307,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 0,
        effective_from: "2026-01-01T00:00:00Z",
      },
      {
        id: "new-12",
        gas_type: "12kg",
        selling_price: 0,
        buying_price: 317,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 0,
        effective_from: "2099-01-01T00:00:00Z",
      },
      {
        id: "price-48",
        gas_type: "48kg",
        selling_price: 0,
        buying_price: 480,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 0,
        effective_from: "2026-01-01T00:00:00Z",
      },
    ];

    const { getAllByText, getByText } = render(
      <RefillForm visible onClose={jest.fn()} onSaved={jest.fn()} mode="refill" walletBalance={500} />
    );

    fireEvent.press(getAllByText("+")[0]);
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(mockCreateRefillMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          buy12: 1,
          buy48: 0,
          total_cost: 317,
          paid_amount: 317,
        })
      );
    });
  });

  it("uses the latest gas and company iron prices for new buy-full entries", async () => {
    mockPriceRows = [
      {
        id: "old-12",
        gas_type: "12kg",
        selling_price: 0,
        buying_price: 75,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 200,
        effective_from: "2026-01-01T00:00:00Z",
      },
      {
        id: "new-12",
        gas_type: "12kg",
        selling_price: 0,
        buying_price: 75,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 220,
        effective_from: "2099-01-01T00:00:00Z",
      },
      {
        id: "price-48",
        gas_type: "48kg",
        selling_price: 0,
        buying_price: 480,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 0,
        effective_from: "2026-01-01T00:00:00Z",
      },
    ];

    const { getAllByText, getByText } = render(
      <RefillForm visible onClose={jest.fn()} onSaved={jest.fn()} mode="buy" walletBalance={500} />
    );

    fireEvent.press(getAllByText("+")[0]);
    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(mockCreateBuyFullFromCompanyMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          new12: 1,
          new48: 0,
          total_cost: 295,
          paid_amount: 295,
        })
      );
    });
  });

  it("keeps historical price resolution when editing an existing entry", async () => {
    mockPriceRows = [
      {
        id: "old-12",
        gas_type: "12kg",
        selling_price: 0,
        buying_price: 307,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 0,
        effective_from: "2026-01-01T00:00:00Z",
      },
      {
        id: "future-12",
        gas_type: "12kg",
        selling_price: 0,
        buying_price: 317,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 0,
        effective_from: "2026-03-01T00:00:00Z",
      },
      {
        id: "price-48",
        gas_type: "48kg",
        selling_price: 0,
        buying_price: 480,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 0,
        effective_from: "2026-01-01T00:00:00Z",
      },
    ];

    const { getByDisplayValue, getByText } = render(
      <RefillForm
        visible
        onClose={jest.fn()}
        onSaved={jest.fn()}
        mode="refill"
        walletBalance={500}
        editEntry={{
          refill_id: "refill-1",
          date: "2026-02-01",
          effective_at: "2026-02-01T00:00:00Z",
          buy12: 1,
          return12: 0,
          buy48: 0,
          return48: 0,
        }}
      />
    );

    await waitFor(() => expect(getByDisplayValue("1")).toBeTruthy());

    fireEvent.press(getByText("Save"));

    await waitFor(() => {
      expect(mockUpdateRefillMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          refillId: "refill-1",
          buy12: 1,
          buy48: 0,
          total_cost: 307,
        })
      );
    });
  });

  it("shows each return balance line only in its matching gas box", () => {
    const { getAllByText } = render(
      <RefillForm visible onClose={jest.fn()} onSaved={jest.fn()} mode="return" walletBalance={500} />
    );

    expect(getAllByText("Credit for distributor 2x12kg full cylinders")).toHaveLength(1);
    expect(getAllByText("Debts on distributor 1x48kg empty cylinder")).toHaveLength(1);
  });
});

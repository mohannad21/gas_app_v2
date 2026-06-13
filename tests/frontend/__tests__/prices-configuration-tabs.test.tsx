import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import PricesConfigurationScreen from "@/app/(tabs)/account/configuration/prices";

const mockReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUsePriceSettings = jest.fn();
const mockUseSavePriceSetting = jest.fn();
const mockMutateAsync = jest.fn();

jest.mock("expo-router", () => ({
  Stack: {
    Screen: () => null,
  },
  useRouter: () => ({
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => mockUsePriceSettings(),
  useSavePriceSetting: () => mockUseSavePriceSetting(),
}));

const priceRows = [
  {
    gas_type: "12kg",
    effective_from: "2026-01-02",
    selling_price: 75,
    buying_price: 40,
    buying_iron_price: 8,
    company_iron_price: 9,
    selling_iron_price: 11,
  },
  {
    gas_type: "48kg",
    effective_from: "2026-01-02",
    selling_price: 175,
    buying_price: 140,
    buying_iron_price: 18,
    company_iron_price: 19,
    selling_iron_price: 21,
  },
];

describe("PricesConfigurationScreen tabs", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockUseLocalSearchParams.mockReset();
    mockUsePriceSettings.mockReset();
    mockUseSavePriceSetting.mockReset();
    mockMutateAsync.mockReset();

    mockUseLocalSearchParams.mockReturnValue({ section: undefined });

    mockUsePriceSettings.mockReturnValue({
      data: priceRows,
      isLoading: false,
      isError: false,
    });

    mockMutateAsync.mockResolvedValue(undefined);
    mockUseSavePriceSetting.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
  });

  it("shows one selected price section at a time", async () => {
    const view = render(<PricesConfigurationScreen />);

    await waitFor(() => expect(view.getByTestId("price-form-section-gasBuyFromCompany")).toBeTruthy());

    expect(view.getByText("Old 40")).toBeTruthy();
    expect(view.getByText("Old 140")).toBeTruthy();

    expect(view.getByTestId("price-family-gas")).toBeTruthy();
    expect(view.getByTestId("price-family-iron")).toBeTruthy();
    expect(view.getByTestId("price-section-gasBuyFromCompany")).toBeTruthy();
    expect(view.getByTestId("price-section-gasSellToCustomer")).toBeTruthy();

    expect(view.queryByTestId("price-form-section-gasSellToCustomer")).toBeNull();
    expect(view.queryByTestId("price-form-section-ironBuyFromCustomer")).toBeNull();

    fireEvent.press(view.getByTestId("price-section-gasSellToCustomer"));
    expect(view.getByTestId("price-form-section-gasSellToCustomer")).toBeTruthy();
    expect(view.queryByTestId("price-form-section-gasBuyFromCompany")).toBeNull();

    fireEvent.press(view.getByTestId("price-family-iron"));
    expect(view.getByTestId("price-form-section-ironBuyFromCustomer")).toBeTruthy();
    expect(view.getByTestId("price-section-ironBuyFromCustomer")).toBeTruthy();
    expect(view.getByTestId("price-section-ironBuyFromCompany")).toBeTruthy();
    expect(view.getByTestId("price-section-ironSellToCustomer")).toBeTruthy();

    fireEvent.press(view.getByTestId("price-section-ironBuyFromCompany"));
    expect(view.getByTestId("price-form-section-ironBuyFromCompany")).toBeTruthy();
    expect(view.queryByTestId("price-form-section-ironBuyFromCustomer")).toBeNull();
  });

  it("preserves hidden-tab edits and saves all values", async () => {
    const view = render(<PricesConfigurationScreen />);

    await waitFor(() => expect(view.getByTestId("price-form-section-gasBuyFromCompany")).toBeTruthy());

    fireEvent.changeText(view.getByDisplayValue("40.00"), "44");

    fireEvent.press(view.getByTestId("price-family-iron"));
    fireEvent.press(view.getByTestId("price-section-ironBuyFromCompany"));

    fireEvent.changeText(view.getByDisplayValue("9.00"), "12");

    fireEvent.press(view.getByText("Save Prices"));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));

    expect(mockMutateAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        gas_type: "12kg",
        buying_price: 44,
        company_iron_price: 12,
        selling_price: 75,
        buying_iron_price: 8,
        selling_iron_price: 11,
      })
    );

    expect(mockMutateAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        gas_type: "48kg",
        buying_price: 140,
        company_iron_price: 19,
        selling_price: 175,
        buying_iron_price: 18,
        selling_iron_price: 21,
      })
    );
  });

  it("opens the section from the route param", async () => {
    mockUseLocalSearchParams.mockReturnValue({ section: "ironSellToCustomer" });

    const view = render(<PricesConfigurationScreen />);

    await waitFor(() => expect(view.getByTestId("price-form-section-ironSellToCustomer")).toBeTruthy());

    expect(view.queryByTestId("price-form-section-gasBuyFromCompany")).toBeNull();
    expect(view.getByTestId("price-section-ironSellToCustomer")).toBeTruthy();
  });
});

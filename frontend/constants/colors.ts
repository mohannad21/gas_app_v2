const CorePalette = {
  white: "#ffffff",
  black: "#000000",

  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate500: "#64748b",
  slate600: "#475569",
  slate900: "#0f172a",

  appBlue: "#0a7ea4",
  customerBlue: "#0ea5e9",
  companyOrange: "#f97316",
  priceTeal: "#14b8a6",
  priceViolet: "#8b5cf6",
  priceAmber: "#f59e0b",
  moneyIndigo: "#6366f1",
  ledgerSlate: "#64748b",

  gas48Orange: "#d97706",

  successGreen: "#16a34a",
  successGreenDark: "#15803d",
  successBg: "#f0fdf4",
  successBorder: "#86efac",

  dangerRed: "#dc2626",
  dangerRedDark: "#b91c1c",
  dangerBg: "#fee2e2",
  dangerBorder: "#fca5a5",

  warningBg: "#fff7ed",
  warningBorder: "#fdba74",
  warningText: "#9a3412",
} as const;

export const AppColors = {
  brand: {
    primary: CorePalette.appBlue,
    onPrimary: CorePalette.white,
  },

  surface: {
    app: "#f6f7f9",
    card: CorePalette.white,
    muted: "#f9fafb",
    subtle: CorePalette.slate50,
  },

  text: {
    primary: CorePalette.slate900,
    secondary: CorePalette.slate600,
    muted: CorePalette.slate500,
    inverse: CorePalette.white,
  },

  border: {
    default: CorePalette.slate200,
    muted: "#d7dde4",
  },

  scope: {
    customer: CorePalette.customerBlue,
    company: CorePalette.companyOrange,
    money: CorePalette.moneyIndigo,
    ledger: CorePalette.ledgerSlate,
  },

  intent: {
    success: CorePalette.successGreen,
    successDark: CorePalette.successGreenDark,
    successBg: CorePalette.successBg,
    successBorder: CorePalette.successBorder,

    danger: CorePalette.dangerRed,
    dangerDark: CorePalette.dangerRedDark,
    dangerBg: CorePalette.dangerBg,
    dangerBorder: CorePalette.dangerBorder,

    warning: CorePalette.gas48Orange,
    warningBg: CorePalette.warningBg,
    warningBorder: CorePalette.warningBorder,
    warningText: CorePalette.warningText,

    neutral: CorePalette.slate500,
    neutralBg: CorePalette.slate50,
    neutralBorder: CorePalette.slate300,
  },

  gas: {
    "12kg": CorePalette.appBlue,
    "48kg": CorePalette.gas48Orange,
    fallback: CorePalette.slate600,
  },

  price: {
    customer: CorePalette.customerBlue,
    company: CorePalette.companyOrange,
    categories: {
      gasBuyFromCompany: CorePalette.companyOrange,
      gasSellToCustomer: CorePalette.customerBlue,
      ironBuyFromCustomer: CorePalette.priceTeal,
      ironBuyFromCompany: CorePalette.priceAmber,
      ironSellToCustomer: CorePalette.priceViolet,
    },
  },

  level3: {
    rowBg: CorePalette.white,
    border: CorePalette.slate200,
    textPrimary: CorePalette.slate900,
    textSecondary: CorePalette.slate600,
    textMuted: CorePalette.slate500,
    money: CorePalette.slate900,
    settledBg: CorePalette.successBg,
    settledBorder: CorePalette.successBorder,
    settledText: "#166534",
    actionChipBg: CorePalette.warningBg,
    actionChipBorder: CorePalette.warningBorder,
    actionChipText: CorePalette.warningText,
    actionLabel: "#7c2d12",
  },
} as const;

export type AppColors = typeof AppColors;
export type PriceCategoryColorKey = keyof typeof AppColors.price.categories;

import { Activity, Customer, DailyReportRow, Order, PriceSetting, System } from "@/types/domain";

export const mockCustomers: Customer[] = [
  {
    id: "c1",
    name: "Acme Co.",
    phone: "+1 555 222 1000",
    notes: "Industrial client",
    customer_type: "industrial",
    money_balance: 420,
    number_of_orders: 23,
    cylinder_balance_12kg: 4,
    cylinder_balance_48kg: 6,
    created_at: "2025-12-01T09:00:00Z",
  },
  {
    id: "c2",
    name: "Blue Grill",
    phone: "+1 555 111 2020",
    customer_type: "private",
    money_balance: 75,
    number_of_orders: 11,
    cylinder_balance_12kg: 2,
    cylinder_balance_48kg: 0,
    created_at: "2025-12-02T10:00:00Z",
  },
  {
    id: "c3",
    name: "Sunrise Hotel",
    phone: "+1 555 333 4040",
    notes: "Prefers morning delivery",
    customer_type: "industrial",
    money_balance: 0,
    number_of_orders: 35,
    cylinder_balance_12kg: 3,
    cylinder_balance_48kg: 4,
    created_at: "2025-12-03T11:00:00Z",
  },
];

export const mockSystems: System[] = [
  {
    id: "s1",
    customer_id: "c1",
    name: "Main Kitchen",
    location: "Home",
    system_type: "main_kitchen",
    gas_type: "12kg",
    system_customer_type: "private",

    // REQUIRED
    is_active: true,
    require_security_check: false,
    security_check_exists: false,
    security_check_date: ""
  },
  {
    id: "s2",
    customer_id: "c2",
    name: "Side Kitchen",
    location: "Extension",
    system_type: "side_kitchen",
    gas_type: "48kg",
    system_customer_type: "commercial",

    is_active: true,
    require_security_check: false,
    security_check_exists: false,
    security_check_date: ""
  },
  {
    id: "s3",
    customer_id: "c3",
    name: "Warehouse",
    location: "Storage",
    system_type: "storage",
    gas_type: "48kg",
    system_customer_type: "commercial",

    is_active: true,
    require_security_check: false,
    security_check_exists: false,
    security_check_date: ""
  }
];


export const mockOrders: Order[] = [
  {
    id: "o1203",
    customer_id: "c1",
    system_id: "s1",
    delivered_at: "2025-12-03",
    gas_type: "48kg",
    cylinders_installed: 6,
    cylinders_received: 2,
    price_total: 540,
    paid_amount: 200,
    note: "Rush order",
  },
  {
    id: "o1204",
    customer_id: "c2",
    system_id: "s2",
    delivered_at: "2025-12-03",
    gas_type: "12kg",
    cylinders_installed: 2,
    cylinders_received: 2,
    price_total: 80,
    paid_amount: 80,
  },
  {
    id: "o1199",
    customer_id: "c3",
    system_id: "s3",
    delivered_at: "2025-12-02",
    gas_type: "48kg",
    cylinders_installed: 5,
    cylinders_received: 3,
    price_total: 420,
    paid_amount: 420,
  },
];

export const mockActivities: Activity[] = [
  { id: "a1", type: "order", description: "Order #1204 created for Blue Grill", created_at: "2025-12-03T13:00:00Z" },
  { id: "a2", type: "customer", description: "Customer “Blue Grill” added", created_at: "2025-12-03T12:45:00Z" },
  { id: "a3", type: "price", description: "Price updated: 12kg → $18", created_at: "2025-12-03T12:30:00Z" },
  { id: "a4", type: "order", description: "Order #1203 updated (paid)", created_at: "2025-12-03T12:00:00Z" },
];

export const mockDailyReports: DailyReportRow[] = [
  {
    date: "2025-12-03",
    display: "Wed, Dec 3",
    installed12: 12,
    received12: 8,
    installed48: 6,
    received48: 2,
    expected: 620,
    received: 420,
  },
  {
    date: "2025-12-02",
    display: "Tue, Dec 2",
    installed12: 9,
    received12: 5,
    installed48: 5,
    received48: 3,
    expected: 540,
    received: 540,
  },
  {
    date: "2025-12-01",
    display: "Mon, Dec 1",
    installed12: 7,
    received12: 7,
    installed48: 4,
    received48: 3,
    expected: 480,
    received: 300,
  },
];

export const mockPrices: PriceSetting[] = [
  { id: "p1", gas_type: "12kg", customer_type: "any", selling_price: 18, effective_from: "2025-12-01" },
  { id: "p2", gas_type: "48kg", customer_type: "any", selling_price: 90, effective_from: "2025-12-01" },
];

export function getCustomerById(id: string) {
  return mockCustomers.find((c) => c.id === id);
}

export function getSystemById(id: string) {
  return mockSystems.find((s) => s.id === id);
}

export function getOrdersByDate(date: string) {
  return mockOrders.filter((o) => o.delivered_at === date);
}

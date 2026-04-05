/**
 * API module - re-exports all domain endpoints
 *
 * For backward compatibility, all functions that were previously in @/lib/api.ts
 * are re-exported from their domain modules here.
 */

// Shared infrastructure - NOT re-exported (internal to domain modules)
export { api } from "./client";

// Customers
export { listCustomers, getCustomerBalance, createCustomer, createCustomerAdjustment, listCustomerAdjustments, updateCustomer, deleteCustomer } from "./customers";

// Orders
export { listOrders, createOrder, updateOrder, deleteOrder, validateOrderImpact, getOrderWhatsappLink } from "./orders";

// Collections
export { createCollection, listCollections, updateCollection, deleteCollection } from "./collections";

// Inventory
export {  getInventoryLatest, initInventory, createInventoryRefill, listInventoryRefills, getInventorySnapshot, getInventoryRefillDetails, updateInventoryRefill, deleteInventoryRefill, createInventoryAdjust } from "./inventory";

// Adjustments (cash + inventory)
export { listInventoryAdjustments, updateInventoryAdjustment, deleteInventoryAdjustment, listCashAdjustments, createCashAdjustment, updateCashAdjustment, deleteCashAdjustment } from "./adjustments";

// Company & System
export { getSystemSettings, getCompanyBalances, createCompanyBalanceAdjustment, createCompanyPayment, listCompanyPayments, createCompanyBuyIron, initializeSystem, getSystemHealthCheck } from "./company";

// Billing
export { getPlanBillingStatus } from "./billing";

// Systems
export { listSystems, createSystem, updateSystem, deleteSystem, listSystemTypes, createSystemType, updateSystemType } from "./systems";

// Workers
export { listWorkers, listPendingInvites, createWorkerInvite, revokeInvite, revokeWorker } from "./workers";

// Expenses
export { listExpenses, createExpense, updateExpense, deleteExpense, listBankDeposits, createBankDeposit, deleteBankDeposit } from "./expenses";

// Prices
export { listPriceSettings, savePriceSetting } from "./prices";

// Reports
export { listDailyReportsV2, getDailyReportV2 } from "./reports";

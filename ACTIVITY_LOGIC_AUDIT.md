# Comprehensive System Logic & UI Audit — Gas App

This document provides a detailed breakdown of how each activity type must affect every system feature, identifies current implementation gaps ("As Is" vs. "Supposed to be"), and lists identified bugs and missing tests.

---

## 1. Feature Impact Matrix (Exhaustive)

| Activity Type | Date Picker (12kg/48kg) | Date Picker (Net) | Customer Review (Orders/Last) | Wallet Pill (Expanded) | Ledger Pills (Expanded) |
|:---|:---:|:---:|:---:|:---:|:---|
| **Replacement** | **Increase** | + Paid | **Update** | **X → Y** | Customer Money & Cylinders |
| **customer paid** | — | **Increase** | — | **X → Y** | Customer Money |
| **Paid customer** | — | **Decrease** | — | **X → Y** | Customer Money |
| **Returned empties** (Cust) | — | — | — | — | Customer Cylinders |
| **Bought empty** (Cust) | — | **Decrease** | — | **X → Y** | Customer Money |
| **Sold full** (Cust) | **Increase** | **Increase** | **Update** | **X → Y** | Customer Money |
| **Balance adjustment** (Cust) | — | — | — | — | Customer Money & Cylinders |
| **Refill** | — | — | — | **X → Y** | Company Money & Cylinders |
| **Paid company** | — | — | — | **X → Y** | Company Money |
| **company paid** | — | — | — | **X → Y** | Company Money |
| **Returned empties** (Comp) | — | — | — | — | Company Cylinders |
| **Bought full** (Comp) | — | — | — | **X → Y** | Company Money |
| **Balance adjustment** (Comp) | — | — | — | — | Company Money & Cylinders |
| **Inventory adjustment** | — | — | — | — | Inventory (Full/Empty) |
| **Wallet adjustment** | — | — | — | **X → Y** | Wallet Value |
| **Expense** | — | **Decrease** | — | **X → Y** | Wallet Value |
| **Bank to wallet** | — | — | — | **X → Y** | Wallet & Bank |
| **Wallet to bank** | — | — | — | **X → Y** | Wallet & Bank |

---

## 2. Feature-by-Feature Detailed Audit

### A. Expanded Activity Details
*   **Supposed to be:** When a user expands an activity card in the Daily Report, they **must** see transition pills (**Before → After**) for the **Wallet** and all affected **Ledger values** (Customer balances, Company balances, or Inventory).
*   **As Is:**
    *   Transition pills are currently only shown for the "primary" counterparty balance (e.g., Customer Money).
    *   Wallet and Inventory changes are shown in a separate, complex sub-panel that doesn't consistently use the "X → Y" pill format requested.
    *   **Wallet** is often labeled as "Cash".

### B. Daily Report Ledger Section
*   **Supposed to be:** Must explicitly show the status of:
    1.  **12kg:** Full and Empty counts.
    2.  **48kg:** Full and Empty counts.
    3.  **Wallet Value.**
*   **As Is:** The section currently focuses on "Sold" counts and "Cash end" value. Empty cylinder movements are secondary and not shown in the main summary boxes.

### C. Customer & Company Balances (Daily Report)
*   **Supposed to be:** Shows how these balances changed specifically for the day. All adjustments must be visible.
*   **As Is:** **Balance adjustment (Cust)** and **Balance adjustment (Comp)** events are manually filtered out of the events feed in `backend/app/routers/reports.py` (Line 467). They are invisible in the timeline.

### D. Activity Wording and Pills
*   **Supposed to be:**
    *   **Labels:** Use UI-standard terms: **Wallet**, **Replacement**, **Sold full**, **Bought empty**, **customer paid**, **company paid**, etc.
    *   **Pills:** Must reflect the **Ripple Effect**. If an activity at 10:00 AM is edited, the "Before" value for the 11:00 AM activity must automatically update to match the new 10:00 AM "After" value.
*   **As Is:**
    *   Wording is inconsistent between constants and logic (e.g., "Received payment" vs "customer paid").
    *   "Bought full" shows false cylinder debt pills (3 → 0) despite not affecting debt.
    *   "Paid company" is missing transition pills entirely on the Add screen.

### E. Customer Review Page
*   **Supposed to be:**
    *   **Number of orders:** Incremented ONLY by **Replacement** and **Sold full**.
    *   **Last order:** Date updated ONLY by **Replacement** and **Sold full**.
*   **As Is:** Correctly filters by mode, but "Bought empty" is technically an `Order` kind in the database, which might cause accidental inclusion if filters are removed.

### F. Date Picker Strip / Day Summary
*   **Supposed to be:**
    *   **12kg / 48kg:** Total delivered/sold for the day.
    *   **Net:** Total wallet movement from operational activities (Sales - Expenses - Payments).
*   **As Is:** Net calculation excludes "Bought empty" payments in some logic paths, and 12kg/48kg strictly counts "Sold" units.

---

## 3. Identified Bugs & Inconsistencies

1.  **Invisible Adjustments:** Adjustment activities are hidden from the Daily Report timeline.
2.  **Terminology Gap:** System-wide use of "Cash" instead of "**Wallet**".
3.  **Company "Bought full" Pill Error:** Displays false company cylinder debt transitions.
4.  **Company "Paid company" Pill Missing:** No balance transitions shown on the card.
5.  **Regex-based Logic:** Bank transfer direction determined by regex on labels (`/to wallet/i`) rather than structured data.
6.  **Dead Code:** `buildLegacyNoteText` in `SlimActivityRow.tsx` is an obsolete fallback that should be replaced by structured transition pills.

---

## 4. Missing Tests (Logic Focus)

1.  **Multi-Day Ripple Test:** Ensure editing Day 1 correctly updates the "Before" pills of Day 2 activities.
2.  **Comprehensive "Golden Path":** Sequence test of all 18 activity types to verify terminal Wallet/Inventory balance.
3.  **Stats Exclusion Test:** Verify "Bought empty" and "customer paid" do not affect Customer Review order counts.
4.  **Adjustment Feed Verification:** Test that Adjustments appear in the feed with correct X → Y pills.
5.  **Operational Net Test:** Verify "Bought empty" correctly reduces the day's Net.

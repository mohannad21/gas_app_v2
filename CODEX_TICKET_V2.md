# Codex Ticket — Fix T2/T5/T6 (Delete Blur, Pagination, Expense Edit)

**Branch:** `fix/delete-blur-v2` — create from current HEAD of `fix/delete-pagination-expense-edit`

**DO NOT IMPROVISE.** Follow this ticket exactly. Only modify the files and lines specified below. Do not refactor, do not add comments, do not touch files not listed here.

---

## Root Cause Analysis

### Why T2 (delete blur) is STILL broken

The previous fix removed explicit `refetch()` calls from delete handlers. **That was not enough.** The real problem is:

1. User deletes item → `markDeleting(id)` → card shows blur ✓
2. Mutation fires → backend reverses the item (sets `is_reversed = True`)
3. Mutation hook's `onSuccess` calls `queryClient.invalidateQueries(["orders"])` (hardcoded in the hook)
4. React Query marks query stale → triggers **automatic background refetch**
5. Backend list endpoint filters `WHERE is_reversed == False` → deleted item **not in response**
6. React Query updates cache → item gone from data array → item **disappears from UI**

**The fix:** The backend must return reversed items when asked (with `is_deleted: true`), and the frontend must request them and use the server-side `is_deleted` flag instead of relying on the `deletingIds` client-side state.

**This pattern already works for 3 entities** — refills, inventory adjustments, cash adjustments. We need to copy it to the remaining 5: orders, collections, expenses, bank deposits, company payments.

---

## PART A: Backend Changes (5 endpoints)

The pattern to follow is identical to what `list_cash_adjustments` in `backend/app/routers/cash.py` lines 20-55 already does:
- Add `include_deleted: bool = Query(default=False, alias="include_deleted")` param
- Change the hardcoded `.where(Model.is_reversed == False)` to be conditional: `if not include_deleted: stmt = stmt.where(Model.is_reversed == False)`
- Add `is_deleted: bool = False` to the response schema
- Set `is_deleted=row.is_reversed` when building the response object

---

### A1: Add `is_deleted` to `OrderOut` schema

**File:** `backend/app/schemas.py` — line 259

**Find:**
```python
  cyl_balance_after: Optional[dict[str, int]] = None
```

**Add after it:**
```python
  is_deleted: bool = False
```

---

### A2: Add `include_deleted` to `list_orders`

**File:** `backend/app/routers/orders.py` — lines 275-294

**Find:**
```python
@router.get("", response_model=list[OrderOut])
def list_orders(
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  session: Session = Depends(get_session),
) -> list[OrderOut]:
  stmt = (
    select(CustomerTransaction)
    .where(CustomerTransaction.kind == "order")
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  )
```

**Replace with:**
```python
@router.get("", response_model=list[OrderOut])
def list_orders(
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[OrderOut]:
  stmt = (
    select(CustomerTransaction)
    .where(CustomerTransaction.kind == "order")
  )
  if not include_deleted:
    stmt = stmt.where(CustomerTransaction.is_reversed == False)  # noqa: E712
```

Now find the return statement. Currently `_order_out(row)` does not pass `is_deleted`. Find the `_order_out` helper function in the same file and add `is_deleted` to it.

**Find the `_order_out` function** and add `is_deleted=row.is_reversed` to the returned `OrderOut(...)`. Search for `def _order_out` in the file. It should return `OrderOut(...)`. Add `is_deleted=row.is_reversed,` as the last field.

---

### A3: Add `is_deleted` to `CollectionEvent` schema

**File:** `backend/app/schemas.py` — line 327

**Find:**
```python
  note: Optional[str] = None
```
(the one inside `class CollectionEvent`, after `effective_at`)

**Add after it:**
```python
  is_deleted: bool = False
```

---

### A4: Add `include_deleted` to `list_collections`

**File:** `backend/app/routers/collections.py` — lines 188-214

**Find:**
```python
@router.get("", response_model=list[CollectionEvent])
def list_collections(
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  customer_id: Optional[str] = Query(default=None),
  session: Session = Depends(get_session),
) -> list[CollectionEvent]:
  stmt = (
    select(CustomerTransaction)
    .where(CustomerTransaction.kind.in_(["payment", "payout", "return"]))
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  )
```

**Replace with:**
```python
@router.get("", response_model=list[CollectionEvent])
def list_collections(
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  customer_id: Optional[str] = Query(default=None),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[CollectionEvent]:
  stmt = (
    select(CustomerTransaction)
    .where(CustomerTransaction.kind.in_(["payment", "payout", "return"]))
  )
  if not include_deleted:
    stmt = stmt.where(CustomerTransaction.is_reversed == False)  # noqa: E712
```

Now find the `_as_event` helper in the same file. It builds `CollectionEvent(...)`. Add `is_deleted=txns[0].is_reversed,` to the returned object (use the first transaction's `is_reversed` since all txns in a group share the same reversed state).

---

### A5: Add `is_deleted` to `ExpenseOutLegacy` schema

**File:** `backend/app/schemas.py` — line 409

**Find:**
```python
  created_by: Optional[str] = None
```
(inside `class ExpenseOutLegacy`)

**Add after it:**
```python
  is_deleted: bool = False
```

---

### A6: Add `include_deleted` to `list_expenses`

**File:** `backend/app/routers/expenses.py` — lines 34-55

**Find:**
```python
@router.get("", response_model=list[ExpenseOutLegacy])
def list_expenses(
  date: str | None = Query(default=None),
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  session: Session = Depends(get_session),
) -> list[ExpenseOutLegacy]:
  stmt = select(Expense).where(Expense.kind == "expense")
  if date:
    try:
      day = datetime.fromisoformat(date).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid date format") from exc
    stmt = stmt.where(Expense.day == day)
  stmt = stmt.where(Expense.is_reversed == False)  # noqa: E712
```

**Replace with:**
```python
@router.get("", response_model=list[ExpenseOutLegacy])
def list_expenses(
  date: str | None = Query(default=None),
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[ExpenseOutLegacy]:
  stmt = select(Expense).where(Expense.kind == "expense")
  if date:
    try:
      day = datetime.fromisoformat(date).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid date format") from exc
    stmt = stmt.where(Expense.day == day)
  if not include_deleted:
    stmt = stmt.where(Expense.is_reversed == False)  # noqa: E712
```

Now find where `ExpenseOutLegacy(...)` is constructed in the return statement of `list_expenses`. Add `is_deleted=row.is_reversed,` to it.

---

### A7: Add `is_deleted` to `BankDepositOut` schema

**File:** `backend/app/schemas.py` — line 532

**Find:**
```python
  note: Optional[str] = None
```
(inside `class BankDepositOut`)

**Add after it:**
```python
  is_deleted: bool = False
```

---

### A8: Add `include_deleted` to `list_bank_deposits`

**File:** `backend/app/routers/cash.py` — lines 189-214

**Find:**
```python
@router.get("/bank_deposits", response_model=list[BankDepositOut])
def list_bank_deposits(
  date: str | None = None,
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  session: Session = Depends(get_session),
) -> list[BankDepositOut]:
  stmt = (
    select(Expense)
    .where(Expense.kind == "deposit")
    .where(Expense.is_reversed == False)  # noqa: E712
  )
```

**Replace with:**
```python
@router.get("/bank_deposits", response_model=list[BankDepositOut])
def list_bank_deposits(
  date: str | None = None,
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[BankDepositOut]:
  stmt = (
    select(Expense)
    .where(Expense.kind == "deposit")
  )
  if not include_deleted:
    stmt = stmt.where(Expense.is_reversed == False)  # noqa: E712
```

Find where `BankDepositOut(...)` is constructed in the return. Add `is_deleted=row.is_reversed,` to it.

---

### A9: Add `is_deleted` to `CompanyPaymentOut` schema

**File:** `backend/app/schemas.py` — line 450

**Find:**
```python
  note: Optional[str] = None
```
(inside `class CompanyPaymentOut`)

**Add after it:**
```python
  is_deleted: bool = False
```

---

### A10: Add `include_deleted` to `list_company_payments`

**File:** `backend/app/routers/company.py` — lines 195-219

**Find:**
```python
@router.get("/payments", response_model=list[CompanyPaymentOut])
def list_company_payments(
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  session: Session = Depends(get_session),
) -> list[CompanyPaymentOut]:
  stmt = (
    select(CompanyTransaction)
    .where(CompanyTransaction.kind == "payment")
    .where(CompanyTransaction.is_reversed == False)  # noqa: E712
  )
```

**Replace with:**
```python
@router.get("/payments", response_model=list[CompanyPaymentOut])
def list_company_payments(
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[CompanyPaymentOut]:
  stmt = (
    select(CompanyTransaction)
    .where(CompanyTransaction.kind == "payment")
  )
  if not include_deleted:
    stmt = stmt.where(CompanyTransaction.is_reversed == False)  # noqa: E712
```

Find where `CompanyPaymentOut(...)` is constructed in the return. Add `is_deleted=row.is_reversed,` to it.

---

## PART B: Frontend Type Changes

### B1: Add `is_deleted` to Zod schemas

**File:** `frontend/types/domain.ts`

Add `is_deleted: z.boolean().optional(),` to each of these schemas. Add it as the LAST field before the closing `})`:

1. **OrderSchema** (line 357, before `note: z.string().nullish()`):
   Add `is_deleted: z.boolean().optional(),` after `note`.

2. **CollectionEventSchema** (line 416, before `note: z.string().nullish()`):
   Add `is_deleted: z.boolean().optional(),` after `note`.

3. **ExpenseSchema** (line 851, before `created_by: z.string().nullish()`):
   Add `is_deleted: z.boolean().optional(),` after `created_by`.

4. **BankDepositSchema** (line 871, before `note: z.string().nullish()`):
   Add `is_deleted: z.boolean().optional(),` after `note`.

5. **CompanyPaymentSchema** (line 137, before `note: z.string().nullish()`):
   Add `is_deleted: z.boolean().optional(),` after `note`.

---

## PART C: Frontend API Functions

### C1: Add `includeDeleted` param to API functions

**File:** `frontend/lib/api.ts`

#### C1a: `listOrders` (line ~457)

**Find:**
```typescript
export async function listOrders(): Promise<Order[]> {
  const { data } = await api.get("/orders", { params: { limit: 50 } });
```

**Replace with:**
```typescript
export async function listOrders(includeDeleted?: boolean): Promise<Order[]> {
  const { data } = await api.get("/orders", { params: { limit: 50, include_deleted: includeDeleted ?? false } });
```

#### C1b: `listCollections` (line ~547)

**Find:**
```typescript
export async function listCollections(): Promise<CollectionEvent[]> {
  const { data } = await api.get("/collections", { params: { limit: 50 } });
```

**Replace with:**
```typescript
export async function listCollections(includeDeleted?: boolean): Promise<CollectionEvent[]> {
  const { data } = await api.get("/collections", { params: { limit: 50, include_deleted: includeDeleted ?? false } });
```

#### C1c: `listExpenses` (line ~913)

**Find:**
```typescript
export async function listExpenses(date?: string): Promise<Expense[]> {
  const { data } = await api.get("/expenses", { params: { date, limit: 50 } });
```

**Replace with:**
```typescript
export async function listExpenses(date?: string, includeDeleted?: boolean): Promise<Expense[]> {
  const { data } = await api.get("/expenses", { params: { date, limit: 50, include_deleted: includeDeleted ?? false } });
```

#### C1d: `listBankDeposits` (line ~937)

**Find:**
```typescript
export async function listBankDeposits(date?: string): Promise<BankDeposit[]> {
  const { data } = await api.get("/cash/bank_deposits", { params: { date, limit: 50 } });
```

**Replace with:**
```typescript
export async function listBankDeposits(date?: string, includeDeleted?: boolean): Promise<BankDeposit[]> {
  const { data } = await api.get("/cash/bank_deposits", { params: { date, limit: 50, include_deleted: includeDeleted ?? false } });
```

#### C1e: `listCompanyPayments` (line ~292)

**Find:**
```typescript
export async function listCompanyPayments(): Promise<CompanyPayment[]> {
  const { data } = await api.get("/company/payments", { params: { limit: 50 } });
```

**Replace with:**
```typescript
export async function listCompanyPayments(includeDeleted?: boolean): Promise<CompanyPayment[]> {
  const { data } = await api.get("/company/payments", { params: { limit: 50, include_deleted: includeDeleted ?? false } });
```

---

## PART D: Frontend Query Hooks

Update each query hook to accept and pass `includeDeleted`. Follow the exact pattern used by `useInventoryRefills` in `frontend/hooks/useInventory.ts` lines 143-149:

```typescript
export function useInventoryRefills(includeDeleted?: boolean) {
  return useQuery({
    queryKey: ["inventory", "refills", includeDeleted ?? false],
    queryFn: () => listInventoryRefills(includeDeleted),
  });
}
```

### D1: `useOrders` hook

**File:** `frontend/hooks/useOrders.ts` — line ~19

**Find:**
```typescript
export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: listOrders,
```

**Replace with:**
```typescript
export function useOrders(includeDeleted?: boolean) {
  return useQuery({
    queryKey: ["orders", includeDeleted ?? false],
    queryFn: () => listOrders(includeDeleted),
```

### D2: `useCollections` hook

**File:** `frontend/hooks/useCollections.ts` — line ~40

**Find:**
```typescript
export function useCollections() {
  return useQuery({
    queryKey: ["collections"],
    queryFn: listCollections,
```

**Replace with:**
```typescript
export function useCollections(includeDeleted?: boolean) {
  return useQuery({
    queryKey: ["collections", includeDeleted ?? false],
    queryFn: () => listCollections(includeDeleted),
```

### D3: `useExpenses` hook

**File:** `frontend/hooks/useExpenses.ts` — line ~7

**Find:**
```typescript
export function useExpenses(date?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["expenses", date ?? "all"],
    queryFn: () => listExpenses(date),
```

**Replace with:**
```typescript
export function useExpenses(date?: string, options?: { enabled?: boolean; includeDeleted?: boolean }) {
  return useQuery({
    queryKey: ["expenses", date ?? "all", options?.includeDeleted ?? false],
    queryFn: () => listExpenses(date, options?.includeDeleted),
```

### D4: `useBankDeposits` hook

**File:** `frontend/hooks/useBankDeposits.ts` — line ~7

**Find:**
```typescript
export function useBankDeposits(date?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["bank_deposits", date ?? "all"],
    queryFn: () => listBankDeposits(date),
```

**Replace with:**
```typescript
export function useBankDeposits(date?: string, options?: { enabled?: boolean; includeDeleted?: boolean }) {
  return useQuery({
    queryKey: ["bank_deposits", date ?? "all", options?.includeDeleted ?? false],
    queryFn: () => listBankDeposits(date, options?.includeDeleted),
```

### D5: `useCompanyPayments` hook — NOT a query hook

Search for where `listCompanyPayments` is called from a `useQuery` hook. It may be in `frontend/hooks/useCompany.ts` or similar. Add `includeDeleted` param following the same pattern.

If there is no dedicated hook and it's called directly, update the call site.

---

## PART E: Frontend — Pass `includeDeleted: true` from screens

### E1: `frontend/app/(tabs)/add/index.tsx`

**Find** (line ~189):
```typescript
const ordersQuery = useOrders();
```
**Replace with:**
```typescript
const ordersQuery = useOrders(true);
```

**Find** (line ~190):
```typescript
const collectionsQuery = useCollections();
```
**Replace with:**
```typescript
const collectionsQuery = useCollections(true);
```

**Find** (line ~231):
```typescript
const expensesQuery = useExpenses(undefined, { enabled: isExpenses });
```
**Replace with:**
```typescript
const expensesQuery = useExpenses(undefined, { enabled: isExpenses, includeDeleted: true });
```

**Find** (line ~232):
```typescript
const bankDepositsQuery = useBankDeposits(undefined, { enabled: isExpenses });
```
**Replace with:**
```typescript
const bankDepositsQuery = useBankDeposits(undefined, { enabled: isExpenses, includeDeleted: true });
```

Note: Lines 227-229 already pass `true` for refills, inventory adjustments, and cash adjustments. Do NOT change those.

### E2: Company payments in add/index.tsx

Find where company payments are queried. If it uses a hook, pass `true` for `includeDeleted`. If the query call is inline, add the parameter.

---

## PART F: Frontend — Use server `is_deleted` in render

The key change: instead of ONLY using `deletingIds.has(id)`, also check `item.data.is_deleted`. Use `||` to combine both:
- `deletingIds.has(id)` → shows blur immediately on tap (optimistic)
- `item.data.is_deleted` → keeps blur after refetch (server-side truth)

### F1: Orders render in add/index.tsx

**Find** (line ~1104):
```typescript
isDeleted={deletingIds.has(order.id)}
```
**Replace with:**
```typescript
isDeleted={order.is_deleted || deletingIds.has(order.id)}
```

### F2: Collections render in add/index.tsx

**Find** (line ~1091):
```typescript
isDeleted={deletingIds.has(collection.id)}
```
**Replace with:**
```typescript
isDeleted={collection.is_deleted || deletingIds.has(collection.id)}
```

### F3: Expenses render in add/index.tsx

**Find** (line ~1148):
```typescript
isDeleted={deletingIds.has(item.data.id)}
```
(the one in the expense SlimActivityRow, NOT the bank_transfer one)

**Replace with:**
```typescript
isDeleted={item.data.is_deleted || deletingIds.has(item.data.id)}
```

### F4: Bank transfers render in add/index.tsx

**Find** (line ~1139):
```typescript
isDeleted={deletingIds.has(item.data.id)}
```
(the one in the bank_transfer SlimActivityRow)

**Replace with:**
```typescript
isDeleted={item.data.is_deleted || deletingIds.has(item.data.id)}
```

### F5: Customer view — orders and collections

**File:** `frontend/app/customers/[id].tsx`

Find where orders query is called and pass `includeDeleted: true` if possible. The customer view loads orders via a different mechanism (customer-specific query), so check how orders are fetched here.

**Find** (line ~806):
```typescript
isDeleted={rawCol ? deletingIds.has(rawCol.id) : false}
```
**Replace with:**
```typescript
isDeleted={rawCol ? (rawCol.is_deleted || deletingIds.has(rawCol.id)) : false}
```

**Find** (line ~816):
```typescript
isDeleted={activity.orderId ? deletingIds.has(activity.orderId) : false}
```

For orders in customer view, check if `rawOrder` is available in scope. If yes:
**Replace with:**
```typescript
isDeleted={rawOrder ? (rawOrder.is_deleted || deletingIds.has(rawOrder.id)) : (activity.orderId ? deletingIds.has(activity.orderId) : false)}
```

---

## PART G: T5 — Expense Edit (already partially done)

The `onEdit` handler was already added in the previous fix. Verify it exists:

**File:** `frontend/app/(tabs)/add/index.tsx` — line ~1149

Should have:
```typescript
onEdit={() =>
  router.push({
    pathname: "/expenses/new",
    params: { expenseId: item.data.id },
  })
}
```

If this is already present, **do nothing**. If not, add it.

---

## Verification Checklist

After all changes:

1. ✓ 5 backend schemas have `is_deleted: bool = False` added (OrderOut, CollectionEvent, ExpenseOutLegacy, BankDepositOut, CompanyPaymentOut)
2. ✓ 5 backend endpoints have `include_deleted` param with conditional `is_reversed` filter (list_orders, list_collections, list_expenses, list_bank_deposits, list_company_payments)
3. ✓ 5 backend endpoints set `is_deleted=row.is_reversed` in response construction
4. ✓ 5 frontend Zod schemas have `is_deleted: z.boolean().optional()` (OrderSchema, CollectionEventSchema, ExpenseSchema, BankDepositSchema, CompanyPaymentSchema)
5. ✓ 5 frontend API functions accept `includeDeleted` param and pass `include_deleted` to backend
6. ✓ 5 frontend query hooks accept and pass `includeDeleted`, include it in query key
7. ✓ All query calls in add/index.tsx pass `includeDeleted: true`
8. ✓ All render code uses `item.is_deleted || deletingIds.has(item.id)` pattern
9. ✓ Expense onEdit handler exists

## Testing

**Test T2 (delete blur):**
1. Open Add Entry → any section → delete any item → confirm
2. Card should blur immediately (opacity 0.55) with "Deleted" label in red
3. Card should STAY blurred even after 5+ seconds (the refetch will bring it back with `is_deleted: true`)
4. Edit/Delete buttons should be greyed out on deleted cards

**Test T5 (expense edit):**
1. Open Add Entry → Expenses section
2. Each expense card should have both Edit and Delete buttons
3. Tap Edit → should navigate to expense form with pre-filled data

**Test T6 (pagination):**
1. Pagination should be working via `limit: 50` already in API calls
2. Create >50 refills, open Company Activities, should show max ~50

---

## Files Modified

### Backend:
- `backend/app/schemas.py` — add `is_deleted` to 5 schemas
- `backend/app/routers/orders.py` — add `include_deleted` param + set `is_deleted`
- `backend/app/routers/collections.py` — add `include_deleted` param + set `is_deleted`
- `backend/app/routers/expenses.py` — add `include_deleted` param + set `is_deleted`
- `backend/app/routers/cash.py` — add `include_deleted` to `list_bank_deposits` + set `is_deleted`
- `backend/app/routers/company.py` — add `include_deleted` to `list_company_payments` + set `is_deleted`

### Frontend:
- `frontend/types/domain.ts` — add `is_deleted` to 5 Zod schemas
- `frontend/lib/api.ts` — add `includeDeleted` param to 5 API functions
- `frontend/hooks/useOrders.ts` — add `includeDeleted` to hook
- `frontend/hooks/useCollections.ts` — add `includeDeleted` to hook
- `frontend/hooks/useExpenses.ts` — add `includeDeleted` to hook options
- `frontend/hooks/useBankDeposits.ts` — add `includeDeleted` to hook options
- `frontend/app/(tabs)/add/index.tsx` — pass `true` to all queries + use `is_deleted` in render
- `frontend/app/customers/[id].tsx` — use `is_deleted` in render

### DO NOT touch:
- `frontend/components/` — nothing to change
- `frontend/hooks/useInventory.ts` — already correct
- `frontend/hooks/useCash.ts` — already correct
- Any test files
- Any other files not listed above

---

## Questions?

- Stop and ask
- Do NOT improvise
- Do NOT change other files
- Do NOT refactor existing code
- Follow the EXACT same pattern as cash adjustments / inventory adjustments / refills

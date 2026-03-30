# AI Implementation Guidelines for gas_app_v2

This file documents rules for Claude/Codex implementation work in this repository. Follow these rules to avoid wasted effort and scope creep.

## Core Principles

1. **No improvisation.** Implement only what is specified in the ticket. Do not add features, refactor code outside the ticket scope, or "improve" working code.
2. **No breaking changes to working features.** If a feature is in use, do not change its signature or behavior without explicit permission.
3. **Preserve existing patterns.** If a pattern exists elsewhere in the code, use it instead of introducing new patterns.
4. **Read before changing.** Always read the current file before proposing modifications. Understand existing code first.
5. **Test after changes.** Run tests and build commands to verify no regressions.

## Files to IGNORE During Scans

Do NOT scan, read, or reference these files in reasoning or implementation:

**Noise / Archived files (safe to ignore completely):**
- `scripts/codex.txt` — orphaned conversation dump
- `scripts/chatgbt.txt` — orphaned conversation dump (typo in name)
- `chatgbt_chat.txt` — orphaned conversation dump (typo in name)
- `scripts/cloudflared.log` — deployment artifact
- `scripts/cloudflared.err.log` — deployment artifact
- `qc` — unknown purpose, opaque name

**Local development / untracked (ignore unless explicitly referenced):**
- `scripts/frontend.txt` — untracked, local reference only
- `scripts/backend.txt` — untracked, local reference only
- `AUDIT_TODO.md` — untracked, master audit list (use only for planning)
- `proposal.txt` — untracked, archived proposals
- `proposal_todos.txt` — untracked, archived todos

**Workspace files (ignore completely):**
- `.expo/` — Expo build artifacts
- `.venv/` — Python virtual environment
- `.pytest_cache/` — pytest cache
- `node_modules/` — npm dependencies
- `.git/` — git metadata
- `__pycache__/` — Python cache
- `.claude/` — local Claude session data

## Files with Known Naming Issues

These files have naming inconsistencies but should NOT be renamed without explicit ticket:

- `backend/app/routers/system.py` (214 lines) — unclear intent vs `systems.py` (156 lines)
- `backend/app/routers/system_types.py` (68 lines) — part of system confusion
- `frontend/hooks/useThemeColor.ts` — camelCase (fixed in Phase 1 cleanup)
- `frontend/hooks/useColorScheme.ts` — camelCase (fixed in Phase 1 cleanup)

When implementing, refer to these by exact name; only rename if the ticket explicitly requires it.

## Code Size Hotspots (Prioritize for Breaking Up)

These files are largest and benefit most from extraction. When working in these areas, prefer breaking them into smaller files:

**Critical (>2,500 lines):**
- `frontend/app/orders/new.tsx` (3,386 lines)
- `backend/app/routers/reports.py` (3,265 lines)
- `frontend/app/(tabs)/add/index.tsx` (2,764 lines)
- `frontend/components/AddRefillModal.tsx` (2,252 lines)

**High priority (1,600–2,000 lines):**
- `frontend/app/(tabs)/reports/index.tsx` (1,806 lines)
- `frontend/app/inventory/new.tsx` (1,664 lines)

**Medium priority (900–1,200 lines):**
- `backend/app/schemas.py` (997 lines)
- `frontend/lib/api.ts` (968 lines)
- `frontend/types/domain.ts` (879 lines)
- `frontend/app/customers/[id].tsx` (1,246 lines)

When extracting, follow these rules:
- Extract to new files (do NOT inline code into many small files as a workaround).
- Each extracted file should have a single responsibility.
- Re-export from the original file for backward compatibility if needed.
- Test imports and functionality after extraction.

## Query Invalidation Rules

When implementing cache invalidation or query refreshes:

1. **Customer balance changes:** Invalidate `["customers", "balance", customerId]` after:
   - Order create/update/delete
   - Collection create/update/delete
   - Customer adjustment create/update/delete

2. **Company balance changes:** Invalidate `["company", "balances"]` after:
   - Refill create/update/delete
   - Inventory adjustment create/update/delete
   - Company payment create/update/delete

3. **Report cache:** Invalidate report queries after any create/update/delete that affects:
   - Orders
   - Collections
   - Expenses
   - Bank deposits
   - Cash adjustments
   - Refills
   - Inventory

See `AUDIT_TODO.md` section "State synchronization / cache consistency" for full details.

## Naming Conventions

**Frontend:**
- React hooks: `useX` (camelCase), e.g., `useOrders`, `useCollections`
- Components: `PascalCase`, e.g., `AddRefillModal`, `ActivityListSection`
- Utilities: `camelCase`, e.g., `activityAdapter`, `formatMoney`

**Backend:**
- Router modules: `snake_case`, e.g., `orders.py`, `customer_adjustments.py`
- Router function names: `snake_case`, e.g., `list_orders`, `create_order`
- Schema classes: `PascalCase`, e.g., `OrderOut`, `CustomerIn`
- Service functions: `snake_case`, e.g., `post_refill`, `reverse_order`

**Routes / URLs:**
- Frontend routes: kebab-case, e.g., `/company-balance-adjust`
- Backend endpoints: `/snake_case/path`, e.g., `/api/orders`, `/api/company/payments`

## Import Organization

When adding imports, follow this order:
1. Standard library / framework (React, React Native, FastAPI)
2. Third-party packages (Axios, Lodash, date-fns)
3. Local imports from `@/` (relative or absolute)
4. Local utilities and types

Example (frontend):
```typescript
import { View, Text, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { listOrders } from "@/lib/api";
import { Order } from "@/types/domain";
import { formatMoney } from "@/lib/formatters";
```

Example (backend):
```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, or_

from app.db import get_db
from app.schemas import OrderOut
from app.models import CustomerTransaction
```

## Error Handling & Logging

**Frontend:**
- Log errors at the hook/service layer, not in components
- Use `console.error("[feature]", error)` format for context
- Surface errors to users via Toast/Alert, not logs
- Never log PII (customer names, phone numbers, financial data)

**Backend:**
- Log errors at the router handler level with context
- Use `logger.error("context", exc_info=True)` for stack traces
- Never expose raw error details to clients; return safe `{"detail": "message"}`
- Never log PII, passwords, or sensitive request bodies

## Testing Requirements

Before committing:
- **Frontend:** Run `npm run build` to verify no TypeScript errors
- **Backend:** Run `pytest tests/` to verify no regressions
- **Both:** Verify the specific feature works as described in the ticket

Do NOT:
- Commit code that fails build or tests
- Skip tests to "save time"
- Commit console.errors or debug logs in production code paths

## Branch & Commit Strategy

1. **Branch naming:** `fix/issue-name` or `feat/feature-name`
2. **Commit message format:**
   ```
   type(area): short description

   Detailed explanation if needed (2-3 sentences).
   Fixes #123 if applicable.
   ```
   Examples:
   - `fix(orders): prevent double-submit on slow network`
   - `refactor(add-screen): extract refill form to component`
   - `feat(backend): add include_deleted param to list endpoints`

3. **One logical change per commit.** Do not mix refactoring with bug fixes.

## Code Review Checklist

When asked to review code before shipping:
- [ ] Does it match the ticket scope (no improvisation)?
- [ ] Are there any console.error/debug logs left in?
- [ ] Are imports organized correctly?
- [ ] Do function/variable names match conventions?
- [ ] Is error handling in place (try/catch for async)?
- [ ] Are tests passing?
- [ ] Is the feature tested on the UI (not just unit tests)?

## Workflow: Ticket Approval

Before implementing a ticket from `AUDIT_TODO.md`:

1. Read the ticket section carefully
2. Identify which files will change
3. Ask: "Do I need permission to change X?" (if X is not in the ticket, ask the user)
4. Propose the implementation plan (what files, what changes)
5. Wait for user approval before coding

Do NOT assume you can refactor neighboring code or "improve" things outside the ticket.

---

Last updated: 2026-03-30
Maintained by: User (Mohannad)

# Implementation Strategy: AI-Optimized Codebase Restructuring

**Created:** 2026-03-30
**Status:** Ready for implementation
**Scope:** 3-4 focused sessions to reduce code complexity and AI resource usage

---

## What We've Created

Three comprehensive documents to guide the refactoring work:

### 1. CLAUDE.md (AI Guidelines)
**Purpose:** Rules and constraints for AI-assisted implementation work
**Contents:**
- Core principles (no improvisation, preserve patterns, read before changing)
- Files to IGNORE during scans (noise files, .expo/, .venv/, etc.)
- Files with known naming issues (system.py, system_types.py, etc.)
- Code size hotspots (which files need breaking up)
- Query invalidation rules (cache patterns to follow)
- Naming conventions (frontend hooks, backend routers, routes)
- Import organization
- Error handling & logging standards
- Testing requirements
- Branch & commit strategy

**Key benefit:** Any future AI work (Codex, Claude, etc.) reads CLAUDE.md first and understands what to ignore and what conventions to follow.

---

### 2. REFACTORING_TICKET.md (Complete Implementation Plan)
**Purpose:** Step-by-step refactoring work organized into 3 phases
**Contents:**

**Phase 1: Cleanup & Naming Fixes** (Session 1)
- Delete 6 tracked noise files (27.9K lines)
- Rename hook files (useThemeColor, useColorScheme) for consistency
- Clarify backend router naming (system.py vs systems.py decision)
- Remove unused report UI components
- **Outcome:** 70K fewer lines to scan, 10 fewer confusing file names

**Phase 2: Schema & Type Extraction** (Session 2)
- Split backend/app/schemas.py (997 → 5 files × ~200 lines)
- Split frontend/types/domain.ts (879 → 5 files × ~175 lines)
- Maintain backward compatibility via re-exports
- **Outcome:** Largest schemas reduced by 80%, AI scanning time cut in half

**Phase 3: Component & Screen Extraction** (Sessions 3-4)
- Extract AddRefillModal (2,252 → 400 + 6 components)
- Extract orders/new.tsx (3,386 → 400 + 6 components)
- Complete add/index.tsx extraction (2,764 → 600 + 5 sections)
- Extract reports/index.tsx (1,806 → 350 + 4 components)
- Extract backend reports.py (3,265 → 3 focused modules)
- **Outcome:** Largest files <600 lines, each with single responsibility

**Success criteria:** All tests pass, npm build succeeds, largest file <600 lines

---

### 3. CLEANUP_SUMMARY.md (Decision Reference)
**Purpose:** Clear decision matrix for which files to delete, untrack, or keep
**Contents:**

**Delete (via `git rm`):**
- scripts/codex.txt (14.5K lines)
- scripts/chatgbt.txt (12.7K lines)
- chatgbt_chat.txt (597 lines)
- scripts/cloudflared.log/.err.log
- qc

**Untrack (via `.gitignore`):**
- scripts/frontend.txt (27.7K lines — local reference only)
- scripts/backend.txt (11.2K lines — local reference only)
- proposal.txt
- proposal_todos.txt
- scripts/distributor_app_product_summary.txt

**Keep (don't delete):**
- AUDIT_TODO.md — master audit list
- CODEX_TICKET_V2.md — current working ticket
- CLAUDE.md — NEW AI guidelines
- REFACTORING_TICKET.md — NEW implementation plan
- CLEANUP_SUMMARY.md — NEW reference

---

## Current State vs Target State

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Tracked noise files | 9 | 0 | -100% |
| Largest source file | 3,386 lines | ~600 lines | -82% |
| Files >2,000 lines | 4 | 0 | -100% |
| Largest schema file | 997 lines | ~200 lines | -80% |
| Total lines to scan for one change | ~6,000 | ~800 | -87% |
| AI token usage per scan | baseline | -40 to -60% | faster comprehension |
| Search noise (false positives in grep) | 76K extra lines | baseline | -10% search time |
| Files with naming inconsistencies | 6 | 0 | -100% |

---

## How This Addresses Master Audit TODO

Your comprehensive AUDIT_TODO.md has 8 major sections. This refactoring ticket directly addresses:

### Section 2: Source of Truth & Architecture
- ✓ Break down oversized route files by responsibility
- ✓ Split frontend/lib/api.ts by domain (Phase 2 prep)
- ✓ Clarify API/module naming boundaries (system.py, systems.py)

### Section 3: Standardize & Centralize Patterns
- ✓ Extract shared hook implementations
- ✓ Centralize UI patterns and components
- ✓ Standardize query invalidation helpers

### Section 5: Cleanup / Dead Code
- ✓ Remove unused report-layer files
- ✓ Remove leaked AI repair comments
- ✓ Remove ASCII-art comment blocks
- ✓ Delete orphaned noise files

**Remaining AUDIT_TODO items** (Sections 1, 4, 6, 7) are **not** affected by this refactoring and should be tackled in **separate tickets** after this refactoring is complete. Examples:
- Section 1: Security & auth hardening
- Section 1: State synchronization & cache invalidation
- Section 4: Accessibility improvements
- Section 6: Verify-first scenarios (testing)

---

## Execution Roadmap

### Session 1: Phase 1 Cleanup (Est. 2-3 hours)

```bash
# 1. Delete tracked noise (6 files)
git rm scripts/codex.txt scripts/chatgbt.txt chatgbt_chat.txt \
        scripts/cloudflared.log scripts/cloudflared.err.log qc

# 2. Rename hook files
git mv frontend/hooks/use-theme-color.ts frontend/hooks/useThemeColor.ts
git mv frontend/hooks/use-color-scheme.ts frontend/hooks/useColorScheme.ts
git mv frontend/hooks/use-color-scheme.web.ts frontend/hooks/useColorScheme.web.ts

# 3. Update imports
rg "use-theme-color|use-color-scheme" frontend --type ts --type tsx -l | \
  xargs sed -i 's/use-theme-color/useThemeColor/g; s/use-color-scheme/useColorScheme/g'

# 4. Update .gitignore
cat >> .gitignore << 'EOF'
scripts/frontend.txt
scripts/backend.txt
scripts/distributor_app_product_summary.txt
proposal.txt
proposal_todos.txt
EOF

# 5. Verify
npm run build
git status
```

**Commits:**
- "chore: remove tracked noise files (28K lines)"
- "refactor(hooks): rename to camelCase for consistency"
- "chore: update .gitignore to prevent noise re-entry"

---

### Session 2: Phase 2 Schema & Type Extraction (Est. 3-4 hours)

1. Create `backend/app/schemas/` directory structure
2. Move schema classes to domain-focused files
3. Create `backend/app/schemas/__init__.py` with re-exports
4. Repeat for `frontend/types/domain*.ts` files
5. Run tests to verify imports work

**Commit:**
- "refactor: extract schemas and types into focused modules"

---

### Sessions 3-4: Phase 3 Component Extraction (Est. 4-6 hours)

**Recommended order:**

1. **AddRefillModal** (2,252 → 400 + 6 files) — self-contained, lowest risk
2. **orders/new.tsx** (3,386 → 400 + 6 files) — largest, benefits from success above
3. **add/index.tsx** (2,764 → 600 + 5 files) — mostly done, finish extraction
4. **reports/index.tsx** (1,806 → 350 + 4 files) — lower risk, lowest priority

**For each:**
1. Create component directory
2. Extract state to hooks
3. Extract UI sections to components
4. Update imports in parent screens
5. Test (`npm run build`, verify functionality)
6. Commit

---

## Files Created Today

All three files are ready to commit:

```bash
git add CLAUDE.md REFACTORING_TICKET.md CLEANUP_SUMMARY.md
git commit -m "docs: add AI guidelines and refactoring plan

- CLAUDE.md: rules and constraints for AI-assisted work
- REFACTORING_TICKET.md: 3-phase refactoring plan
- CLEANUP_SUMMARY.md: cleanup decision matrix

These documents guide future refactoring and AI work to reduce
complexity and token usage."
```

---

## Risk Assessment

### Phase 1 Cleanup (LOW RISK)
- Deleting noise files: Zero risk to functionality
- Renaming hooks: Mechanical change, easy to verify with grep
- Updating .gitignore: Zero risk
- **Mitigation:** Run `npm run build` and verify tests before committing

### Phase 2 Schema/Type Extraction (MEDIUM RISK)
- Moving files in Python/TypeScript is straightforward
- Re-exports maintain backward compatibility
- Import changes are mechanical (same paths via __init__.py)
- **Mitigation:** Run full test suite, verify no type errors

### Phase 3 Component Extraction (MEDIUM-HIGH RISK)
- Breaking up large components requires careful extraction
- Risk of missing a state dependency or import
- Risk of functional regression if extraction is incomplete
- **Mitigation:**
  - Extract one component at a time
  - Test each extraction before moving to next
  - Keep main file functional during extraction (don't delete old code until new works)
  - Run full UI test (not just npm build) — verify screens render and buttons work

---

## Success Criteria

After all 3 phases:

✓ Largest source file <600 lines
✓ All tracked noise deleted (codex.txt, chatgbt.txt, etc.)
✓ Hook naming consistent (useX pattern)
✓ Schemas split into 5 modules
✓ Types split into 5 modules
✓ Top 4 screens <600 lines each
✓ `npm run build` — no TypeScript errors
✓ `pytest tests/backend/` — all green
✓ All imports work after refactoring
✓ Codebase scans 40-60% faster for AI

---

## What Happens Next?

### Immediately After Refactoring Completes:
1. All tests pass ✓
2. Code review & merge to main ✓
3. Push to repository

### Next Ticket to Tackle:
Once refactoring is complete, use the freed-up complexity budget to work on **Section 1 of AUDIT_TODO**:
- **Security & auth hardening** (add auth to protected routes)
- **Cache invalidation standardization** (customer balance, company balance, reports)
- **State synchronization fixes** (prevent stale data after mutations)

These are the highest-impact issues that current code structure makes hard to implement. After refactoring, they'll be easier.

---

## Questions to Clarify Before Starting

1. **system.py vs systems.py naming:**
   - Read both files and decide: should they be renamed for clarity?
   - Or should they be consolidated into one?
   - Proposed: `system_detail.py` and `system_list.py` if they serve different purposes

2. **Commit strategy:**
   - Should each component extraction be its own commit?
   - Or one commit per screen?
   - (Recommended: one per component for easier review)

3. **Timeline:**
   - Can you dedicate 3-4 focused sessions (no interruptions)?
   - Or should this be split over a longer timeframe?

---

## Resources

- **CLAUDE.md** — Reference during any AI-assisted work
- **REFACTORING_TICKET.md** — Copy code snippets and steps as you work
- **CLEANUP_SUMMARY.md** — Reference for which files to delete/untrack
- **This file (IMPLEMENTATION_STRATEGY.md)** — High-level overview and roadmap

---

**Ready to start Phase 1?**

Once approved, the execution plan is straightforward:
1. Delete 6 noise files
2. Rename 2 hook files
3. Update imports
4. Update .gitignore
5. Test and commit

Estimated time: 2-3 hours for Phase 1.

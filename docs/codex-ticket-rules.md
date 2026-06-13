# Codex Ticket Rules

Use this file when writing implementation tickets for Codex. Tickets must be precise enough that Codex can implement without guessing.

## Read First

Before writing a ticket, read the relevant repo files. Do not write tickets from memory or from an old conversation summary.

For frontend work, also check the centralization map:

- `docs/frontend-centralization-map.md`

## Centralization Rule

Before proposing implementation, check whether the needed value, label, route, metadata, preset, or behavior already exists in a central file.

Codex tickets must not introduce new local hardcoded:

- colors
- display labels
- routes
- stepper arrays
- activity kind names
- price category names
- repeated UI behavior
- duplicated business rules

If the shared value already exists, the ticket must require reusing it.

If the shared value does not exist, the ticket must say exactly where to add it centrally.

If a ticket adds a new central concept, it must also update:

- `docs/frontend-centralization-map.md`

This map update is part of the ticket scope, not optional cleanup.

## Errors And Logs

Tickets must require explicit error handling. Do not silently ignore failures unless the ticket explains why that is acceptable.

When adding or changing error paths, Codex must:

- raise, return, or surface meaningful errors instead of swallowing them
- preserve useful original error context where practical
- show user-facing errors through the app's existing error/toast/alert patterns
- avoid vague messages such as `Something went wrong` when a more specific message is available
- avoid noisy duplicate logs
- remove temporary debug logs before finishing
- keep production logs concise and actionable
- use existing helpers such as `frontend/lib/apiErrors.ts` and `frontend/lib/toast.ts` when they fit

If a ticket touches API calls, save flows, background operations, or async actions, it must include acceptance criteria for the expected error behavior.

## Branch

Every ticket must specify:

- exact branch name
- whether to stay on the current branch or create a new branch
- if creating a new branch, the base branch

## Scope

Every ticket must state:

- files to change
- files to delete, if any
- files not to change

No neighboring refactors. No opportunistic improvements. No cleanup outside the ticket unless explicitly listed.

## Implementation

Every ticket must include:

- exact current code and exact replacement code where practical
- line numbers where possible
- complete file content for any new file
- exact imports to add or remove
- exact old references to remove

If line numbers may drift, include a search string that uniquely locates the code.

## Tests

Never tell Codex to run tests unless the user explicitly asks Codex to implement and verify.

Tickets should give the developer exact commands to run:

- only affected test files
- no full suite unless the ticket truly requires it
- `npx tsc --noEmit` when imports, types, deleted files, or route types are affected

Each test section must state passing criteria.

## Return Requirements

The ticket must require Codex to return:

- exact test commands for the developer
- changed files summary
- central files checked
- existing centralized values reused
- new centralized values added, if any
- confirmation that no duplicate local config was introduced

## Acceptance Criteria

Each ticket must include a checklist that is verifiable without running the app.

Include centralization checks:

- no new hardcoded colors unless explicitly approved
- no duplicated labels outside `frontend/lib/wording.ts`
- no duplicated steppers outside `frontend/constants/steppers.ts`
- no duplicated routes if a shared route/helper exists
- no duplicate activity metadata
- centralization map updated when new shared concepts are added

## Current Frontend Decisions

- Shared activity toggle model is 2-state only: `target` and `zero`.
- 3-state toggle work is canceled.
- Toggle labels come from `frontend/lib/wording.ts`.
- Toggle logic comes from `frontend/lib/activityToggle.ts`.
- Canonical price configuration route is `/(tabs)/account/configuration/prices`.
- Do not use `/add?prices=1`.
- Do not wrap full hub screens or `FooterActions` in `KeyboardAwareForm`.
- Keep `adjust_inventory` behavior unchanged unless explicitly required.

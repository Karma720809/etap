# Stage 1 Cursor / Codex Implementation Start Guide

**Baseline:** Stage 1 One-Line Diagram MVP Spec Rev D  
**Use with:** Stage 1 Rev D spec, Zod schema Rev D, JSON Schema Rev C/Rev D, demo fixture, and first PR checklist.

## Opening Prompt

```text
Implement Stage 1 One-Line Diagram MVP for the Power System Study App.

Use the Stage 1 Rev D implementation spec as the source of truth.
Do not implement Load Flow, Voltage Drop, Short Circuit, Cable Sizing, Equipment Duty Check, or report generation.
Do not create fake calculation results or placeholder numerical results.

Focus on:
- React + TypeScript web app foundation
- Core model package
- Runtime schema validation using the Rev D Zod schema
- Project JSON save/load with deterministic serialization
- Equipment palette
- React Flow canvas as renderer only
- Property panel editing canonical equipment collections
- internalId/tag separation
- Transformer rendered as a diagram node
- connection edges for bus-attached equipment and transformer terminals
- branch_chain edges for ordered Breaker/Cable/Switch sequences
- Draft validation vs calculation-ready validation distinction
- Validation result bottom panel

Use stage_1_demo_fixture.json as the first import/render/save/load round-trip fixture.
Use stage_1_first_pr_review_checklist_rev_b.md as the first PR review gate.
```

## First PR Must Prove

1. `internalId` references are canonical; tags are display/edit fields only.
2. Transformer is a node, never a branch-chain edge.
3. `connection` edges reject `branchEquipmentInternalIds` at schema level.
4. `branch_chain` edges require ordered `branchEquipmentInternalIds`.
5. `stage_1_demo_fixture.json` imports, renders, and round-trips.
6. Save/load/save is deterministic.
7. No calculation results are generated or stored.
8. Acceptance criteria #1–#23 have mapped verification IDs.

## Recommended First PR Scope

- Monorepo/app initialization
- `packages/core-model`
- `packages/project-io` with serializer/loader
- `packages/validation` skeleton with draft validation codes
- Demo fixture import test
- Deterministic serialization test
- Minimal React shell with palette/canvas/property-panel placeholders

Avoid implementing detailed forms for every equipment in the first PR if that delays model and save/load validation. The first PR should lock the canonical model and diagram representation.

## Suggested PR Boundary Split

- **PR #1 — Model / I/O foundation:** monorepo initialization, `core-model`, `project-io`, Rev D loader/serializer, validation skeleton, demo fixture import, deterministic serialization, and minimal React shell. Include only enough forms to import and inspect the demo fixture.
- **PR #2 — Equipment forms:** complete Cable, Breaker, Switch, Load, Generator, MCC, and Switchgear placeholder forms; keep all edits routed to canonical equipment collections.
- **PR #3 — UI polish and validation UX:** property-panel polish, validation bottom panel refinement, calculation-status placeholder behavior, and acceptance smoke checks.

This split prevents detailed form work from delaying the canonical model, save/load, transformer-as-node, and branch-chain decisions.

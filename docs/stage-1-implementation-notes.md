# Stage 1 Implementation Notes (PR #1)

This document accompanies the PR #1 foundation. It is non-normative; the canonical specifications live under `docs/stage-1-baseline/`.

## Stage 1 is editor-first; calculations are deliberately absent

PR #1 implements the canonical model, schema, save/load, and the validation skeleton. It does **not** implement Load Flow, Voltage Drop, Short Circuit, Cable Sizing, Equipment Duty Check, report generation, or any pandapower / solver wiring. Calculation buttons are not present in this PR — there is no UI surface that could even appear to run a calculation.

`packages/project-io` does not produce calculation results, and `calculationSnapshots` in the project file is reserved as an empty array per Rev D §6 / §50.

## The Stage 1 Rev D schema is canonical

`packages/schemas/src/stage_1_project_schema.rev_d.zod.ts` is copied **byte-identical** from `docs/stage-1-baseline/stage_1_project_schema.rev_d.zod.ts`. Likewise `packages/schemas/stage_1_project_file.rev_d.schema.json`. A canonical-drift test (`packages/schemas/tests/canonical-drift.test.ts`) SHA256-compares the copies against the baseline so accidental edits surface in CI.

PRD v1.0 §8 examples are illustrative only. PR #1 uses the canonical names from the Rev D schema:

| Use this (canonical) | Not this (PRD §8 example) |
| --- | --- |
| `connectedBus` | `bus` |
| `status: "in_service"` | `inService: true` |
| `ProjectMetadata` (the Zod-inferred type) | `ProjectInfo` |
| `CalculationSnapshotPlaceholder` (file-level reserved) | "CalculationStatusPlaceholder" (a UI status, deferred to PR #3) |

`packages/core-model` re-exports `z.infer` types from `@power-system-study/schemas` rather than hand-typing parallel interfaces.

### Canonical schema deviations

The canonical drift test allows a single, documented substitution:

- `z.ZodIssueCode.custom` → `"custom"` — Some Zod v4 minor versions removed the `ZodIssueCode` enum in favor of the literal `"custom"`. If `pnpm typecheck` ever fails on this, swap the two occurrences in `packages/schemas/src/stage_1_project_schema.rev_d.zod.ts` and the drift test will accept it. No other deviations are allowed without raising the canonical decision again.

## Transformer-as-node policy

Transformers are diagram nodes, never edges. PR #1 enforces this with two Stage-1 internal codes (the Rev D code table does not assign a unique code to transformer-as-node; these codes are this implementation's contribution and are documented here):

- `E-DIA-001` — every transformer in `equipment.transformers` must have at least one matching diagram node with `kind: "transformer"` and `equipmentInternalId === transformer.internalId`.
- `E-DIA-002` — no diagram edge may carry a transformer via its optional `equipmentInternalId` field.

Transformer-to-bus links are represented by `connection` edges per Rev D §10.

## Branch-chain edge policy

- `branch_chain` edges represent ordered serial branch equipment between two bus-side nodes (e.g., `BUS-LV → BRK-001 → CBL-001 → BUS-MTR`).
- `branchEquipmentInternalIds` is **upstream-to-downstream** ordered. The serializer never reorders this array.
- `branch_chain` entries must be `breaker`, `cable`, or `switch` equipment. PR #1 codes:
  - `E-DIA-004` — branch_chain references missing equipment internalId.
  - `E-DIA-005` — branch_chain references equipment whose kind is not breaker/cable/switch.
- The canonical Zod schema's `superRefine` on `DiagramEdgeSchema` already rejects:
  - `branch_chain` edges with no/empty `branchEquipmentInternalIds`.
  - `connection` edges that include `branchEquipmentInternalIds`.
- Branch-chain endpoint vs. equipment from/to bus mismatch (`W-NET-001`) is **deferred to PR #2**.

## Validation storage vs. runtime validation

The `validation` field stored in a project file is **audit reference only**. `loadProjectFile` returns it as `savedValidation` but does **not** treat it as authoritative. After a successful schema parse, `loadProjectFile` runs `validateProject` and returns the result as `runtimeValidation`. UIs and downstream callers must use `runtimeValidation`.

`packages/project-io/tests/saved-validation-not-authoritative.test.ts` exercises a pathological case: a saved validation block claiming `status: "valid"` while the equipment graph is corrupted. Runtime validation correctly surfaces the corruption.

## Deterministic serialization

The canonical `serializeProjectFile` recursively sorts object keys (`sortJsonKeys`) and applies the top-level key order. Per Rev D §12.3, equipment arrays must additionally be sorted by `internalId`. `packages/project-io/src/normalize.ts` performs this pre-sort:

1. Sort each equipment array by `internalId`.
2. Sort `diagram.nodes` by `id`, `diagram.edges` by `id`, `scenarios` by `scenarioId`, `calculationSnapshots` by `snapshotId`, `validation.issues` by `(code, equipmentInternalId)`.
3. Pass to canonical `serializeProjectFile`.

`branchEquipmentInternalIds` is **never** sorted — its order is load-bearing.

Top-level key order (enforced by canonical):

1. `schemaVersion`
2. `appVersion`
3. `project`
4. `equipment`
5. `diagram`
6. `scenarios`
7. `calculationSnapshots`
8. `tagCounters`
9. `validation`

`packages/project-io/tests/round-trip.test.ts` proves byte-stability across `load → serialize → load → serialize`.

## Validation codes implemented in PR #1 vs deferred

| Code | PR #1 | Notes |
| --- | --- | --- |
| `E-ID-001` | ✓ | Duplicate internalId across all equipment |
| `W-ID-001` | ✓ | Duplicate tag (default warning) |
| `I-NET-001` | ✓ | Empty project info |
| `E-NET-001` | ✓ | Non-empty model has no in-service utility/generator source |
| `E-NET-002` | — | Floating bus — deferred to PR #2 (graph reachability) |
| `E-NET-003` | ✓ | Equipment references missing bus internalId |
| `E-NET-004` | ✓ | Diagram edge references missing node id |
| `E-NET-005` | ✓ | Diagram node references missing equipment internalId |
| `I-EQ-001` | ✓ | Draft equipment has missing required field |
| `E-EQ-001` | — | Calculation-readiness/import escalation — deferred to PR #2 |
| `E-EQ-002` | — | Non-positive required numeric — deferred to PR #2 |
| `E-EQ-003..005` | — | Branch equipment from/to bus errors — deferred to PR #2 |
| `W-NET-001` | — | Branch-chain endpoint vs. equipment from/to mismatch — deferred to PR #2 |
| `W-EQ-002` | — | Non-3P topology — deferred to PR #2 |
| `W-EQ-003` | — | Transformer %R vs X/R inconsistency — deferred to PR #2 |
| `W-EQ-004` | — | Motor kW vs HP inconsistency — deferred to PR #2 |
| `W-CBL-001` | — | Cable manual R/X audit hint — deferred to PR #2 |
| `E-DIA-001` | ✓ | Stage-1: transformer must have diagram node |
| `E-DIA-002` | ✓ | Stage-1: edge must not carry transformer |
| `E-DIA-003` | ✓ | Stage-1: placeholder containedBusIds must reference an existing bus |
| `E-DIA-004` | ✓ | Stage-1: branch_chain references missing equipment |
| `E-DIA-005` | ✓ | Stage-1: branch_chain references non-breaker/cable/switch equipment |

## tagCounters semantics

`tagCounters` track default auto-tag prefixes only: `UTL`, `GEN`, `BUS`, `TR`, `CBL`, `BRK`, `SW`, `LD`, `M`, `MCC`, `SWGR`. User-edited sub-prefix tags such as `BUS-MV-001` are allowed but are not separately tracked. Counters are monotonic: never decrement on delete, never reuse numbers. Duplicate-tag validation (`W-ID-001`) is the safety mechanism for any tag collision.

## PR split

- **PR #1 (this PR)** — foundation: monorepo, core model, schemas, deterministic save/load, validation skeleton, demo fixture, tests, acceptance manifest, minimal read-only viewer.
- **PR #2** — equipment forms (Cable, Breaker, Switch, Load, Generator, MCC, Switchgear, Bus voltage UX, Motor), property-panel editing routed to canonical equipment collections, full validation rules deferred above (`E-NET-002`, `E-EQ-002+`, `W-EQ-002..004`, `W-CBL-001`, `W-NET-001`).
- **PR #3** — UI polish, validation panel UX, project tree polish, calculation-status placeholder UI (`not_implemented` / `disabled_by_validation`), acceptance closure.

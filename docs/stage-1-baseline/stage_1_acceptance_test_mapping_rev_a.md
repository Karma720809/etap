# Stage 1 Acceptance Criteria to Test Mapping

**Baseline:** Stage 1 One-Line Diagram MVP Spec Rev D  
**Purpose:** Make the first PR review objective by mapping each acceptance criterion to a test, demo step, or manual review item.

| AC No. | Acceptance Criterion Summary | Verification Type | Suggested Test / Review ID | Minimum Evidence |
|---:|---|---|---|---|
| 1 | Create a new project | E2E / unit | `AC01-new-project` | New project state has required top-level keys and empty collections. |
| 2 | Place all Stage 1 equipment types | E2E / component | `AC02-place-equipment` | Palette can create Utility, Generator, Bus, Transformer, Cable, Breaker, Switch, Load, Motor, MCC, SWGR. |
| 3 | Edit equipment data in property panel | Component / E2E | `AC03-edit-properties` | Property edit updates canonical equipment collection. |
| 4 | Immutable `internalId`, editable `tag` | Unit | `AC04-id-tag-policy` | `internalId` is generated once; `tag` can change. |
| 5 | Tag edits do not break references | Unit / E2E | `AC05-tag-edit-reference-stability` | Diagram and connectivity still use `internalId` after tag edit. |
| 6 | Diagram linked by `internalId` | Unit | `AC06-diagram-internal-id-links` | Node/edge references resolve to equipment by `internalId`. |
| 7 | Save project as JSON | Unit / E2E | `AC07-save-json` | Serializer emits valid JSON with documented order. |
| 8 | Reopen saved JSON | Unit / E2E | `AC08-load-json-round-trip` | Save/load/save is byte-stable except expected timestamps/validation. |
| 9 | Duplicate internalId → `E-ID-001` | Unit | `AC09-duplicate-internal-id` | Validator emits `E-ID-001`. |
| 10 | Duplicate tag → `W-ID-001` | Unit | `AC10-duplicate-tag` | Validator emits `W-ID-001` by default. |
| 11 | Empty vs source-missing behavior | Unit | `AC11-empty-vs-source-missing` | Empty project emits `I-NET-001`; non-empty source-less model emits `E-NET-001`. |
| 12 | Floating bus → `E-NET-002` | Unit | `AC12-floating-bus` | Validator emits `E-NET-002`. |
| 13 | Missing bus reference → `E-NET-003` | Unit | `AC13-missing-bus-reference` | Validator emits `E-NET-003`. |
| 14 | Missing diagram node reference → `E-NET-004` | Unit | `AC14-missing-node-reference` | Validator emits `E-NET-004`. |
| 15 | Draft missing fields info / readiness error | Unit | `AC15-draft-vs-ready-required-fields` | Draft emits `I-EQ-001`; calculation-readiness/import can escalate to `E-EQ-001`. |
| 16 | Non-positive required numeric → `E-EQ-002` | Unit | `AC16-non-positive-numeric` | Validator emits `E-EQ-002`. |
| 17 | Calculation buttons do not execute | Component / manual smoke | `AC17-no-stage1-calculation` | Buttons do not produce fake or hard-coded results; component state remains calculation-free. |
| 18 | Calculation status says not implemented | Component / manual smoke | `AC18-calculation-status-placeholder` | UI shows `not_implemented`/`disabled_by_validation`; no E2E framework is required in PR #1. |
| 19 | Validation summary visible | Component / E2E | `AC19-validation-panel` | Bottom panel lists current validation issues. |
| 20 | Documented top-level JSON order | Unit | `AC20-top-level-key-order` | Serialized order is exactly `schemaVersion`, `appVersion`, `project`, `equipment`, `diagram`, `scenarios`, `calculationSnapshots`, `tagCounters`, `validation`. |
| 21 | Transformer rendered as node | Component / fixture | `AC21-transformer-as-node` | Demo fixture renders transformer as node with two connection edges. |
| 22 | Ordered branch-chain items | Unit / fixture | `AC22-ordered-branch-chain` | Demo fixture preserves `BRK-001 → CBL-001` order. |
| 23 | Deterministic stable key ordering | Unit | `AC23-stable-serialization` | Repeated serialization of same project yields identical bytes. |

## Suggested `check:acceptance` Behavior

A lightweight script can read this mapping table or a colocated JSON manifest and print:

```text
AC01-new-project: mapped
AC02-place-equipment: mapped
...
AC23-stable-serialization: mapped
All 23 Stage 1 acceptance criteria have mapped verification IDs.
```

The script does not need to execute all tests. Its first purpose is coverage accountability: every acceptance criterion must have an explicit verification owner.

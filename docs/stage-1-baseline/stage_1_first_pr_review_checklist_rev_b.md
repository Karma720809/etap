# Stage 1 First PR Review Checklist

**Project:** Power System Study App  
**Baseline:** Stage 1 One-Line Diagram MVP Spec Rev D  
**Purpose:** Review the first implementation PR before Stage 1 behavior becomes difficult to refactor.

## 1. Scope Control

- [ ] The PR does **not** implement Load Flow, Voltage Drop, Short Circuit, Cable Sizing, Equipment Duty Check, or report generation.
- [ ] Calculation buttons do not generate fake, placeholder, or hard-coded calculation results.
- [ ] Calculation status clearly indicates that calculation modules are not implemented in Stage 1.

## 2. Repository and Package Structure

- [ ] App/package structure follows the Stage 1 monorepo shape.
- [ ] Core model types are separated from UI components.
- [ ] Validation logic is separated from React Flow rendering logic.
- [ ] Project I/O logic is separated from UI state handling.

## 3. Core Model and ID Policy

- [ ] Every equipment object has immutable `internalId` and editable `tag`.
- [ ] Editing `tag` does not break references, diagram selection, save/load, or validation.
- [ ] References use `internalId`, not tag.
- [ ] Duplicate `internalId` is detected as `E-ID-001`.
- [ ] Duplicate `tag` is detected as `W-ID-001` by default.
- [ ] `tagCounters` are monotonic and do not reuse deleted numbers.

## 4. Transformer and Branch Modeling — Must Check Early

- [ ] Transformer is rendered as a diagram node, not as a diagram edge.
- [ ] Transformer engineering data remains in `equipment.transformers`.
- [ ] Transformer-to-bus links are represented by `connection` edges.
- [ ] Cable, breaker, and switch are not represented as normal diagram nodes unless explicitly needed for a later visual enhancement.
- [ ] Cable, breaker, and switch can be represented as ordered `branch_chain` items on a diagram edge.
- [ ] `branchEquipmentInternalIds` preserves upstream-to-downstream order.
- [ ] The demo branch chain supports `BUS-LV-001 → BRK-001 → CBL-001 → BUS-MTR-001` without hidden junction nodes.

## 5. Diagram Model and React Flow Boundary

- [ ] React Flow is used as a renderer, not as the canonical data model.
- [ ] `DiagramNodeModel.equipmentInternalId` links each diagram node to canonical equipment data.
- [ ] `connection` edges are used for non-branch links such as Utility-to-Bus, Transformer-to-Bus, and Motor-to-Bus.
- [ ] `connection` edges are rejected by schema validation if they contain `branchEquipmentInternalIds`.
- [ ] `branch_chain` edges are used for ordered serial branch equipment.
- [ ] Moving a diagram node updates only diagram position, not engineering data.
- [ ] Property panel edits update equipment collections, not React Flow-only metadata.

## 6. Project JSON Save/Load

- [ ] User can save a project as JSON.
- [ ] User can reopen saved JSON and recover equipment data, diagram layout, tag counters, scenarios, and saved validation reference.
- [ ] Load performs schema-level validation before applying state.
- [ ] `loadProjectFile` surfaces schema warnings and schema errors to the caller; warnings are not lost when strict parsing fails.
- [ ] Load recomputes fresh runtime validation after import.
- [ ] Saved validation is treated as audit reference, not authoritative runtime state.
- [ ] Stage 1 project file does not store `calculationResults`.
- [ ] `calculationSnapshots` is present only as a reserved empty array or is otherwise not populated with real snapshots.

## 7. Deterministic Serialization

- [ ] Top-level JSON keys are serialized in this order: `schemaVersion`, `appVersion`, `project`, `equipment`, `diagram`, `scenarios`, `calculationSnapshots`, `tagCounters`, `validation`.
- [ ] Equipment arrays are serialized in `internalId` order, not tag order.
- [ ] Internal ID ordering is chosen to minimize diff churn when tags change or new equipment is appended.
- [ ] Stable key ordering is deterministic enough for git review.

## 8. Validation Behavior

- [ ] Empty project raises `I-NET-001`, not `E-NET-001`.
- [ ] Non-empty electrical model with no in-service source raises `E-NET-001`.
- [ ] Floating bus is reported as `E-NET-002`.
- [ ] Equipment referencing a missing bus is reported as `E-NET-003`.
- [ ] Diagram edge referencing a missing node is reported as `E-NET-004`.
- [ ] Diagram node referencing missing equipment is reported as `E-NET-005`.
- [ ] Missing required fields in newly created draft equipment are reported as `I-EQ-001`.
- [ ] Calculation-readiness/import validation may escalate missing required fields to `E-EQ-001`.
- [ ] Non-positive required numeric values are reported as `E-EQ-002`.
- [ ] Non-3P topology is reported as warning `W-EQ-002`, not a Stage 1 hard failure.
- [ ] Transformer `%R` vs X/R inconsistency can produce `W-EQ-003`.
- [ ] Motor kW vs HP inconsistency can produce `W-EQ-004`.
- [ ] Cable manual R/X entry can produce or preserve the Stage 4 audit hint `W-CBL-001`.

## 9. Stage 1 Demo Fixture

- [ ] `stage_1_demo_fixture.json` imports successfully.
- [ ] The fixture renders Utility → MV Bus → Transformer → LV Bus → Branch Chain → Motor.
- [ ] The transformer appears as a node.
- [ ] The LV feeder branch chain contains ordered `BRK-001 → CBL-001`.
- [ ] Save/load round-trip preserves the same canonical equipment references.
- [ ] Fresh validation of the fixture returns `valid` or only expected warnings.

## 10. Acceptance Criteria Mapping

- [ ] Stage 1 Rev D acceptance criteria #1–#23 are each mapped to a test, demo step, or manual review item.
- [ ] The acceptance criteria mapping table is updated and included in the PR or repository docs.
- [ ] Criteria #21–#23 are explicitly verified in the first PR: transformer-as-node, ordered branch chain, deterministic ordering.

## 11. First PR Exit Decision

- [ ] Approved: foundation is safe for Tasks 8–13, and `npm run check:acceptance` or equivalent confirms #1–#23 coverage mapping.
- [ ] Approved: all schema warnings from `loadProjectFile` are surfaced to the user or review log, not silently swallowed.
- [ ] Approved with comments: only minor UI/form issues remain.
- [ ] Rework required: any issue affects canonical model, transformer/branch representation, save/load, or deterministic serialization.

# Stage 2 Spec Overlap Plan

**Baseline:** Stage 1 Rev C implementation plan  
**Goal:** Start Stage 2 specification work before Stage 1 is fully complete, without destabilizing Stage 1.

## 1. Trigger Point

Start Stage 2 spec drafting when Stage 1 Tasks 1–7 are complete:

1. Initialize app and packages
2. Define core model package
3. Implement ID/tag utilities
4. Implement project state store
5. Build main layout
6. Implement equipment palette
7. Implement React Flow canvas

At this point, the canonical model and diagram representation should be stable enough to define calculation handoff contracts.

## 2. Stage 2 Scope to Draft First

Stage 2 should cover Load Flow and Voltage Drop MVP only.

Initial Stage 2 spec sections:

1. Stage 2 purpose and non-goals
2. Calculation-ready validation escalation from Stage 1 draft validation
3. App standard network model
4. Conversion from equipment/diagram model to network model
5. Transformer-as-node conversion rule
6. Branch-chain conversion rule
7. Load Flow input contract
8. Voltage Drop input contract
9. Solver adapter boundary
10. Result model and stale result policy
11. Golden Case candidates GC-LF and GC-VD
12. Stage 2 acceptance criteria

## 3. Stage 1 / Stage 2 Interface Questions to Close Early

- How is a `branch_chain` converted into ordered electrical branches for calculation?
- Does a branch chain with `BRK-001 → CBL-001` become one equivalent branch or multiple serial network elements?
- When a `branch_chain` contains both a closed breaker and a cable, does Stage 2 map them to one combined branch in pandapower, or to separate elements such as switch + line?
- How are open breaker/switch states treated in network graph construction?
- Which buses are calculation buses versus visual-only terminal/attachment points?
- How is transformer direction determined from `fromBus` / `toBus` and diagram connection edges?
- What is the minimum calculation-ready equipment set for GC-LF-01?
- Which Stage 1 validation `info` issues escalate to Stage 2 `error` issues?

## 4. Workstream Overlap

| Stage 1 Task | Parallel Stage 2 Spec Work |
|---|---|
| Tasks 1–7 complete | Start Stage 2 network model draft |
| Task 8 property forms | Define calculation-ready required fields |
| Task 9 validation | Define Stage 2 validation escalation map |
| Task 10 save/load | Define calculation snapshot creation point |
| Task 11 calculation placeholder | Define real calculation job status transitions |
| Task 12 demo case | Convert demo case into first GC-LF/GC-VD fixture |
| Task 13 polish | Prepare Stage 2 implementation prompt |

## 5. First Stage 2 Fixture Candidate

Use `stage_1_demo_fixture.json` as the starting point for:

- Save/load round-trip test
- Stage 1 validation test
- Stage 2 network conversion test
- GC-LF-01 draft case: Utility + Transformer + Motor feeder
- GC-VD-01 draft case: LV motor feeder cable voltage drop

The Stage 2 fixture should add expected load-flow and voltage-drop outputs only after independent reference values are prepared.

## 6. Guardrails

- Do not modify Stage 1 canonical schema just to make Stage 2 easier unless the change is explicitly reviewed.
- Do not let pandapower element structure leak into the Stage 1 model.
- Do not compute load flow from React Flow nodes directly; calculation must use the app standard network model.
- Do not create real calculation snapshots until Stage 2 result model is defined.
- The first real calculation snapshot is generated only after the Load Flow + Voltage Drop result model schema is finalized in Stage 2.

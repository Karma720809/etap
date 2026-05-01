# Schema Alignment Decision — Stage 1 Canonical Model

## Decision

The Stage 1 project-file schema is the canonical implementation schema for the Power System Study App Stage 1 baseline.

PRD v1.0 Section 8 examples remain useful as explanatory examples, but they are not the enforceable save/load boundary. The enforceable boundary is:

```text
schema/prd_v1_data_model.schema.json
stage_1_project_file.rev_d.schema.json
stage_1_project_schema.rev_d.zod.ts
```

## Reason

The Stage 1 schema has gone through the implementation-readiness review cycle and includes decisions that are not fully represented in the original PRD examples:

- `connectedBus` and `status` are used consistently for bus-attached equipment.
- Transformer is represented as a diagram node, not an edge.
- Ordered `branch_chain` edges represent serial branch equipment such as breaker and cable.
- `tagCounters` use default auto-tag prefixes and do not track user-defined sub-prefixes.
- `validation` stored in the project file is an audit reference only; fresh validation is authoritative after load.
- `calculationSnapshots` is reserved and remains empty in Stage 1.

## Consequence

No adapter or Golden Case should assume the older PRD example field names such as `bus` or `inService` as the project-file canonical form.

If a future import format uses different names, that difference must be handled by an explicit import adapter and must not mutate the canonical project file silently.

# Stage 1 Pre-Implementation Support Package

This package collects supporting artifacts to run in parallel with Stage 1 implementation of the Power System Study App.

## Contents

```text
stage_1_preimplementation_support/
  README.md
  schema/
    prd_v1_data_model.schema.json
    schema_alignment_decision.md
  golden_cases/
    README.md
    golden_case_metadata.schema.json
    gc_sc_01/
      GC-SC-01.utility_transformer_lv_fault.json
      GC-SC-01.hand_calculation.md
  contracts/
    adapter_contract_test_spec.md
  wireframes/
    ui_wireframe_brief.md
```

## Recommended Timing

| Artifact | Timing |
|---|---|
| Data Model schema | Start with Stage 1 implementation |
| Golden Case template repository | Start with Stage 1 implementation |
| Adapter contract test spec | Draft now; implement before Stage 2 solver work |
| UI wireframe brief | Run in parallel with Stage 1 UI implementation |

## Notes

- The data model schema is aligned with the Stage 1 canonical project-file schema. PRD v1.0 Section 8 examples are illustrative, not the enforceable save/load boundary.
- The Golden Case repository includes one initial hand-calculation case, GC-SC-01.
- The adapter contract test spec is intentionally forward-looking and should become executable during Stage 2/3.
- The wireframe brief is textual and can be converted into Figma or React mockups.


## v1.1 Alignment Note

This package resolves the PRD-schema vs Stage-1-schema divergence by adopting the Stage 1 Rev D project-file schema as the canonical implementation boundary. Golden Case input for GC-SC-01 now includes a Stage 1 canonical `projectFile` and explicit simplified short-circuit solver options.

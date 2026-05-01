# Golden Case Template Repository

This directory defines the initial Golden Case repository structure for the Power System Study App.

## Files

```text
golden_cases/
  README.md
  golden_case_metadata.schema.json
  gc_sc_01/
    GC-SC-01.utility_transformer_lv_fault.json
    GC-SC-01.hand_calculation.md
```

## Initial Verified Case

`GC-SC-01` is the first short-circuit Golden Case:

```text
Utility → Transformer → LV Bus 3-phase bolted fault
```

It is intentionally small so that the expected result can be checked by independent hand calculation.

## Golden Case Policy

Golden Case expected values should use the following priority:

1. Hand calculation
2. IEC example
3. Public engineering reference
4. Existing verified calculation sheet
5. Independent commercial tool result
6. pandapower result for provisional regression/cross-check only
7. Previous version result for regression-only cases

Verified Golden Cases should not use pandapower output as the sole engineering reference.

## CI Usage

A future CI runner should:

1. Load each `*.json` Golden Case file.
2. Validate the metadata against `golden_case_metadata.schema.json`.
3. Build a calculation snapshot from the input section.
4. Run the target module.
5. Compare numeric values using the declared tolerance.
6. Compare status, warningCodes, and errorCodes by exact match.
7. Fail release-gate builds if a verified Golden Case fails.

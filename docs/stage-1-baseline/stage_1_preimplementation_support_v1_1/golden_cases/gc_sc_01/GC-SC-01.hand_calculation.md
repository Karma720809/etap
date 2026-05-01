# GC-SC-01 Hand Calculation — Utility + Transformer LV Bus 3-Phase Fault

## 1. Purpose

This file documents the independent hand calculation basis for the first verified short-circuit Golden Case.

The calculation is intentionally simple:

```text
Utility source → 6.6 kV Bus → 2.0 MVA Transformer → 0.4 kV LV Bus fault
```

The fault is a 3-phase bolted fault at the LV bus. Motor and generator contributions are excluded.

## 2. Input Data

| Item | Value |
|---|---:|
| Utility nominal voltage | 6.6 kV |
| Utility short-circuit level | 250 MVA |
| Utility X/R ratio | 10.0 |
| Transformer rating | 2.0 MVA |
| Transformer voltage | 6.6 / 0.4 kV |
| Transformer impedance | 6.0 % |
| Transformer resistance component | 1.0 % |
| Voltage factor c | 1.0 |

## 3. Base Current at LV Side

Using transformer base:

```text
S_base = 2.0 MVA
V_base,LV = 0.4 kV
I_base = S_base / (sqrt(3) × V_base)
       = 2,000,000 / (sqrt(3) × 400)
       = 2,886.75 A
```

## 4. Transformer Per-Unit Impedance

```text
Z_tr = 6.0 % = 0.060 pu
R_tr = 1.0 % = 0.010 pu
X_tr = sqrt(Z_tr² - R_tr²)
     = sqrt(0.060² - 0.010²)
     = 0.05916 pu
```

## 5. Utility Per-Unit Impedance on Transformer Base

```text
Z_utility = S_transformer / S_sc_utility
          = 2.0 / 250.0
          = 0.008 pu
```

With X/R = 10:

```text
R_utility = Z / sqrt(1 + (X/R)²)
          = 0.008 / sqrt(1 + 10²)
          = 0.000796 pu

X_utility = 10 × R_utility
          = 0.007960 pu
```

## 6. Total Source + Transformer Impedance

```text
R_total = R_tr + R_utility
        = 0.010000 + 0.000796
        = 0.010796 pu

X_total = X_tr + X_utility
        = 0.059161 + 0.007960
        = 0.067121 pu

Z_total = sqrt(R_total² + X_total²)
        = sqrt(0.010796² + 0.067121²)
        = 0.067984 pu

X/R_total = X_total / R_total
          = 6.22
```

## 7. Initial Symmetrical Short-Circuit Current Ik''

```text
Ik'' = c × I_base / Z_total
     = 1.0 × 2,886.75 / 0.067984
     = 42,463 A
     = 42.46 kA
```

## 8. Peak Short-Circuit Current Ip

Using the simplified IEC-style peak factor expression:

```text
κ = 1.02 + 0.98 × exp(-3R/X)
```

where:

```text
R/X = 0.010796 / 0.067121 = 0.16084
κ = 1.02 + 0.98 × exp(-3 × 0.16084)
  = 1.6247
```

Then:

```text
Ip = κ × sqrt(2) × Ik''
   = 1.6247 × sqrt(2) × 42.46
   = 97.55 kA
```

## 9. Expected Result

| Result | Expected |
|---|---:|
| Ik'' | 42.46 kA |
| Ip | 97.55 kA |
| X/R | 6.22 |
| Status | pass |
| Warning codes | none |
| Error codes | none |

## 10. Tolerance

| Field | Tolerance |
|---|---:|
| Ik'' | ±1 % |
| Ip | ±2 % |
| X/R | ±5 % |
| status | exact match |
| warningCodes | exact match |
| errorCodes | exact match |

## 11. Notes for Implementation

- This case should not depend on pandapower as the only reference.
- pandapower may be used as a cross-check, but the release-gate expected value is the hand calculation above.
- If the adapter or solver uses a different IEC voltage factor or peak-current option, the selected option must be recorded in the calculation snapshot.
- This Golden Case intentionally uses a simplified IEC-style assumption set, not the full strict IEC 60909 maximum short-circuit option set. The solver/adapter options must explicitly match this case: `voltageFactorC = 1.0`, `applyKt = false`, `applyKg = false`, and motor/generator contribution excluded. These options must be recorded in the calculation snapshot so that future strict-IEC Golden Cases do not falsify this simplified benchmark.

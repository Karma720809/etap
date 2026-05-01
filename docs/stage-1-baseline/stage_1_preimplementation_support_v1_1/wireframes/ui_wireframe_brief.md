# UI Wireframe Brief — Power System Study App

## 1. Purpose

This document translates PRD v1.0 §10 into implementation-oriented wireframe requirements.

The actual visual design may be created in Figma or directly in React, but the layout and interaction rules below should remain stable during Stage 1.

## 2. Main 4-Panel Layout

```text
┌──────────────────────┬─────────────────────────────────────────────┬────────────────────────────┐
│ Left Panel           │ Center Canvas                               │ Right Panel                │
│                      │                                             │                            │
│ - Equipment Palette  │ One-Line Diagram                            │ Selected Equipment Form    │
│ - Project Tree       │                                             │                            │
│                      │                                             │                            │
├──────────────────────┴─────────────────────────────────────────────┴────────────────────────────┤
│ Bottom Panel                                                                                     │
│ - Validation issues                                                                               │
│ - Calculation status placeholder                                                                  │
│ - Warning/error summary                                                                           │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Stage 1 Wireframe Scope

### Included

- Project title/header
- Equipment palette
- Project tree
- React Flow diagram canvas
- Selected equipment property form
- Validation issue list
- Save/load controls
- Calculation buttons as disabled placeholders

### Excluded

- Real Load Flow result overlay
- Real Short Circuit result overlay
- Real Cable Sizing result overlay
- Scenario comparison view
- Report export UI
- TCC/protection coordination view

## 4. Left Panel

### 4.1 Equipment Palette

Initial palette items:

```text
Utility / Grid Source
Generator
Bus
Transformer
Cable
Breaker
Switch
Load
Motor
MCC Placeholder
Switchgear Placeholder
```

Rules:

- Dragging a node-type equipment creates a diagram node.
- Transformer is a node, not an edge.
- Cable, Breaker, and Switch can participate in a branch-chain edge.
- Palette item labels use user-facing engineering names, while created objects receive immutable `internalId` and editable `tag`.

### 4.2 Project Tree

Suggested grouping:

```text
Project
  Sources
  Buses
  Transformers
  Branches
    Cables
    Breakers
    Switches
  Loads
  Motors
  Generators
  Placeholders
  Scenarios
```

The tree should display `tag` first and retain `internalId` in metadata.

## 5. Center Canvas

### 5.1 Canvas Element Rules

| Equipment | Canvas Representation |
|---|---|
| Utility | Node |
| Generator | Node |
| Bus | Node |
| Transformer | Node |
| Load | Node |
| Motor | Node |
| Cable | Branch-chain edge member |
| Breaker | Branch-chain edge member |
| Switch | Branch-chain edge member |
| MCC/Switchgear | Visual/container node |

### 5.2 Transformer Display

Recommended Stage 1 representation:

```text
MV Bus ── connection ── Transformer Node ── connection ── LV Bus
```

The transformer node should display:

```text
TR-001
2.0 MVA
6.6 / 0.4 kV
```

### 5.3 Branch Chain Display

Recommended Stage 1 representation:

```text
LV Bus ── [BRK-001]──[CBL-001] ── Motor Bus
```

Internal edge data:

```json
{
  "kind": "branch_chain",
  "branchEquipmentInternalIds": ["eq_brk_001", "eq_cbl_001"]
}
```

## 6. Right Panel — Property Form

### 6.1 General Form Rules

- `internalId` is visible in advanced/audit section only.
- `tag` is editable.
- Required fields are marked clearly.
- Newly created incomplete equipment should show info-level incomplete status, not immediate error flood.
- Calculation-readiness validation may escalate missing required fields to errors.

### 6.2 Common Sections

```text
Identity
  - Tag
  - Name
  - Internal ID (read-only, advanced)

Electrical Data
  - Equipment-specific fields

Connectivity
  - From/To bus or connected bus

Validation
  - Field-level issues
  - Cross-field issues
```

## 7. Bottom Panel

### 7.1 Validation Tab

Columns:

```text
Severity | Code | Equipment Tag | Field | Message | Action
```

Severity levels:

```text
info
warning
error
```

### 7.2 Calculation Status Placeholder

Stage 1 buttons:

```text
[Load Flow]        disabled / placeholder
[Voltage Drop]     disabled / placeholder
[Short Circuit]    disabled / placeholder
[Cable Sizing]     disabled / placeholder
[Report]           disabled / placeholder
```

Rules:

- Buttons must not generate fake results.
- Clicking disabled/placeholder button may show: "Calculation module will be implemented in Stage 2/3/4."
- No result table should display fabricated values.

## 8. Scenario UI Placeholder

Stage 1 should show scenario structure only if needed.

Recommended minimal UI:

```text
Scenario: Base / Normal Operation
[Scenario management unavailable in Stage 1]
```

Do not implement override editing UI in Stage 1.

## 9. Stage 2 Wireframe Hooks

Leave space for:

- Bus voltage overlay
- Branch current/loading overlay
- Transformer loading overlay
- Fault current overlay
- Scenario selector
- Result table tabs

## 10. Wireframe Acceptance Criteria

| ID | Criterion |
|---|---|
| WF-01 | 4-panel layout is visible and usable at common desktop resolution. |
| WF-02 | Equipment palette supports all Stage 1 equipment types. |
| WF-03 | Transformer is visually represented as a node. |
| WF-04 | Branch chain can visually show ordered breaker/cable/switch members. |
| WF-05 | Property panel shows tag editable and internalId read-only. |
| WF-06 | Validation panel distinguishes info/warning/error. |
| WF-07 | Calculation buttons do not produce fake results. |
| WF-08 | Save/load controls are visible and tied to project file workflow. |

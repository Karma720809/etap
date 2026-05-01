# PRD v1.0 — Power System Study App

## 1. 문서 목적

본 PRD는 ETAP의 기본 전력계통 해석 기능을 참고하여, 산업 플랜트 및 EPC 설계 검토 업무에 사용할 수 있는 **Power System Study App**의 초기 제품 요구사항을 정의한다.

본 앱은 기존 **LV Cable Sizing App** 개발 경험과 검증 체계를 확장하여, 단선결선도 기반의 Load Flow, Voltage Drop, Short Circuit, Cable Sizing, Equipment Duty Check 기능을 통합하는 것을 목표로 한다.

본 문서는 다음 목적을 가진다.

1. 초기 MVP 범위를 명확히 정의한다.
2. Cable Sizing App과의 연계 방식을 정의한다.
3. 계산엔진, 데이터모델, UI, 검증 기준, Golden Case 운영 원칙을 정의한다.
4. 향후 Protection Coordination, Arc Flash, Harmonics 등 고급 기능 확장의 기반을 마련한다.

---

## 2. 제품 비전

본 앱의 장기 목표는 상용 ETAP 수준의 모든 기능을 즉시 구현하는 것이 아니라, EPC reviewer 및 electrical engineer가 실제 프로젝트에서 반복적으로 수행하는 기본 전력계통 검토를 빠르고 일관되게 수행할 수 있는 **실무형 전력계통 해석 도구**를 만드는 것이다.

초기 제품은 다음 방향을 따른다.

- 복잡한 연구용 해석보다 실무 검토 중심
- 단선결선도 기반 입력
- 계산 근거와 warning/error를 명확히 표시
- Cable Sizing, Voltage Drop, Short Circuit을 하나의 데이터모델에서 연계
- Golden Case 기반 회귀 검증
- EPC calculation sheet 및 review report 출력 가능

---

## 3. 대상 사용자

### 3.1 Primary User

**Electrical / Instrument / EPC Reviewer**

주요 사용자는 산업 플랜트 프로젝트에서 전기 설계자료를 검토하는 엔지니어이다. 사용자는 다음 업무를 수행한다.

- LV/MV power distribution 검토
- Transformer, cable, motor, load, breaker sizing 검토
- Vendor package power interface 검토
- Voltage drop 및 short circuit adequacy 확인
- Cable sizing calculation 검토
- EPC comment 작성 근거 확보

### 3.2 Secondary User

**Electrical Designer / Calculation Engineer**

설계자는 다음 목적으로 사용한다.

- 기본 전력계통 모델 작성
- Load Flow 및 Voltage Drop 계산
- Cable size 선정
- Breaker duty check
- 보고서 출력

---

## 4. 문제 정의

현재 전력계통 검토 업무에서는 다음 문제가 반복된다.

1. Cable sizing, voltage drop, short circuit calculation이 서로 다른 Excel sheet에서 분리되어 관리된다.
2. 동일한 load, cable, transformer data가 여러 파일에 중복 입력되어 inconsistency가 발생한다.
3. 설계 변경 시 관련 계산 결과의 영향 범위를 추적하기 어렵다.
4. Calculation result가 pass/fail만 표시되고, 어떤 입력값과 기준 때문에 실패했는지 audit trail이 부족하다.
5. Package vendor data와 Main electrical system data의 interface 검토가 어렵다.
6. ETAP과 같은 상용 툴은 강력하지만, 단순 EPC review용으로는 무겁고 커스터마이징이 어렵다.

본 앱은 이 문제를 해결하기 위해, 경량화된 one-line based calculation environment를 제공한다.

---

## 5. 제품 범위

## 5.1 MVP Scope

MVP는 LV only로 제한하지 않고, 산업 플랜트에서 일반적인 MV/LV 기본 배전계통을 지원한다.

사용자는 Utility/Grid, MV Bus, Transformer, LV Bus, LV Load, Motor, Cable, Breaker를 하나의 one-line diagram에서 구성할 수 있어야 한다. 다만 MVP의 상세 sizing 및 duty check 범위는 LV 중심으로 제한한다.

MV는 다음 역할로 모델링한다.

- Upstream source representation
- MV bus voltage level
- Transformer primary-side connection
- Short-circuit contribution path
- Load flow path
- LV fault current 및 LV voltage drop 계산을 위한 upstream impedance source

MVP는 다음 기능을 포함한다.

| Module | Included in MVP | Description |
|---|---:|---|
| Project Management | Yes | Project 생성, 저장, 불러오기 |
| One-Line Diagram | Yes | Bus, Source, Transformer, Cable, Load, Motor, Breaker 배치 |
| Equipment Data Input | Yes | 각 equipment별 입력 form |
| Load Flow | Yes | 3상 평형계통 기준 steady-state load flow |
| Voltage Drop | Yes | Cable 및 bus voltage drop 계산 |
| Short Circuit | Yes | IEC 60909 simplified 3-phase fault calculation |
| Equipment Duty Check | Yes | Cable loading, transformer loading, breaker interrupting duty |
| Cable Sizing | Yes | 기존 LV Cable Sizing App 계산엔진과 연계 |
| Warning/Error System | Yes | validation, warning, fail-closed result handling |
| Golden Case Test | Yes | 회귀 검증용 benchmark case set |
| Report Export | Yes | Excel/PDF calculation report 출력 |

---

## 5.2 Out of Scope for MVP

다음 기능은 MVP에서 제외한다.

| Module | Reason for Exclusion |
|---|---|
| Arc Flash | Long-term roadmap에 포함하되 MVP에서는 calculation, incident energy, arc flash boundary, PPE category, label generation을 구현하지 않는다. |
| Harmonic Analysis | Harmonic source model 및 frequency-domain impedance model 필요 |
| Transient Stability | Dynamic machine model 필요 |
| Dynamic Motor Starting | Motor acceleration model 및 load torque curve 필요. MVP에서는 simplified starting voltage drop snapshot만 제공한다. |
| Detailed Protection Coordination / TCC Viewer | Manufacturer curve library 및 TCC coordination engine 필요. Post-MVP로 분리한다. |
| MV Cable Sizing Detailed Check | MVP 상세 sizing 범위는 LV 중심으로 제한 |
| Detailed MV Protection Coordination | Relay library 및 MV protection engineering scope 필요 |
| Grounding Study | Zero-sequence network 및 접지방식 상세 모델 필요 |
| Unbalanced 1-phase/2-phase Analysis | Phase-domain 해석엔진 필요 |
| Real-time Monitoring / Digital Twin | Field data interface 필요 |
| Relay Setting Management | 별도 protection engineering scope |

---

## 6. 핵심 설계 원칙

### 6.1 Single Source of Truth

모든 calculation module은 동일한 project data model을 사용해야 한다.

예:

- Load data는 Load Flow, Cable Sizing, Voltage Drop에 공통 사용
- Transformer impedance는 Load Flow와 Short Circuit에 공통 사용
- Cable R/X, ampacity, length는 Voltage Drop, Load Flow, Short Circuit, Cable Sizing에 공통 사용

동일 정보를 여러 모듈에서 별도로 입력하지 않는다.

---

### 6.2 Fail-Closed Validation

계산에 필수적인 값이 없거나 invalid 상태이면 계산 결과를 억지로 표시하지 않는다.

예:

- Cable length = 0 → invalid
- Transformer kVA = 0 → invalid
- Short circuit current = 0 → invalid
- Trip time = 0 → invalid
- Design current override = 0 → invalid
- Soil resistivity required but missing for buried cable → invalid

Invalid 상태에서는 result table에 이전 결과가 남지 않아야 한다.

---

### 6.3 Warning과 Error의 명확한 분리

| Type | Meaning | Calculation Allowed? | Example |
|---|---|---:|---|
| Warning | 계산은 가능하지만 사용자가 검토해야 하는 상태 | Yes | Ambient correction factor default used |
| Error | 계산 기준이 성립하지 않는 상태 | No | Cable length missing |
| Invalid | 입력값이 물리적으로 불가능하거나 계산 불가 | No | Transformer kVA = 0 |

---

### 6.4 Source와 Status의 분리

모든 주요 입력값은 source와 status를 별도 관리한다.

예:

```json
{
  "designCurrent": {
    "value": 145.2,
    "unit": "A",
    "source": "calculated_from_motor_fla",
    "status": "valid"
  }
}
```

Source 예:

- user_input
- calculated
- calculated_from_motor_fla
- defaulted
- library
- imported
- vendor_data

Status 예:

- valid
- warning
- invalid
- missing
- stale

---

### 6.5 Auditability

모든 계산 결과는 다음 정보를 포함해야 한다.

- 사용된 입력값
- 입력값의 source
- 적용된 standard 또는 calculation method
- correction factor
- pass/fail 기준
- warning/error code
- calculation timestamp
- scenario name

---

## 6.6 Solver Dependency Boundary

pandapower는 내부 solver로 사용하지만, 앱의 표준 데이터모델은 pandapower의 모델링 구조에 종속되지 않아야 한다.

이를 위해 다음 항목을 명시적으로 관리한다.

### 6.6.1 Solver Capability Registry

앱은 solver가 직접 처리 가능한 case와 직접 처리할 수 없는 case를 registry 형태로 관리해야 한다.

| Case | App Standard Data Model | Solver Support | pandapower Mapping | Required Handling |
|---|---|---:|---|---|
| Utility / Grid source | Utility object | Yes | ext_grid | adapter에서 Slack/source로 변환 |
| Generator - grid parallel PQ | Generator object, dispatch P/Q | Limited | sgen or gen | MVP에서는 optional, dispatch 입력 필요 |
| Generator - voltage controlled PV | Generator object, voltage setpoint | Limited | gen | Post-MVP 또는 validated case 필요 |
| Generator - island/isoc mode | Generator object, isochronous mode | No for MVP | ext_grid-like mapping possible | MVP 제외, future solver extension |
| Transformer vendor tap | Tap 1~5, ±2.5% 등 vendor 형식 | Yes with conversion | tap_side, tap_pos, tap_step_percent | solver 호출 직전 percent 환산 |
| Transformer impedance tolerance | scenario override 가능 | Yes | direct parameter change | scenario override layer에서 처리 |
| Motor short-circuit contribution | motor object | Limited | motor/sgen equivalent depending on solver capability | MVP에서는 simplified contribution rule 또는 excluded case를 명시 |
| Detailed protection clearing | protective device object | No | none | app layer에서 입력값 또는 future TCC 기반 처리 |

Generator MVP policy:

- MVP의 기본 전원은 Utility/Grid source이다.
- Generator object는 data model과 one-line element에는 포함할 수 있으나, MVP release gate 계산에서는 grid-parallel fixed P/Q contribution 또는 out-of-service 상태만 우선 지원한다.
- PV mode, islanded/isoc mode, generator voltage control, subtransient detailed short-circuit contribution은 verified Golden Case 확보 전까지 Post-MVP 또는 provisional feature로 분류한다.

Motor short-circuit contribution MVP policy:

- Motor contribution included/excluded는 scenario override로 표현할 수 있다.
- Included case는 `supported_with_simplification`으로 표시한다.
- Simplified rule은 fixed sub-transient reactance or equivalent contribution assumption으로 처리하고, dynamic decay는 MVP에서 반영하지 않는다.
- 정확한 contribution method와 assumed X'' value source는 calculation snapshot과 report에 표시해야 한다.

### 6.6.2 Solver Gap Register

pandapower가 직접 계산하지 못하거나 앱 정책과 다르게 처리하는 항목은 `solverGapRegister`로 관리한다.

각 항목은 다음 정보를 가진다.

```json
{
  "gapId": "SG-TR-TAP-001",
  "area": "transformer_tap",
  "description": "Vendor tap notation must be converted to solver tap percent before calculation.",
  "appRepresentation": "tapPosition: 1~5, neutralTap: 3, stepPercent: 2.5",
  "solverRepresentation": "tap_pos and tap_step_percent",
  "handlingPolicy": "convert_in_adapter",
  "mvpStatus": "supported_with_conversion"
}
```

Allowed `handlingPolicy` values:

- convert_in_adapter
- calculate_in_app_layer
- exclude_from_mvp
- require_user_input
- future_solver_extension

이 registry는 향후 solver 교체 또는 pandapower upgrade 시 adapter 재작성 범위를 줄이기 위한 필수 문서이다.

---

## 6.7 Scenario Override Model

Scenario는 base equipment data를 복제하지 않는다. Scenario는 base data에 대한 override layer로 정의한다.

Base project data는 Single Source of Truth이며, scenario는 특정 운전조건 또는 계산조건에서 달라지는 값만 override한다.

Canonical override path format:

```text
<collection>.<internalId>.<fieldPath>
```

Path policy:

- `collection`은 app standard data model의 plural collection name을 사용한다. 예: `utilities`, `transformers`, `motors`, `breakers`, `switches`, `generators`.
- `internalId`는 앱 내부 immutable equipment ID를 사용한다. Editable user tag는 path 저장 기준으로 사용하지 않는다.
- `fieldPath`는 해당 equipment schema의 canonical field name을 사용한다. Nested field가 필요한 경우 dot notation을 사용할 수 있다.
- UI는 사용자 편의를 위해 tag alias를 표시할 수 있으나, project file과 calculation snapshot에는 internalId 기반 canonical path를 저장한다.

Scenario override 예:

```json
{
  "scenarioId": "SCN-MIN-SC",
  "name": "Minimum Short-Circuit Case",
  "inheritsFrom": null,
  "overrides": [
    {
      "path": "utilities.eq_util_001.scLevelMva",
      "value": 250,
      "reason": "minimum short-circuit utility case"
    },
    {
      "path": "transformers.eq_tr_001.vkPercent",
      "value": 6.6,
      "reason": "+10% transformer impedance tolerance"
    },
    {
      "path": "motors.eq_motor_005.inService",
      "value": false,
      "reason": "motor excluded from minimum short-circuit contribution"
    },
    {
      "path": "breakers.eq_brk_001.state",
      "value": "closed",
      "reason": "normal feeder closed"
    }
  ]
}
```

Scenario override 대상 예:

- Utility fault level: max/min short-circuit case
- Utility X/R ratio
- Transformer impedance tolerance
- Transformer tap position
- Motor in-service / out-of-service
- Load demand factor
- Generator dispatch
- Breaker/switch open/closed state

Override policy:

1. MVP에서는 scenario inheritance를 지원하지 않는다. `inheritsFrom`은 reserved field이며 null이어야 한다.
2. 하나의 scenario 안에서 동일 path를 두 번 override하면 validation error로 처리한다.
3. 존재하지 않는 collection, 존재하지 않는 `internalId`, 존재하지 않는 property, 허용되지 않는 value type을 참조하는 override path는 fail-closed error로 처리한다.
4. Override path는 app standard data model의 canonical path를 사용하며, 저장 기준은 editable tag가 아니라 immutable `internalId`이다.
5. Open/closed state도 별도 `equipmentStates` dict가 아니라 override item으로 표현한다.
6. Override item은 base value, override value, override reason을 calculation snapshot과 report audit trail에 남겨야 한다.

Scenario 계산 시에는 다음 순서를 따른다.

```text
Base Project Data
  -> Scenario Override Layer
  -> Scenario-resolved Calculation Snapshot
  -> Validation
  -> Calculation
  -> Result / Report
```

Report와 audit trail은 base value, override value, override reason을 표시해야 한다.

---

## 6.8 Schema Versioning and Backward Compatibility

모든 project file, Golden Case file, calculation result snapshot은 `schemaVersion`을 포함해야 한다.

예:

```json
{
  "schemaVersion": "1.0.0",
  "appVersion": "0.1.0",
  "calculationEngineVersion": "0.1.0"
}
```

정책:

1. Patch-level schema change는 backward compatible이어야 한다.
2. Minor-level schema change는 migration function을 제공해야 한다.
3. Major-level schema change는 migration 가능 여부를 명시해야 한다.
4. Golden Case도 schemaVersion을 포함해야 한다.
5. schemaVersion이 없는 legacy project는 import 시 warning을 표시하고 migration snapshot을 생성한다.
6. MVP에서는 `schemaVersion`, `appVersion`, `calculationEngineVersion`, `adapterVersion`을 동일 release tag와 함께 관리한다. 단, snapshot에는 네 version field를 모두 별도로 기록하여 향후 독립 versioning이 가능하도록 한다.

---

## 6.9 Unit System Policy

MVP는 IEC 기준으로 고정하므로 기본 unit system은 SI로 한다.

MVP base units:

| Quantity | Base Unit |
|---|---|
| Voltage | V / kV |
| Current | A / kA |
| Power | kW / kvar / kVA / MVA |
| Cable size | mm² |
| Length | m / km |
| Impedance | ohm, ohm/km, percent impedance |
| Temperature | °C |
| Soil resistivity | K·m/W 또는 °C·m/W, project standard에 따라 표시 |

MVP storage policy:

1. 내부 계산은 normalized SI base unit을 사용한다.
2. UI는 MVP에서 SI display만 지원한다.
3. Core data model examples in §8 may use explicit base-unit scalar fields such as `vnKv`, `lengthM`, `ratedCurrentA`, `ikssKA` for simplicity.
4. Unit-aware object form may be used at API boundary, import/export boundary, and report data model where traceability requires original user-entered unit.
5. NEC/IEEE 확장을 위해 unit metadata field는 유지할 수 있으나, AWG/kcmil/ft 변환은 MVP에서 제외한다.
6. v1.0 implementation shall not mix different unit systems inside one project.

Scalar base-unit example:

```json
{
  "lengthM": 80,
  "vnKv": 0.4
}
```

Unit-aware boundary example:

```json
{
  "length": {
    "value": 80,
    "unit": "m",
    "normalizedValue": 80,
    "normalizedUnit": "m"
  }
}
```

---

## 6.10 Equipment ID and Tag Policy

Equipment는 내부 ID와 사용자 표시 tag를 분리한다.

| Field | Purpose | Example |
|---|---|---|
| internalId | 앱 내부 고유 식별자, 변경 금지 | `eq_01HX...` |
| tag | 사용자가 보는 equipment tag | `TR-001`, `MCC-101`, `M-101A` |
| tagSystem | tag 체계 | `manual`, `auto`, `KKS`, `plant_tag` |

정책:

1. internalId는 앱이 자동 생성하며 project 내에서 unique해야 한다.
2. tag는 사용자가 수정할 수 있다.
3. MVP는 자동 tag suggestion을 제공한다. 예: BUS-001, TR-001, CBL-001.
4. 사용자는 KKS 또는 plant tag를 직접 입력할 수 있다.
5. Duplicate internalId는 error이다.
6. Duplicate tag는 project setting에 따라 warning 또는 error로 처리한다.
7. Calculation result와 report는 tag를 우선 표시하되, traceability를 위해 internalId도 보존한다.
8. PRD에서 기존에 `Bus ID`, `Transformer ID`, `Cable ID`로 표현된 항목은 v1.0에서 사용자 표시 `tag`를 의미한다. 내부 식별자는 항상 `internalId`로 표기한다.

---

## 6.11 Collaboration Scope

MVP는 single-user, file-based workflow를 기준으로 한다.

정책:

- JSON project file 기반 저장
- 동시 편집, file locking, merge conflict resolution은 MVP 제외
- 여러 사용자가 같은 project를 수정하는 collaborative editing은 Post-MVP
- MVP에서는 file open/save metadata로 `lastSavedAt`, `lastSavedByText`, `schemaVersion`을 저장할 수 있다.
- `lastSavedByText`는 in-app login이 없을 경우 사용자가 입력한 free-text 또는 local app profile name으로 둔다.

---

## 7. Functional Requirements

## 7.1 Project Management

### FR-PM-001 Project 생성

사용자는 새로운 power system study project를 생성할 수 있어야 한다.

입력 항목:

- Project name
- Client / Plant / Area
- Standard basis: IEC / NEC / User Defined
- Frequency: 50 Hz / 60 Hz
- Default voltage levels
- Default ambient temperature
- Default installation condition

### FR-PM-002 Project 저장 및 불러오기

사용자는 project file을 저장하고 다시 열 수 있어야 한다.

저장 format:

- MVP: JSON file
- Future: Database-backed project storage

### FR-PM-003 Scenario 관리

사용자는 하나의 project 내에서 여러 operating scenario를 관리할 수 있어야 한다.

Scenario 예:

- Normal operation
- Emergency operation
- One transformer out
- Tie breaker closed
- Maximum load
- Minimum short-circuit condition

---

## 7.2 One-Line Diagram

### FR-OLD-001 Equipment 배치

사용자는 one-line diagram canvas에서 다음 equipment를 배치할 수 있어야 한다.

- Utility / Grid Source
- Generator
- Bus
- Transformer
- Cable / Line
- Breaker
- Switch
- Load
- Motor
- MCC / Switchgear placeholder

### FR-OLD-002 Connectivity 관리

각 equipment는 node-edge graph 구조로 연결되어야 한다.

- Bus는 node로 표현한다.
- Cable, transformer, breaker는 branch로 표현한다.
- Load와 motor는 bus에 접속되는 element로 표현한다.

### FR-OLD-003 Open/Closed Status

Switch 또는 breaker는 open/closed status를 가져야 한다.

Open 상태의 branch는 load flow 및 short circuit network에서 제외되어야 한다.

### FR-OLD-004 Diagram Validation

계산 실행 전 one-line diagram은 다음 사항을 검증해야 한다.

- Floating bus 존재 여부
- Source 미연결 여부
- Loop/tie 상태 확인
- Voltage level mismatch
- Transformer primary/secondary voltage mismatch
- Load가 bus에 연결되어 있는지 여부
- Duplicate internalId 또는 duplicate tag 여부

---

## 7.2A Equipment Template Library Policy

MVP에서는 full user-defined equipment library를 구현하지 않는다.

대신 기본 계산과 입력 편의를 위한 minimal equipment template library를 제공한다. 사용자는 template으로 equipment를 생성한 뒤 project-local equipment data를 자유롭게 수정·저장할 수 있어야 한다.

MVP 포함 범위:

- Minimal transformer template
- Minimal cable template
- Minimal breaker/fuse/relay input template
- Minimal motor template
- Minimal load template
- Project-local equipment data editing
- Project file 내 equipment data 저장
- Source/status tracking
- Calculation audit trail inclusion

MVP 제외 범위:

- Full global user-defined equipment library
- Manufacturer catalog import
- Relay/TCC curve library
- Versioned library management
- Company standard library management
- Library sharing between projects

Template library는 계산 편의를 위한 starting point일 뿐이며, 계산의 source of truth는 항상 project-local equipment data이다.

### FR-OLD-005 Composite Equipment Policy

MCC, switchgear, distribution board는 MVP에서 composite 내부 구조를 가진 active calculation element가 아니라, one-line diagram의 visual/container placeholder로 취급한다.

정책:

- 실제 계산 node는 Bus이다.
- MCC/Switchgear placeholder는 하나 이상의 Bus를 시각적으로 묶는 container 역할을 한다.
- 내부 busbar, incomer, bus coupler, feeder breaker 상세 모델은 Post-MVP 확장으로 둔다.
- MVP에서 MCC/Switchgear를 생성하면 기본 Bus가 함께 생성될 수 있으나, calculation의 source of truth는 Bus/Breaker/Cable/Load/Motor element이다.

## 7.3 Equipment Data Input

Common equipment input policy:

- 각 equipment의 `internalId`는 앱이 자동 생성하며 사용자가 직접 입력하지 않는다.
- 이하 FR-EQ-XXX의 `tag` 항목은 사용자가 보는 표시 tag를 의미한다.
- 과거 문서에서 `Bus ID`, `Transformer ID`, `Cable ID`, `Protective device ID` 등으로 표현된 항목은 v1.0에서 모두 사용자 표시 `tag`로 해석한다.

### FR-EQ-001 Bus Data

Bus 입력 항목:

- Bus tag (사용자 표시)
- Bus name
- Nominal voltage
- Voltage type: AC / DC
- Phase: 3P / 1P future
- Minimum voltage limit
- Maximum voltage limit
- Grounding method

### FR-EQ-002 Utility Source Data

Utility 입력 항목:

- Nominal voltage
- Short circuit level MVA or fault current kA
- X/R ratio
- Operating voltage factor
- Frequency

### FR-EQ-002A Generator Data

Generator는 MVP data model에 포함하되, release gate 계산 범위는 제한한다.

Generator 입력 항목:

- Generator tag
- Connected bus
- Rated power kVA/MVA or MW
- Rated voltage
- Operating mode: out_of_service / grid_parallel_pq / pv_voltage_control / island_isochronous
- Active power dispatch MW
- Reactive power dispatch Mvar or power factor
- Voltage setpoint, for future PV mode
- Subtransient reactance Xd'', optional/future
- In-service status

MVP calculation policy:

- `out_of_service` and `grid_parallel_pq` are allowed for initial integrated calculations.
- `pv_voltage_control`, `island_isochronous`, and detailed short-circuit contribution require explicit solver support and verified Golden Case before release-gate use.

### FR-EQ-003 Transformer Data

Transformer 입력 항목:

- Transformer tag (사용자 표시)
- Rated power kVA/MVA
- HV voltage
- LV voltage
- Impedance %Z
- Resistance component %R or X/R
- Vector group
- Tap position
- Cooling type
- Loading limit

### FR-EQ-004 Cable Data

Cable 입력 항목:

- Cable tag (사용자 표시)
- From bus
- To bus
- Voltage grade
- Core configuration
- Conductor material
- Insulation type
- Armour type
- Conductor size
- Armour CSA
- Length
- R ohm/km
- X ohm/km
- Ampacity
- Installation method
- Ambient temperature
- Soil resistivity for buried cable
- Grouping condition

### FR-EQ-005 Load Data

Load 입력 항목:

- Load tag (사용자 표시)
- Connected bus
- Load type
- kW
- kvar or PF
- Demand factor
- Load status: in service / out of service

### FR-EQ-006 Motor Data

Motor 입력 항목:

- Motor tag (사용자 표시)
- Connected bus
- Rated kW or HP
- Rated voltage
- Efficiency
- Power factor
- Full load current
- FLA source: user input / calculated
- Starting current ratio
- Starting method: DOL / Star-Delta / VFD / Soft Starter
- Service factor

### FR-EQ-006A Switch Data

Switch 입력 항목:

- Switch tag
- From bus
- To bus
- State: open / closed
- Rated voltage, optional
- Rated current, optional
- Normal state, optional

Switch policy:

- Open switch는 Load Flow 및 Short Circuit network에서 해당 branch를 제외한다.
- Switch state는 base data 또는 scenario override로 관리할 수 있다.
- MVP에서는 switch 자체의 thermal/duty check는 제외한다.

### FR-EQ-007 Breaker / Fuse / Relay Data

MVP에서는 detailed Protection Coordination 및 TCC Viewer를 구현하지 않지만, Breaker/Fuse/Relay의 기본 데이터모델은 포함한다.

Breaker/Fuse/Relay 입력 항목:

Note: MVP의 Breaker/Fuse/Relay input template은 정격, clearing time, state, upstream/downstream relation을 입력하기 위한 schema이다. Relay/TCC curve library는 시간-전류 곡선 데이터베이스를 의미하며 MVP에서 제외한다.


- Protective device tag (사용자 표시)
- Device type: Breaker / Fuse / Relay
- Rated voltage
- Rated current
- Breaking capacity kA
- Making capacity kA
- Trip unit type
- Trip time or clearing time
- Connected upstream/downstream equipment
- Upstream/downstream relation

MVP 사용 목적:

- Short Circuit 결과와 breaker breaking capacity 비교
- Equipment Duty Check
- Cable Sizing short-circuit withstand 검토에 필요한 clearing time 제공

Post-MVP 확장 목적:

- TCC Viewer
- Fault Current Marker
- Load/Motor/Transformer Marker
- Basic Coordination Warning
- Formal Coordination Check

---

## 7.4 Load Flow Module

### FR-LF-001 Load Flow 실행

사용자는 selected scenario에 대해 load flow를 실행할 수 있어야 한다.

MVP calculation assumption:

- Balanced 3-phase AC system
- Steady-state power flow
- Constant P/Q load model
- Transformer impedance included
- Cable R/X included
- 1-phase system is excluded from Power System Study Load Flow calculation in MVP

### FR-LF-002 Load Flow 결과

결과는 다음 항목을 포함해야 한다.

Bus result:

- Voltage kV/V
- Voltage %
- Voltage angle
- Undervoltage/overvoltage status

Branch result:

- Current A
- kW flow
- kvar flow
- kVA flow
- Power factor
- Loss kW/kvar
- Loading %

Equipment result:

- Transformer loading %
- Cable loading %
- Source loading

### FR-LF-003 Load Flow Warning

다음 조건에서 warning 또는 error를 표시해야 한다.

- Bus voltage below minimum limit
- Bus voltage above maximum limit
- Cable loading over 100%
- Transformer loading over 100%
- Load flow non-convergence
- Islanded bus
- Source missing

---

## 7.5 Voltage Drop Module

### FR-VD-001 Voltage Drop 계산

Cable 및 branch별 voltage drop을 계산해야 한다.

Voltage drop 결과:

- Absolute voltage drop V
- Percentage voltage drop %
- Sending-end voltage
- Receiving-end voltage
- Status against allowable limit

### FR-VD-002 Motor Starting Voltage Drop

MVP에서는 simplified motor starting voltage drop을 제공한다.

Simplification definition:

- Dynamic acceleration model은 제외한다.
- Motor starting은 t = 0 locked-rotor snapshot으로 취급한다.
- Upstream network는 Thevenin equivalent impedance로 단순화한다.
- Starting current ratio와 starting power factor를 사용한다.
- Motor torque-speed curve, load torque curve, acceleration time, voltage recovery curve는 MVP에서 계산하지 않는다.

입력:

- Motor starting current ratio
- Starting PF
- Upstream Thevenin impedance or equivalent branch impedance
- Motor rated current or design current

출력:

- Starting voltage at motor terminal
- Starting voltage drop %
- Pass/fail against minimum starting voltage criterion

Golden Case는 locked-rotor steady-state snapshot 기준으로 작성한다.

---

## 7.6 Short Circuit Module

### FR-SC-001 3상 단락전류 계산

MVP에서는 IEC 60909 simplified 3-phase bolted fault를 계산한다.

1-phase fault, L-G, L-L, L-L-G fault calculation은 MVP 범위에서 제외한다.

계산 위치:

- Selected bus
- All buses batch mode

### FR-SC-002 Short Circuit 결과

결과는 다음 항목을 포함한다.

- Initial symmetrical short-circuit current Ik"
- Peak short-circuit current Ip
- Breaking current Ib, simplified
- Equivalent source impedance
- X/R ratio
- Fault contribution by source/transformer. Generator short-circuit contribution is activated only after verified Golden Case is available according to OQ-12.

MVP simplified breaking current policy:

- MVP는 IEC 60909 simplified 3-phase bolted fault를 대상으로 한다.
- Near-to-generator detailed correction은 MVP에서 제외한다 unless explicitly supported by solver and validated Golden Case.
- `Ib`는 pinned pandapower version and selected IEC 60909 options에서 제공되는 경우 adapter를 통해 app result model로 mapping한다.
- 사용 중인 pandapower version, short-circuit options, adapter version은 calculation snapshot에 기록한다.
- `Ib`가 solver result에서 제공되지 않거나 검증되지 않은 경우, 앱은 conservative fallback으로 `Ik"`를 breaker duty check 기준으로 사용하고 warning code를 표시한다.
- 앱 자체 판정에서는 breaker duty check의 1차 기준을 calculated short-circuit current와 breaker breaking capacity 비교로 둔다.
- `Ib` 정의, µ factor, generator proximity correction 등 상세 IEC 60909 옵션은 solverGapRegister에 등록하고 Golden Case 확보 후 확장한다.

### FR-SC-003 Min/Max Fault Case

MVP에서는 다음 두 case를 지원한다.

- Maximum short-circuit case
- Minimum short-circuit case

Parameter examples:

- Utility maximum/minimum fault level
- Transformer impedance tolerance
- Motor contribution mode: `excluded` / `included_simplified` according to OQ-13
- Voltage factor cmax/cmin

Min/Max case policy:

- Maximum short-circuit case and minimum short-circuit case may be modeled as separate scenarios or as scenario sub-cases.
- If modeled as sub-cases under the same scenario, calculation result retention shall use `{scenarioId, module, subCase}` as the key.

### FR-SC-004 Breaker Duty Check

Breaker의 breaking capacity는 계산된 fault current와 비교되어야 한다.

Status:

- Pass: calculated fault current <= breaker capacity
- Warning: margin below configured threshold
- Fail: calculated fault current > breaker capacity
- Invalid: breaker capacity missing

---

## 7.7 Cable Sizing Module

### FR-CS-000 Cable Sizing Input Contract and Design Current Policy

Cable Sizing engine은 standalone mode와 integrated mode에서 동일한 canonical input schema를 사용해야 한다.

Input source는 달라질 수 있으나, engine에 전달되는 최종 contract는 동일해야 한다.

Canonical input example:

```json
{
  "mode": "integrated",
  "feederType": "motor",
  "voltage": { "value": 400, "unit": "V" },
  "designCurrentA": {
    "value": 145.2,
    "source": "calculated_from_motor_fla",
    "status": "valid"
  },
  "operatingCurrentA": {
    "value": 132.4,
    "source": "load_flow_branch_current",
    "status": "valid"
  },
  "shortCircuitCurrentKA": {
    "value": 36.4,
    "source": "short_circuit_result",
    "status": "valid"
  },
  "tripTimeS": {
    "value": 0.1,
    "source": "protective_device_clearing_time",
    "status": "valid"
  }
}
```

Design current policy:

1. `designCurrentA` is the sizing basis current.
2. `operatingCurrentA` from Load Flow is an operating result, not automatically the sizing basis.
3. Integrated mode shall not blindly replace design current with load-flow branch current.
4. For motor feeders, design current is based on motor FLA source policy, service/demand factor, and project sizing rule.
5. For non-motor loads, design current is based on connected load, demand factor, diversity factor, and project sizing rule.
6. Load Flow branch current may be used as a cross-check and warning source.
7. If `operatingCurrentA > designCurrentA`, the app shall raise a warning or error depending on project policy.
8. Cable Sizing result shall report both design current and operating current when integrated mode is used.

Required output distinction:

| Current | Meaning | Primary Use |
|---|---|---|
| designCurrentA | Cable sizing basis current | Ampacity, cable size recommendation |
| operatingCurrentA | Load Flow branch current | Operating loading check, consistency warning |
| startingCurrentA | Motor starting current | Starting voltage drop check |
| shortCircuitCurrentKA | Fault current at relevant location | Thermal withstand check |

Allowed `feederType` values for MVP:

- motor
- static_load
- distribution_feeder
- mixed_load
- spare




### FR-CS-001 Cable Sizing App 연계

Power System Study App은 기존 LV Cable Sizing App의 계산엔진을 같은 monorepo 내 별도 package로 분리하여 재사용한다.

Cable Sizing UI는 독립 화면으로 유지할 수 있으나, Power System Study App의 cable branch에서도 동일한 cable sizing engine을 호출해야 한다. Cable Sizing logic은 Load Flow, Short Circuit, Equipment Data와 동일한 app standard data model을 공유해야 한다.

재사용 대상:

- Cable Sizing calculation engine
- Validation rule
- Warning/error code
- Golden Case
- Cable sizing report data structure

연계 항목:

- Load current
- Motor FLA
- Demand factor
- Cable length
- Voltage level
- Installation method
- Ambient temperature
- Soil resistivity
- Loaded conductors
- Armour CSA
- Short circuit current
- Trip time

### FR-CS-002 Cable Size 선정 기준

Cable size는 다음 기준을 모두 만족해야 한다.

1. Current carrying capacity
2. Voltage drop
3. Short-circuit thermal withstand
4. Installation correction factor
5. Armour/PE conductor requirement, if applicable
6. Motor starting voltage drop, if motor feeder

### FR-CS-003 Existing Cable Verification

사용자는 이미 선정된 cable size를 입력하고 adequacy를 검토할 수 있어야 한다.

결과:

- Ampacity check
- Voltage drop check
- Short-circuit check
- Armour check
- Overall status

### FR-CS-004 Recommended Cable Size

사용자가 auto sizing mode를 선택하면 앱은 가장 작은 acceptable cable size를 추천해야 한다.

단, 다음 경우에는 추천을 중단하고 invalid 처리한다.

- Design current invalid
- Cable library missing
- Installation method missing where required
- Soil resistivity missing for buried installation
- Short circuit current or trip time invalid

---

## 7.7A Protection Coordination Roadmap

Protection Coordination은 MVP에서 제외하고 Post-MVP 기능으로 분리한다.

구현 순서:

1. TCC Viewer
2. Fault Current Marker
3. Load / Motor / Transformer Marker
4. Basic Coordination Warning
5. Formal Coordination Check

MVP에서는 protective device의 기본 정격 및 clearing time만 사용한다.

## 7.8 Warning / Error Code System

### FR-WE-001 Code 기반 메시지

모든 warning/error는 code를 가져야 한다.

예:

| Code | Type | Meaning |
|---|---|---|
| E-NET-001 | Error | Source is missing |
| E-NET-002 | Error | Bus is islanded |
| E-VAL-001 | Error | Required field is missing |
| E-VAL-002 | Error | Value must be positive |
| E-VAL-003 | Error | Soil resistivity is required for buried installation |
| E-SC-001 | Error | Short-circuit current is invalid |
| E-SC-002 | Error | Trip time is invalid |
| W-CF-001 | Warning | Default correction factor was used |
| W-LF-001 | Warning | Bus voltage is below warning threshold |
| W-EQ-001 | Warning | Equipment loading exceeds warning threshold |

### FR-WE-002 Stale Result Handling

입력값 변경 후 기존 결과는 stale 상태가 되어야 한다.

Stale 상태에서는 다음을 표시한다.

- Result is outdated
- Recalculate required
- Previous result timestamp

---

## 7.9 Report Module

### FR-RPT-001 Calculation Report 출력

사용자는 계산 결과를 report로 출력할 수 있어야 한다.

Report 종류:

- Load Flow Report
- Voltage Drop Report
- Short Circuit Report
- Cable Sizing Report
- Equipment Duty Report
- Warning/Error Summary

### FR-RPT-002 Report 내용

각 report는 다음 정보를 포함해야 한다.

- Project name
- Scenario name
- Calculation date/time
- Calculation standard/method
- Input summary
- Result table
- Pass/warning/fail status
- Error/warning code
- Revision history placeholder

### FR-RPT-003 Export Format

MVP export format:

- Excel .xlsx

Post-MVP export format:

- PDF report

Report generation 원칙:

1. Calculation result에서 Excel/PDF를 직접 생성하지 않는다.
2. Calculation result는 먼저 Excel/PDF 공통 사용이 가능한 report data model로 변환한다.
3. MVP에서는 report data model을 Excel renderer로 출력한다.
4. PDF renderer는 Excel report 구조, calculation snapshot, warning/error summary가 안정화된 이후 구현한다.

---

## 8. Data Model

## 8.1 Project Model

```json
{
  "projectId": "PJT-001",
  "projectName": "HyREX Power Study",
  "standard": "IEC",
  "frequencyHz": 60,
  "baseCurrency": null,
  "createdAt": "2026-05-01T00:00:00+09:00",
  "updatedAt": "2026-05-01T00:00:00+09:00"
}
```

## 8.1A Phase / Topology Policy

MVP의 Power System Study 계산 범위는 3상 평형계통으로 제한한다.

Allowed for Power System Study MVP:

- 3P3W
- 3P4W, treated as balanced 3-phase where applicable

Excluded from Power System Study MVP calculation:

- 1P2W
- 1P3W
- DC2W
- DC3W
- Unbalanced phase-domain calculation

단, data model에는 phase/topology field를 유지하여 향후 1P2W, 1P3W, DC system 확장이 가능하도록 한다. 기존 LV Cable Sizing App의 1P2W/3P3W Golden Case와 standalone cable sizing capability는 유지한다.

Example topology fields:

```json
{
  "phaseSystem": "3P",
  "wireSystem": "3W",
  "topology": "3P3W"
}
```

## 8.1B Arc Flash Extension Policy

Arc Flash는 long-term roadmap에 포함한다. 단, MVP에서는 다음 기능을 구현하지 않는다.

- Arc Flash calculation
- Incident energy result
- Arc flash boundary
- PPE category
- Arc flash label generation

Arc Flash는 다음 구조가 안정화된 이후 advanced Post-MVP module로 구현한다.

- Short Circuit result
- Protective device clearing time
- TCC Viewer
- Report framework

MVP에서는 향후 확장을 위해 optional arcFlash data fields만 data model에 준비한다.

Example optional field:

```json
{
  "arcFlash": {
    "enabled": false,
    "equipmentType": null,
    "workingDistanceMm": null,
    "enclosureType": null,
    "electrodeConfiguration": null,
    "conductorGapMm": null,
    "arcDurationSource": null,
    "notes": null
  }
}
```

## 8.2 Scenario Model

Scenario는 base data를 복제하지 않고 override layer로 저장한다.

```json
{
  "schemaVersion": "1.0.0",
  "scenarioId": "SCN-NORMAL",
  "name": "Normal Operation",
  "description": "Normal operating condition",
  "inheritsFrom": null,
  "overrides": [
    {
      "path": "breakers.eq_brk_001.state",
      "value": "closed",
      "reason": "normal operation"
    },
    {
      "path": "switches.eq_sw_001.state",
      "value": "open",
      "reason": "normal tie open"
    }
  ]
}
```

`equipmentStates` dict는 v1.0 schema에서 사용하지 않는다. Open/closed state는 override item으로 표현한다.

## 8.3 Bus Model

```json
{
  "internalId": "eq_bus_001",
  "tag": "BUS-001",
  "name": "LV MCC Bus",
  "vnKv": 0.4,
  "minVoltagePct": 95,
  "maxVoltagePct": 105,
  "grounding": "TN-S"
}
```

## 8.4 Transformer Model

```json
{
  "internalId": "eq_tr_001",
  "tag": "TR-001",
  "fromBus": "BUS-HV",
  "toBus": "BUS-LV",
  "snMva": 2.0,
  "vnHvKv": 6.6,
  "vnLvKv": 0.4,
  "vkPercent": 6.0,
  "vkrPercent": 1.0,
  "vectorGroup": "Dyn11"
}
```

## 8.5 Cable Model

```json
{
  "internalId": "eq_cbl_001",
  "tag": "CBL-001",
  "fromBus": "BUS-001",
  "toBus": "BUS-002",
  "lengthM": 80,
  "conductorMaterial": "Cu",
  "conductorSizeMm2": 240,
  "rOhmPerKm": 0.0754,
  "xOhmPerKm": 0.08,
  "ampacityA": 430,
  "installationMethod": "tray",
  "loadedConductors": 3,
  "armourCsaMm2": 50
}
```

## 8.6 Motor Model

```json
{
  "internalId": "eq_motor_001",
  "tag": "M-001",
  "bus": "BUS-002",
  "ratedKw": 250,
  "ratedVoltageV": 400,
  "efficiency": 0.95,
  "powerFactor": 0.88,
  "flaA": null,
  "flaSource": "calculated",
  "startingCurrentRatio": 6.0,
  "startingMethod": "DOL"
}
```

## 8.7 Generator Model

```json
{
  "internalId": "eq_gen_001",
  "tag": "GEN-001",
  "bus": "BUS-001",
  "ratedMva": 2.0,
  "ratedVoltageKv": 0.4,
  "operatingMode": "grid_parallel_pq",
  "pMw": 1.2,
  "qMvar": 0.2,
  "voltageSetpointPu": null,
  "xdSubtransientPu": null,
  "inService": true
}
```

## 8.8 Switch Model

```json
{
  "internalId": "eq_sw_001",
  "tag": "SW-001",
  "fromBus": "BUS-001",
  "toBus": "BUS-002",
  "state": "closed",
  "ratedVoltageKv": 0.4,
  "ratedCurrentA": null
}
```

## 8.9 Calculation Snapshot Model

Calculation snapshot is the immutable input artifact used for calculation, audit, report generation, and Golden Case comparison.

It contains scenario-resolved data rather than raw base data plus unresolved overrides.

```json
{
  "snapshotId": "CALC-SNAP-001",
  "schemaVersion": "1.0.0",
  "projectId": "PJT-001",
  "scenarioId": "SCN-NORMAL",
  "createdAt": "2026-05-01T00:00:00+09:00",
  "appVersion": "0.1.0",
  "calculationEngineVersion": "0.1.0",
  "adapterVersion": "0.1.0",
  "solver": {
    "name": "pandapower",
    "version": "pinned-version",
    "options": {
      "loadFlowAlgorithm": "nr",
      "shortCircuitStandard": "iec60909"
    }
  },
  "resolvedInputs": {
    "buses": [],
    "transformers": [],
    "cables": [],
    "loads": [],
    "motors": [],
    "generators": [],
    "protectiveDevices": [],
    "switches": []
  },
  "appliedOverrides": [
    {
      "path": "transformers.eq_tr_001.vkPercent",
      "baseValue": 6.0,
      "overrideValue": 6.6,
      "reason": "+10% transformer impedance tolerance",
      "sourceScenarioId": "SCN-MIN-SC"
    }
  ],
  "validationResult": {
    "status": "valid",
    "warningCodes": [],
    "errorCodes": []
  }
}
```

Snapshot policy:

- Calculation result must reference the snapshotId.
- Report must be generated from calculation result plus referenced snapshot.
- Golden Case expected results must identify the schemaVersion and snapshot format used.
- `appliedOverrides` must preserve at least `path`, `baseValue`, `overrideValue`, and `reason` so that reports can show what changed from base project data.

---

## 9. Calculation Engine Requirements

## 9.1 Architecture

추천 구조:

```text
Frontend React/TypeScript
  -> Backend API
  -> App Standard Data Model
  -> Validation / Fail-Closed Layer
  -> Calculation Adapter Layer
  -> pandapower Solver for Load Flow and Short Circuit
  -> Result Normalization Layer
  -> Warning/Error/Pass-Fail Layer
  -> Result Store
  -> Report Generator
```

Backend 후보:

- Python FastAPI
- TypeScript Node backend

Calculation engine 결정사항:

- Initial Load Flow solver: pandapower adapter
- Initial Short Circuit solver: pandapower adapter
- Cable Sizing logic: 자체 구현 또는 기존 LV Cable Sizing App engine 재사용
- Validation / fail-closed / warning-error / Golden Case / report logic: 자체 구현

pandapower는 내부 solver로만 사용하며, 앱의 표준 데이터모델은 pandapower 구조에 종속되지 않아야 한다.

## 9.2 Calculation Adapter Layer

UI data model, app standard data model, external/internal solver model은 분리한다.

필요한 adapter:

- Project data → App standard network model
- App standard network model → pandapower network model
- App standard network model → Load flow input
- App standard network model → Short circuit input
- Cable branch → Cable sizing input
- pandapower calculation result → App result model
- App result model → UI result table / diagram overlay / report model

Adapter layer 원칙:

1. 앱의 원본 데이터는 app standard data model이다.
2. pandapower network는 계산 실행을 위한 파생 모델이다.
3. pandapower element ID와 app equipment ID는 mapping table로 연결한다.
4. pandapower result를 그대로 UI에 표시하지 않고, result normalization layer를 거쳐 표시한다.
5. pandapower가 계산하지 않는 engineering judgment, pass/fail, warning/error, cable sizing 판정은 app layer에서 수행한다.

## 9.3 Deterministic Result

동일한 입력값과 동일한 calculation version에 대해 항상 동일한 결과가 나와야 한다.

각 결과에는 calculationEngineVersion을 포함한다.

---

## 10. UI / UX Requirements

## 10.1 Main Layout

추천 layout:

```text
Left Panel: Equipment palette / Project tree
Center: One-line diagram canvas
Right Panel: Selected equipment data form
Bottom Panel: Result / Warning / Error / Calculation log
```

## 10.2 Calculation Status Indicator

사용자는 현재 project 상태를 명확히 볼 수 있어야 한다.

Status 예:

- Ready to calculate
- Input warning exists
- Input error exists
- Calculation completed
- Result stale
- Calculation failed

## 10.3 Result Overlay

One-line diagram 위에 주요 결과를 표시할 수 있어야 한다.

예:

- Bus voltage %
- Cable current A
- Cable loading %
- Transformer loading %
- Fault current kA
- Warning/fail icon

## 10.4 Result Table

모든 계산 결과는 table로도 제공되어야 한다.

필수 기능:

- Sort
- Filter by status
- Export selected result
- Click result row → diagram element highlight

---

## 11. Non-Functional Requirements

## 11.0 Calculation Execution Policy

계산 실행은 사용자가 상태를 이해하고 중단할 수 있도록 관리되어야 한다.

MVP 정책:

- 계산 시작 시 calculation job id를 생성한다.
- UI는 calculation status를 표시한다: queued, running, completed, failed, cancelled, timeout.
- 200 bus 이하 case는 synchronous execution을 허용한다.
- 장시간 계산 case는 cancellable job 구조로 확장 가능해야 한다.
- Load Flow non-convergence는 valid result로 표시하지 않고 calculation failed 또는 invalid result로 처리한다.
- Solver timeout 발생 시 이전 결과를 재사용하지 않는다.
- Timeout threshold는 project/app setting으로 관리하되 MVP default를 둔다.

Default timeout proposal:

| Calculation | Default Timeout |
|---|---:|
| Load Flow | 10 s |
| Short Circuit batch | 20 s |
| Cable Sizing batch | 20 s |
| Report generation | 30 s |



## 11.1 Performance

MVP 기준 성능 목표:

| Network Size | Target Calculation Time |
|---|---:|
| 50 buses | < 1 sec |
| 200 buses | < 3 sec |
| 500 buses | < 10 sec |

## 11.2 Reliability

- Invalid input must not produce valid-looking result.
- Previous result must be cleared or marked stale after input changes.
- Report must match on-screen result.

## 11.3 Maintainability

- Calculation module은 UI와 분리한다.
- Validation rule은 code 기반으로 관리한다.
- Golden Case는 CI에서 자동 실행한다.

## 11.4 Traceability

모든 calculation result는 다음을 추적해야 한다.

- Input snapshot / calculation snapshot
- Scenario
- Applied overrides
- Calculation method
- Solver name and solver version
- Adapter version
- Calculation engine version
- Warning/error codes
- Timestamp

Audit retention policy for MVP:

- Project file shall keep the latest current calculation result per `{scenarioId, module, subCase}` key. For modules without sub-cases, `subCase` is null.
- Maximum short-circuit and minimum short-circuit results may be represented as separate scenarios or as `subCase` values under the same scenario.
- Project file should keep at least the latest successful calculation snapshot and latest failed validation snapshot for each retention key.
- Full unlimited calculation history is excluded from MVP to avoid uncontrolled JSON file growth.
- Exported report shall contain its own calculation snapshot reference or embedded input snapshot summary.
- Post-MVP may add configurable audit history retention, such as last N calculations or external audit database.

---

## 12. Golden Case Strategy

## 12.1 목적

Golden Case는 계산엔진 변경 시 기존 대표 case 결과가 의도치 않게 변경되지 않도록 보호한다.

## 12.2 Golden Case 종류

| Case Group | Description |
|---|---|
| GC-LF | Load Flow golden cases |
| GC-VD | Voltage Drop golden cases |
| GC-SC | Short Circuit golden cases |
| GC-CS | Cable Sizing golden cases |
| GC-EQ | Equipment Duty golden cases |
| GC-INVALID | Invalid input / fail-closed cases |

## 12.2A Golden Case Reference Policy

Golden Case 기준값은 다음 source를 우선 사용한다.

Reference priority:

1. Hand calculation
2. IEC example
3. Public engineering reference
4. Existing verified calculation sheet
5. Independent commercial tool result
6. pandapower result, for provisional regression/cross-check only
7. Previous version result, for regression-only case

pandapower 결과는 solver regression 및 cross-check에는 사용할 수 있으나, Golden Case의 유일한 verified 기준값으로 사용하지 않는다. 독립 기준값 확보가 어려운 복잡 network case에서는 pandapower 결과를 provisional reference로 사용할 수 있으며, 이 경우 `referenceStatus: provisional` 또는 `referenceStatus: regression_only`로 표시한다.

Golden Case metadata는 다음 항목을 포함해야 한다.

```json
{
  "caseId": "GC-SC-01",
  "module": "short-circuit",
  "title": "Utility + Transformer LV Bus 3-phase Fault",
  "standard": "IEC",
  "referenceType": "hand_calculation",
  "referenceStatus": "verified",
  "referenceSource": "internal_hand_calculation_sheet",
  "tolerance": {
    "ikssKA": "±1%",
    "voltagePct": "±0.1 percentage point"
  },
  "expected": {
    "ikssKA": 36.42,
    "status": "pass",
    "warningCodes": [],
    "errorCodes": []
  }
}
```

Recommended `referenceType` values:

- hand_calculation
- iec_example
- engineering_reference
- verified_excel_sheet
- external_tool
- pandapower
- previous_version

Recommended `referenceStatus` values:

- verified
- provisional
- regression_only
- deprecated

Comparison policy:

- Numeric results are compared using tolerance.
- Cable size recommendation is compared by exact match.
- Pass/fail status is compared by exact match.
- Warning/error code is compared by exact match.
- Release gate should require all verified Golden Cases to pass.
- Provisional or regression-only cases may be used for cross-checking, but should not be the sole basis for engineering validation.
- If a regression-only case is based on pandapower or previous-version output, solver version and adapter version must be recorded.
- When pandapower or adapter version changes, regression-only expected values may require intentional re-baselining; this must be recorded in revision history and must not be treated as engineering validation failure by itself.
- Re-baselining of verified Golden Cases requires reviewer approval. Re-baselining of regression-only cases requires developer approval plus changelog entry.

## 12.3 초기 Golden Case 후보

### Load Flow

- GC-LF-01: Utility + Transformer + Single Load
- GC-LF-02: Transformer + MCC + Multiple Loads
- GC-LF-03: Cable voltage drop dominant feeder
- GC-LF-04: Transformer overload warning
- GC-LF-05: Islanded bus invalid

### Short Circuit

- GC-SC-01: Utility fault level to LV bus through transformer
- GC-SC-02: Cable impedance reduces downstream fault current
- GC-SC-03: Breaker capacity pass
- GC-SC-04: Breaker capacity fail
- GC-SC-05: Missing transformer impedance invalid

### Cable Sizing

- Existing LV cable sizing Golden Cases shall be preserved.
- Motor FLA null fallback
- 1P2W case
- 3P3W case
- Loaded conductors invalid override
- Soil missing for buried installation
- Short circuit current zero invalid
- Trip time zero invalid

---

## 13. Acceptance Criteria

## 13.1 MVP Acceptance Criteria

MVP는 다음 조건을 만족해야 한다.

1. 사용자가 one-line diagram에서 source, transformer, bus, cable, load, motor, breaker를 생성할 수 있다.
2. 사용자가 각 equipment의 기본 data를 입력할 수 있다.
3. Load Flow를 실행하고 bus voltage, branch current, loading %를 확인할 수 있다.
4. Voltage Drop 결과를 확인할 수 있다.
5. Selected bus 또는 all buses에 대해 3상 short circuit current를 계산할 수 있다.
6. Breaker breaking capacity와 short circuit current를 비교할 수 있다.
7. Cable sizing result를 기존 cable sizing logic 기준으로 확인할 수 있다.
8. Invalid input은 계산을 중단하고 명확한 error code를 표시한다.
9. 입력값 변경 후 기존 result는 stale 또는 cleared 상태가 된다.
10. Golden Case test가 통과해야 release 가능하다.
11. Calculation report를 Excel로 출력할 수 있다.

---

## 14. Release Plan

## 14.1 Stage 0 — PRD & Architecture

Deliverables:

- PRD v1.0
- Data model definition
- Calculation module boundary
- UI wireframe
- Golden Case list

## 14.2 Stage 1 — One-Line Diagram MVP

Deliverables:

- Project creation
- Equipment palette
- Diagram canvas
- Equipment property panel
- JSON save/load
- Basic validation

## 14.3 Stage 2 — Load Flow / Voltage Drop MVP

Deliverables:

- Network model conversion
- Load flow calculation
- Voltage drop calculation
- Result table
- Diagram overlay
- GC-LF / GC-VD tests

## 14.4 Stage 3 — Short Circuit / Equipment Duty

Deliverables:

- IEC 60909 simplified short circuit
- Breaker duty check
- Cable short circuit withstand check
- GC-SC tests

## 14.5 Stage 4 — Cable Sizing Integration

Deliverables:

- Existing cable sizing engine integration
- Cable adequacy check
- Auto cable size recommendation
- Existing GC-LV tests preserved

## 14.6 Stage 5 — Report & Review Workflow

Deliverables:

- Excel report
- Warning/error summary
- Calculation snapshot
- EPC review comment support data

---

## 15. Open Questions / Final Decision Log

다음 항목은 PRD v1.0 확정 전 formal decision으로 정리된 Open Question 목록이다.

| No. | Question | Proposed Decision |
|---:|---|---|
| OQ-01 | 초기 표준을 IEC로 고정할 것인가? | **결정 완료: 초기 버전은 IEC 기준으로 고정하고, NEC/IEEE는 향후 확장을 위해 구조만 열어둔다.** |
| OQ-02 | Load Flow 엔진을 직접 구현할 것인가, pandapower를 사용할 것인가? | **결정 완료: 초기 Load Flow 및 Short Circuit solver는 pandapower adapter를 사용한다. 단, 앱의 표준 데이터모델, 입력 validation, fail-closed 처리, warning/error code, Cable Sizing logic, Golden Case 판정, report generation은 자체 구현한다. pandapower는 내부 계산 solver로만 사용하며, 앱 데이터모델이 pandapower 구조에 종속되지 않도록 adapter layer를 둔다.** |
| OQ-03 | Cable Sizing App은 같은 repo에서 통합할 것인가? | **결정 완료: Cable Sizing App은 Power System Study App과 같은 monorepo에서 통합 관리한다. 기존 Cable Sizing calculation engine, validation rule, warning/error code, Golden Case는 별도 package로 분리하여 재사용한다. Cable Sizing UI는 독립 화면으로 유지할 수 있으나, Power System Study App의 cable branch에서도 동일 engine을 호출해야 한다. Cable Sizing logic은 Power System Study App의 Load Flow, Short Circuit, Equipment Data와 동일한 standard data model을 공유한다.** |
| OQ-04 | MVP는 LV only인가, MV/LV 통합인가? | **결정 완료: MVP는 LV only로 제한하지 않고, 산업 플랜트에서 일반적인 MV/LV 기본 배전계통을 지원한다. 사용자는 Utility/Grid, MV Bus, Transformer, LV Bus, LV Load, Motor, Cable, Breaker를 하나의 one-line diagram에서 구성할 수 있어야 한다. 다만 MVP의 상세 sizing 및 duty check 범위는 LV 중심으로 제한한다. MV는 주로 upstream source, transformer, voltage level, short-circuit contribution, load flow path를 제공하는 역할로 모델링하며, MV cable sizing, detailed MV protection coordination, dynamic motor starting, grounding study는 Post-MVP로 둔다.** |
| OQ-05 | Report는 Excel first인가 PDF first인가? | **결정 완료: MVP report는 Excel export를 우선 구현한다. Report는 calculation result에서 직접 생성하지 않고, Excel/PDF 공통 사용이 가능한 report data model을 거쳐 생성한다. PDF report는 Excel report 구조와 calculation snapshot, warning/error summary가 안정화된 이후 Post-MVP 기능으로 구현한다.** |
| OQ-06 | 1-phase system은 MVP에 포함할 것인가? | **결정 완료: MVP의 Power System Study 계산 범위는 3상 평형계통으로 제한한다. 1-phase system은 MVP의 Load Flow, Short Circuit, One-Line integrated calculation 범위에서 제외한다. 단, data model에는 phase/topology field를 유지하여 향후 1P2W, 1P3W 확장이 가능하도록 한다. 기존 LV Cable Sizing App의 1P2W/3P3W Golden Case와 standalone cable sizing capability는 유지한다.** |
| OQ-07 | Protection coordination은 TCC viewer만 먼저 넣을 것인가? | **결정 완료: MVP에서는 detailed Protection Coordination 및 TCC Viewer를 구현하지 않는다. 단, Breaker/Fuse/Relay의 기본 데이터모델은 MVP에 포함하여 rated current, breaking capacity, clearing time, trip unit type, upstream/downstream relation을 저장할 수 있어야 한다. MVP에서는 Short Circuit 결과와 breaker breaking capacity를 비교하는 Equipment Duty Check 및 Cable Sizing에 필요한 clearing time만 사용한다. Protection Coordination은 Post-MVP 기능으로 분리하며, 구현 순서는 TCC Viewer → Fault Current Marker → Load/Motor/Transformer Marker → Basic Coordination Warning → Formal Coordination Check 순서로 진행한다.** |
| OQ-08 | Arc Flash를 road map에 둘 것인가? | **결정 완료: Arc Flash는 long-term roadmap에 포함한다. 단, MVP에서는 Arc Flash calculation, incident energy result, arc flash boundary, PPE category, and label generation을 구현하지 않는다. Arc Flash는 Short Circuit, protective device clearing time, TCC Viewer, and report framework가 안정화된 이후 advanced Post-MVP module로 구현한다. MVP에서는 향후 확장을 위해 optional arcFlash data fields만 data model에 준비한다.** |
| OQ-09 | User-defined equipment library를 MVP에 포함할 것인가? | **결정 완료: MVP에서는 full user-defined equipment library를 구현하지 않는다. 대신 기본 계산과 입력 편의를 위한 minimal equipment template library를 제공한다. 사용자는 template으로 equipment를 생성한 뒤 project-local equipment data를 자유롭게 수정·저장할 수 있어야 한다. Global reusable library, manufacturer catalog import, relay/TCC curve library, versioned library management, company standard library 기능은 Post-MVP로 둔다. 모든 project-local equipment data는 source/status tracking과 calculation audit trail에 포함되어야 한다.** |
| OQ-10 | Golden Case 기준값은 수계산, pandapower, 외부 tool 중 무엇을 기준으로 할 것인가? | **결정 완료: Golden Case 기준값은 수계산, IEC 예제, 공개 engineering reference, 기존 검증된 calculation sheet, 또는 독립 상용 tool 결과를 우선 사용한다. pandapower 결과는 solver regression 및 cross-check에는 사용하되, Golden Case의 유일한 verified 기준값으로 사용하지 않는다. 독립 기준값 확보가 어려운 복잡 network case에서는 pandapower 결과를 provisional reference로 사용할 수 있으며, 이 경우 referenceStatus: provisional 또는 regression_only로 표시한다. 모든 Golden Case는 referenceType, referenceStatus, tolerance, expected result, warning/error code를 포함해야 한다. 수치 결과는 tolerance 기반으로 비교하고, pass/fail status와 warning/error code는 exact match로 비교한다.** |
| OQ-11 | Scenario override path format은 어떻게 정의할 것인가? | **결정 완료: Scenario override path는 app standard data model의 canonical path를 사용한다. 저장 기준은 editable tag가 아니라 immutable `internalId`이다. Format은 `<collection>.<internalId>.<fieldPath>`로 한다. 예: `transformers.eq_tr_001.vkPercent`, `motors.eq_motor_005.inService`, `breakers.eq_brk_001.state`. UI에는 tag alias를 표시할 수 있으나, project file과 calculation snapshot에는 internalId 기반 canonical path를 저장한다. 존재하지 않는 collection, internalId, fieldPath, type mismatch, duplicate override path는 fail-closed validation error로 처리한다.** |
| OQ-12 | Generator MVP operating mode는 어디까지 허용할 것인가? | **결정 완료: MVP release-gate 계산에서 Generator는 `out_of_service`와 `grid_parallel_pq`만 지원한다. `grid_parallel_pq`는 fixed P/Q injection으로 Load Flow에만 사용하며 voltage control은 수행하지 않는다. `pv_voltage_control`, `island_isochronous`, generator voltage regulation, detailed generator short-circuit contribution은 verified Golden Case 확보 전까지 Post-MVP 또는 provisional feature로 둔다.** |
| OQ-13 | Motor short-circuit contribution은 MVP에서 어떻게 단순화할 것인가? | **결정 완료: MVP는 motor short-circuit contribution을 `excluded` 또는 `included_simplified` scenario option으로 표현한다. `included_simplified`는 t=0 initial contribution 기준의 fixed equivalent impedance 또는 documented X″ assumption을 사용하며, dynamic decay, motor group aggregation correction, detailed IEC near-motor correction은 제외한다. 적용 여부, 사용한 X″/contribution assumption, source, warning/error code는 calculation snapshot과 report에 반드시 표시한다. 필요한 parameter가 없는데 included mode가 선택되면 fail-closed error로 처리한다.** |
| OQ-14 | Unit storage policy는 scalar base unit인가, unit-aware object인가? | **결정 완료: Core project data와 calculation engine 내부 저장은 scalar base-unit field를 사용한다. 예: `vnKv`, `lengthM`, `ratedCurrentA`, `ikssKA`. Unit-aware object는 UI input boundary, import/export boundary, report/audit boundary에서만 선택적으로 사용한다. 내부 계산은 SI normalized scalar 값을 기준으로 하고, 원래 사용자 입력 단위의 traceability가 필요한 경우에만 `{ value, unit, normalizedValue, normalizedUnit }` 형태를 boundary model에 보존한다. MVP에서는 한 project 안에서 SI와 NEC/Imperial 단위를 혼합하지 않는다.** |
| OQ-15 | Calculation snapshot retention policy는 어떻게 할 것인가? | **결정 완료: MVP project file은 unlimited calculation history를 저장하지 않는다. 대신 `{scenarioId, module, subCase}` 기준으로 최신 successful calculation result/snapshot을 보존하고, subCase가 없는 module은 `subCase = null`로 처리한다. Maximum short-circuit와 minimum short-circuit는 별도 scenario 또는 동일 scenario의 subCase로 구분할 수 있다. Validation 또는 calculation failure가 발생한 경우 최신 failed validation snapshot도 보존한다. 입력 변경 후 기존 result는 stale 또는 cleared 상태가 되며, stale result를 valid result처럼 report에 사용하지 않는다. Exported report는 나중에 project file의 snapshot retention이 변경되더라도 추적 가능하도록 snapshot reference 또는 embedded input summary를 포함한다. Full audit history, last N calculations, external audit DB는 Post-MVP로 둔다.** |

---

## 16. Initial Technical Recommendation

초기 개발은 다음 조합을 권장한다.

| Layer | Recommendation |
|---|---|
| Repository | Same monorepo for Power System Study App and Cable Sizing App |
| Frontend | React + TypeScript |
| Diagram | React Flow |
| Backend | Python FastAPI or existing app backend |
| Calculation | pandapower adapter for Load Flow/Short Circuit + reusable Cable Sizing package |
| Data Model | Shared app standard data model package |
| Validation | Shared validation and warning/error package |
| Data Storage | JSON first, SQLite/PostgreSQL later |
| Report | Excel first via common report data model; PDF later |
| Test | Shared Golden Case based regression tests |

초기 monorepo 구조 예시:

```text
power-system-study/
  apps/
    web/
      one-line-diagram/
      cable-sizing-screen/
      report-viewer/

  packages/
    core-model/
    validation/
    error-codes/
    engine-cable-sizing/
    engine-load-flow/
    engine-short-circuit/
    report/
    standards/
    golden-cases/
```


---

## 17. MVP Definition Summary

MVP의 한 문장 정의:

> 사용자가 산업 플랜트의 기본 one-line diagram을 작성하고, 동일한 데이터모델에서 Load Flow, Voltage Drop, 3상 Short Circuit, Cable Sizing, Breaker Duty Check를 수행하며, 검증 가능한 report를 출력할 수 있는 EPC review용 전력계통 해석 앱.

---

## 18. Revision History

| Version | Date | Description |
|---|---|---|
| v1.0 | 2026-05-01 | Initial PRD v1.0 final release. OQ-01~OQ-15 closed; final sanity fixes applied for §12 header, ID/tag terminology, generator short-circuit contribution scope, motor contribution option, snapshot override audit schema, and retention key. |
| v0.1.12 | 2026-05-01 | v1.0 RC 일관성 검토 반영: scenario schema 통일, unit scalar 정책 명시, ID/tag 용어 정리, generator/switch/snapshot model 추가, Ib fallback/audit retention/re-baselining 정책 보완 |
| v0.1.11 | 2026-05-01 | v1.0 전 구조 검토 반영: solver boundary, scenario override layer, schema versioning, unit policy, equipment ID policy, cable sizing input contract/design-current policy, calculation execution policy 추가 |
| v0.1.10 | 2026-05-01 | OQ-10 결정 반영: Golden Case 기준값은 수계산/IEC 예제/독립 기준자료 우선이며, pandapower는 verified 기준값이 아닌 provisional regression/cross-check 용도로 제한 |
| v0.1.9 | 2026-05-01 | OQ-09 결정 반영: MVP는 minimal equipment template library만 제공하고, full user-defined/global/manufacturer library는 Post-MVP로 분리 |
| v0.1.8 | 2026-05-01 | OQ-08 결정 반영: Arc Flash는 long-term roadmap에 포함하되 MVP에서는 계산/label을 제외하고 optional data fields만 준비 |
| v0.1.7 | 2026-05-01 | OQ-07 결정 반영: MVP에서는 Protection Coordination/TCC Viewer를 제외하고, protective device 기본 데이터모델과 breaker duty/clearing time만 포함 |
| v0.1.6 | 2026-05-01 | OQ-06 결정 반영: MVP Power System Study 계산 범위는 3상 평형계통으로 제한하고, 1-phase는 data model 확장 구조만 유지 |
| v0.1.5 | 2026-05-01 | OQ-05 결정 반영: MVP report는 Excel export 우선, PDF는 공통 report data model 안정화 이후 Post-MVP로 구현 |
| v0.1.4 | 2026-05-01 | OQ-04 결정 반영: MVP는 MV/LV 기본 배전계통을 지원하되, 상세 sizing 및 duty check는 LV 중심으로 제한 |
| v0.1.3 | 2026-05-01 | OQ-03 결정 반영: Cable Sizing App은 같은 monorepo에서 통합 관리하고, engine/validation/error-code/Golden Case를 package화하여 재사용 |
| v0.1.2 | 2026-05-01 | OQ-02 결정 반영: 초기 Load Flow 및 Short Circuit solver는 pandapower adapter를 사용하고, validation/report/Golden Case/Cable Sizing은 자체 구현 |
| v0.1.1 | 2026-05-01 | OQ-01 결정 반영: 초기 버전은 IEC 기준으로 고정하고, NEC/IEEE는 향후 확장 구조만 유지 |
| v0.1 | 2026-05-01 | Initial PRD draft |


"""Stage 2 PR #3 — Python mirror of the TypeScript solver adapter contract.

Source of truth: ``packages/solver-adapter/src/types.ts``. Drift between
the two definitions becomes a contract-test failure starting in Stage 2
PR #4 once a transport is wired. PR #3 only documents the shape on the
Python side so that the sidecar code lives next to the contract.

Shapes are described as ``TypedDict`` classes so they remain JSON-friendly
and type-checked-friendly without importing pandapower or any other
solver dependency. The skeleton intentionally does not import pandapower.
"""

from __future__ import annotations

from typing import List, Literal, Optional, TypedDict

# Wire-format version. Mirrors SOLVER_INPUT_VERSION on the TypeScript side.
SOLVER_INPUT_VERSION = "1.0.0"

# Adapter / sidecar metadata. Mirrors SOLVER_ADAPTER_VERSION on the
# TypeScript side; the Python sidecar carries its own version too.
SIDECAR_VERSION = "0.1.0"
SIDECAR_NAME = "power-system-study-solver-sidecar"

SolverBusTopology = Literal["3P3W", "3P4W"]
SolverSourceKind = Literal["utility", "generator_pq"]
SolverSourceRole = Literal["slack", "pq"]
SolverAlgorithm = Literal["nr", "bfsw"]
SolverLoadOrigin = Literal["load", "motor"]
SolverBranchKind = Literal["transformer", "line"]
SolverResultStatus = Literal["succeeded", "failed_validation", "failed_solver"]
SolverIssueSeverity = Literal["error", "warning"]
SolverIssueCode = Literal[
    "E-LF-001",
    "E-LF-004",
    "E-LF-005",
    "W-LF-001",
    "W-LF-002",
    "W-LF-003",
]
SolverName = Literal["pandapower"]


class SolverBus(TypedDict):
    internalId: str
    tag: str
    vnKv: float
    topology: SolverBusTopology


class SolverSource(TypedDict):
    internalId: str
    tag: str
    kind: SolverSourceKind
    busInternalId: str
    vnKv: Optional[float]
    scLevelMva: Optional[float]
    faultCurrentKa: Optional[float]
    xrRatio: Optional[float]
    voltageFactor: Optional[float]
    role: SolverSourceRole
    pMw: Optional[float]
    qMvar: Optional[float]


class SolverTransformer(TypedDict):
    internalId: str
    tag: str
    fromBusInternalId: str
    toBusInternalId: str
    snMva: Optional[float]
    vnHvKv: Optional[float]
    vnLvKv: Optional[float]
    vkPercent: Optional[float]
    vkrPercent: Optional[float]
    xrRatio: Optional[float]
    vectorGroup: Optional[str]
    tapPosition: Optional[float]


class SolverLine(TypedDict):
    internalId: str
    tag: str
    fromBusInternalId: str
    toBusInternalId: str
    lengthM: Optional[float]
    rOhmPerKm: Optional[float]
    xOhmPerKm: Optional[float]


class SolverLoad(TypedDict):
    internalId: str
    tag: str
    busInternalId: str
    pMw: float
    qMvar: float
    origin: SolverLoadOrigin


class SolverGeneratorPQ(TypedDict):
    internalId: str
    tag: str
    busInternalId: str
    pMw: Optional[float]
    qMvar: Optional[float]


class SolverOptions(TypedDict):
    algorithm: SolverAlgorithm
    tolerance: float
    maxIter: int
    enforceQLim: Literal[False]


class SolverInput(TypedDict):
    inputVersion: Literal["1.0.0"]
    scenarioId: Optional[str]
    frequencyHz: Literal[50, 60]
    buses: List[SolverBus]
    sources: List[SolverSource]
    transformers: List[SolverTransformer]
    lines: List[SolverLine]
    loads: List[SolverLoad]
    generatorsPQ: List[SolverGeneratorPQ]
    options: SolverOptions


class SolverMetadata(TypedDict):
    solverName: SolverName
    solverVersion: str
    adapterVersion: str
    options: SolverOptions
    executedAt: str
    inputHash: Optional[str]
    networkHash: Optional[str]


class SolverBusResult(TypedDict):
    internalId: str
    voltageKv: float
    voltagePuPct: float
    angleDeg: float


class SolverBranchResult(TypedDict):
    internalId: str
    branchKind: SolverBranchKind
    fromBusInternalId: str
    toBusInternalId: str
    pMwFrom: float
    qMvarFrom: float
    pMwTo: float
    qMvarTo: float
    currentA: float
    loadingPct: Optional[float]
    lossKw: float


class SolverIssue(TypedDict, total=False):
    code: SolverIssueCode
    severity: SolverIssueSeverity
    message: str
    internalId: str
    field: str


class SolverResult(TypedDict):
    status: SolverResultStatus
    converged: bool
    metadata: SolverMetadata
    buses: List[SolverBusResult]
    branches: List[SolverBranchResult]
    issues: List[SolverIssue]


# ---------------------------------------------------------------------------
# Stage 3 PR #2 — Short Circuit contract mirror.
#
# Source of truth: ``packages/solver-adapter/src/shortCircuit.ts``. Drift
# becomes a contract-test failure once the transport call lands in Stage 3
# PR #3. PR #2 only documents the shape on the Python side so the sidecar
# code lives next to the contract; no ``run_short_circuit`` dispatcher is
# wired in this PR.
# ---------------------------------------------------------------------------


SHORT_CIRCUIT_COMMAND = "run_short_circuit"

ShortCircuitFaultType = Literal["threePhase"]
ShortCircuitCase = Literal["maximum"]
ShortCircuitMode = Literal["all_buses", "specific"]
ShortCircuitSidecarBusRowStatus = Literal["valid", "warning", "failed"]
ShortCircuitSidecarResponseStatus = SolverResultStatus
ShortCircuitIssueSeverity = Literal["error", "warning"]
ShortCircuitIssueCode = Literal[
    "E-SC-001",
    "E-SC-002",
    "E-SC-003",
    "E-SC-004",
    "E-SC-005",
    "E-SC-006",
    "W-SC-001",
    "W-SC-002",
    "W-SC-003",
]


class ShortCircuitFaultTarget(TypedDict):
    busInternalId: str


class ShortCircuitOptions(TypedDict):
    faultType: ShortCircuitFaultType
    calculationCase: ShortCircuitCase
    computePeak: bool
    computeThermal: bool


class ShortCircuitRequest(TypedDict):
    solverInput: SolverInput
    mode: ShortCircuitMode
    faultTargets: List[ShortCircuitFaultTarget]
    shortCircuitOptions: ShortCircuitOptions


class ShortCircuitSidecarMetadataBlock(TypedDict):
    calculationCase: ShortCircuitCase
    faultType: ShortCircuitFaultType
    computePeak: bool
    computeThermal: bool
    voltageFactor: float


class _ShortCircuitSidecarBusRowRequired(TypedDict):
    internalId: str
    voltageLevelKv: Optional[float]
    ikssKa: Optional[float]
    ipKa: Optional[float]
    ithKa: Optional[float]
    skssMva: Optional[float]
    status: ShortCircuitSidecarBusRowStatus


class ShortCircuitSidecarBusRow(_ShortCircuitSidecarBusRowRequired, total=False):
    # ``issueCodes`` is the only optional field — every numeric value is
    # required but nullable, mirroring the TypeScript contract.
    issueCodes: List[ShortCircuitIssueCode]


class _ShortCircuitWireIssueRequired(TypedDict):
    code: ShortCircuitIssueCode
    severity: ShortCircuitIssueSeverity
    message: str


class ShortCircuitWireIssue(_ShortCircuitWireIssueRequired, total=False):
    internalId: str
    field: str


class ShortCircuitSidecarResponse(TypedDict):
    status: ShortCircuitSidecarResponseStatus
    metadata: SolverMetadata
    shortCircuit: ShortCircuitSidecarMetadataBlock
    buses: List[ShortCircuitSidecarBusRow]
    issues: List[ShortCircuitWireIssue]

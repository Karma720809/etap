"""Stage 3 PR #3 — pandapower invocation for IEC 60909 maximum 3-phase
bus short-circuit calculation.

Converts a ``ShortCircuitRequest`` JSON dict into a pandapower network
(reusing :func:`load_flow._build_pandapower_net` so the topology mapping
stays in one place), runs ``pandapower.shortcircuit.calc_sc`` with
``fault="3ph"`` and ``case="max"``, and projects the per-bus results
back into a ``ShortCircuitSidecarResponse`` JSON dict whose
``internalId`` fields match Stage 1 canonical IDs verbatim.

Guardrails honored here (spec §6, §7, §11):

- pandapower indices never leave this module; the wire format always
  uses ``internalId``.
- No fake numbers are returned. Failures map to ``E-SC-001`` /
  ``E-SC-004`` / ``E-SC-005`` / ``E-SC-006`` per the spec; numeric
  fields stay ``null`` on the wire when pandapower returned NaN, when
  the corresponding option was disabled, or when the per-row
  computation failed (spec §7.1 fail-closed).
- MVP supports ``faultType="threePhase"`` and
  ``calculationCase="maximum"`` only (S3-OQ-03). Any other request is
  rejected with ``E-SC-004``.
- Empty fault targets when ``mode="specific"`` → ``E-SC-005``.
- Unknown ``busInternalId`` in fault targets → ``E-SC-005``.
- Multi-slack / no-slack networks → ``E-SC-006`` (parity with
  ``load_flow.py`` but mapped to the Short Circuit code per spec
  §11.3).

The sidecar does not run app-normalized projection. The wire response
keeps the solver-side vocabulary
(``status: "valid" | "warning" | "failed"``); the orchestrator (Stage 3
PR #4) maps that into the app-side
``"ok" | "warning" | "failed" | "unavailable"`` set.
"""

from __future__ import annotations

import datetime
import importlib
import math
from typing import Any, Dict, List, Optional, Tuple

from contracts import (
    SIDECAR_VERSION,
    SOLVER_INPUT_VERSION,
    ShortCircuitSidecarBusRow,
    ShortCircuitSidecarMetadataBlock,
    ShortCircuitSidecarResponse,
    ShortCircuitWireIssue,
    SolverMetadata,
)


# Symbolic adapter version reported in ``SolverMetadata.adapterVersion``
# for sidecar responses. The TypeScript adapter overrides this with its
# own package semver before normalization (PR #4), but the sidecar still
# records what it observed for traceability — identical to ``load_flow.py``.
ADAPTER_VERSION_SIDECAR_FALLBACK = SIDECAR_VERSION


def _utc_now_iso() -> str:
    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _try_import_pandapower() -> Tuple[
    Optional[Any], Optional[Any], Optional[str], Optional[str]
]:
    """Return ``(pp_module, sc_module, version, error_message)``.

    Both ``pandapower`` and the ``pandapower.shortcircuit`` submodule are
    imported lazily so an interpreter without the scientific stack still
    answers ``health`` and produces a structured ``E-SC-001`` for the
    short-circuit command instead of crashing.
    """

    try:
        pp = importlib.import_module("pandapower")
    except Exception as exc:  # pragma: no cover - exercised only without pandapower
        return None, None, None, f"pandapower unavailable: {exc!r}"
    version = str(getattr(pp, "__version__", "unknown"))
    try:
        sc = importlib.import_module("pandapower.shortcircuit")
    except Exception as exc:  # pragma: no cover - exercised only without pandapower
        return pp, None, version, f"pandapower.shortcircuit unavailable: {exc!r}"
    return pp, sc, version, None


def _default_solver_options() -> Dict[str, Any]:
    """Mirrors ``load_flow._default_solver_options``."""

    return {
        "algorithm": "nr",
        "tolerance": 1e-8,
        "maxIter": 50,
        "enforceQLim": False,
    }


def _make_metadata(solver_version: str, options: Dict[str, Any]) -> SolverMetadata:
    return {
        "solverName": "pandapower",
        "solverVersion": solver_version,
        "adapterVersion": ADAPTER_VERSION_SIDECAR_FALLBACK,
        "options": options,
        "executedAt": _utc_now_iso(),
        "inputHash": None,
        "networkHash": None,
    }


def _make_metadata_block(
    options_block: Optional[Dict[str, Any]],
    voltage_factor: float,
) -> ShortCircuitSidecarMetadataBlock:
    """Build the response's ``shortCircuit`` block.

    ``calculationCase`` and ``faultType`` are pinned to the MVP values
    (S3-OQ-02 / S3-OQ-03). The structural guard on the TypeScript side
    rejects any other literal, so even failure responses emit the
    pinned values.
    """

    block_in = options_block or {}
    return {
        "calculationCase": "maximum",
        "faultType": "threePhase",
        "computePeak": bool(block_in.get("computePeak", True)),
        "computeThermal": bool(block_in.get("computeThermal", True)),
        "voltageFactor": float(voltage_factor),
    }


def _failed_response(
    metadata: SolverMetadata,
    metadata_block: ShortCircuitSidecarMetadataBlock,
    issues: List[ShortCircuitWireIssue],
    *,
    status: str = "failed_solver",
) -> ShortCircuitSidecarResponse:
    return {
        "status": status,
        "metadata": metadata,
        "shortCircuit": metadata_block,
        "buses": [],
        "issues": issues,
    }


def _slack_voltage_factor(solver_input: Dict[str, Any]) -> float:
    """Read the IEC 60909 voltage factor ``c`` from the slack source.

    Per S3-OQ-06, ``voltageFactor`` defaults to 1.0 when missing. Stage
    3 MVP records the value passed in by the caller so the orchestrator
    can audit what the sidecar applied; pandapower's own per-bus voltage
    factor (set internally by ``calc_sc``) is independent of this
    field — see the README upgrade note when this changes in a future
    pandapower pin.
    """

    sources = solver_input.get("sources") or []
    for source in sources:
        if source.get("role") == "slack":
            vf = source.get("voltageFactor")
            if vf is None:
                return 1.0
            try:
                return float(vf)
            except (TypeError, ValueError):
                return 1.0
    return 1.0


def _validate_request(request: Dict[str, Any]) -> List[ShortCircuitWireIssue]:
    """Cheap structural validation. Mirrors load_flow._validate_input."""

    issues: List[ShortCircuitWireIssue] = []
    if not isinstance(request, dict):
        issues.append(
            {
                "code": "E-SC-005",
                "severity": "error",
                "message": "ShortCircuitRequest must be a JSON object.",
            }
        )
        return issues

    solver_input = request.get("solverInput")
    if not isinstance(solver_input, dict):
        issues.append(
            {
                "code": "E-SC-005",
                "severity": "error",
                "message": "Missing or non-object solverInput on request.",
                "field": "solverInput",
            }
        )
        return issues

    if solver_input.get("inputVersion") != SOLVER_INPUT_VERSION:
        issues.append(
            {
                "code": "E-SC-005",
                "severity": "error",
                "message": (
                    f"Unsupported inputVersion: expected {SOLVER_INPUT_VERSION}, "
                    f"got {solver_input.get('inputVersion')!r}."
                ),
                "field": "inputVersion",
            }
        )

    sc_options = request.get("shortCircuitOptions")
    if not isinstance(sc_options, dict):
        issues.append(
            {
                "code": "E-SC-005",
                "severity": "error",
                "message": "Missing shortCircuitOptions block.",
                "field": "shortCircuitOptions",
            }
        )
        return issues

    fault_type = sc_options.get("faultType")
    if fault_type != "threePhase":
        issues.append(
            {
                "code": "E-SC-004",
                "severity": "error",
                "message": (
                    "Unsupported faultType: MVP supports 'threePhase' only "
                    f"(got {fault_type!r})."
                ),
                "field": "shortCircuitOptions.faultType",
            }
        )

    case = sc_options.get("calculationCase")
    if case != "maximum":
        issues.append(
            {
                "code": "E-SC-004",
                "severity": "error",
                "message": (
                    "Unsupported calculationCase: MVP supports 'maximum' only "
                    f"(got {case!r})."
                ),
                "field": "shortCircuitOptions.calculationCase",
            }
        )

    mode = request.get("mode")
    if mode not in ("specific", "all_buses"):
        issues.append(
            {
                "code": "E-SC-005",
                "severity": "error",
                "message": (
                    "Unsupported mode: expected 'specific' or 'all_buses' "
                    f"(got {mode!r})."
                ),
                "field": "mode",
            }
        )
        return issues

    fault_targets = request.get("faultTargets")
    if not isinstance(fault_targets, list):
        issues.append(
            {
                "code": "E-SC-005",
                "severity": "error",
                "message": "faultTargets must be an array.",
                "field": "faultTargets",
            }
        )
        return issues

    if mode == "specific" and len(fault_targets) == 0:
        issues.append(
            {
                "code": "E-SC-005",
                "severity": "error",
                "message": "mode='specific' requires at least one faultTargets entry.",
                "field": "faultTargets",
            }
        )

    bus_index = {
        bus["internalId"]: bus
        for bus in solver_input.get("buses", [])
        if isinstance(bus, dict) and isinstance(bus.get("internalId"), str)
    }
    for target in fault_targets:
        if not isinstance(target, dict):
            issues.append(
                {
                    "code": "E-SC-005",
                    "severity": "error",
                    "message": "faultTargets entries must be objects.",
                    "field": "faultTargets",
                }
            )
            continue
        bus_id = target.get("busInternalId")
        if not isinstance(bus_id, str) or not bus_id:
            issues.append(
                {
                    "code": "E-SC-005",
                    "severity": "error",
                    "message": "faultTargets entry missing busInternalId.",
                    "field": "faultTargets[].busInternalId",
                }
            )
            continue
        bus = bus_index.get(bus_id)
        if bus is None:
            issues.append(
                {
                    "code": "E-SC-005",
                    "severity": "error",
                    "message": (
                        f"faultTarget busInternalId {bus_id!r} not present in "
                        "solverInput.buses."
                    ),
                    "internalId": bus_id,
                    "field": "faultTargets[].busInternalId",
                }
            )
            continue
        topology = bus.get("topology")
        if topology not in ("3P3W", "3P4W"):
            issues.append(
                {
                    "code": "E-SC-004",
                    "severity": "error",
                    "message": (
                        f"Unsupported bus topology on fault path: {topology!r} "
                        "(MVP supports 3P3W / 3P4W only)."
                    ),
                    "internalId": bus_id,
                    "field": "topology",
                }
            )

    slack_count = sum(
        1
        for source in solver_input.get("sources", [])
        if isinstance(source, dict) and source.get("role") == "slack"
    )
    if slack_count == 0:
        issues.append(
            {
                "code": "E-SC-006",
                "severity": "error",
                "message": (
                    "No slack source on the network. MVP requires exactly one "
                    "in-service utility."
                ),
            }
        )
    elif slack_count > 1:
        issues.append(
            {
                "code": "E-SC-006",
                "severity": "error",
                "message": (
                    f"Network has {slack_count} slack sources. MVP supports "
                    "exactly one (multi-utility deferred per S2-FU-03)."
                ),
            }
        )

    return issues


def _nullable_float(value: Any) -> Optional[float]:
    """Coerce a pandapower-cell value to ``Optional[float]`` for the wire.

    ``None`` is preserved. ``NaN`` and infinities are mapped to ``None``
    so the structural guard (`isShortCircuitSidecarResponse` on the TS
    side) accepts the row — pandapower writes NaN when a column is
    irrelevant, e.g., ``ip_ka`` when ``ip=False`` was passed.
    """

    if value is None:
        return None
    try:
        as_float = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(as_float) or math.isinf(as_float):
        return None
    return as_float


def _project_bus_rows(
    net: Any,
    solver_input: Dict[str, Any],
    bus_id_map: Dict[str, int],
    fault_bus_internal_ids: List[str],
    options_block: Dict[str, Any],
) -> List[ShortCircuitSidecarBusRow]:
    """Project pandapower's ``net.res_bus_sc`` table into wire rows."""

    rows: List[ShortCircuitSidecarBusRow] = []
    res_bus_sc = getattr(net, "res_bus_sc", None)
    bus_index = {
        bus["internalId"]: bus
        for bus in solver_input.get("buses", [])
        if isinstance(bus, dict) and isinstance(bus.get("internalId"), str)
    }
    compute_peak = bool(options_block.get("computePeak", True))
    compute_thermal = bool(options_block.get("computeThermal", True))

    for internal_id in fault_bus_internal_ids:
        bus = bus_index.get(internal_id)
        vn_kv: Optional[float] = (
            float(bus["vnKv"]) if bus is not None and "vnKv" in bus else None
        )
        pp_idx = bus_id_map.get(internal_id)
        ikss: Optional[float] = None
        ip_value: Optional[float] = None
        ith: Optional[float] = None
        skss: Optional[float] = None
        per_row_failed = False

        if res_bus_sc is None or pp_idx is None or pp_idx not in res_bus_sc.index:
            per_row_failed = True
        else:
            try:
                row = res_bus_sc.loc[pp_idx]
                ikss = _nullable_float(getattr(row, "ikss_ka", None))
                if compute_peak:
                    ip_value = _nullable_float(getattr(row, "ip_ka", None))
                if compute_thermal:
                    ith = _nullable_float(getattr(row, "ith_ka", None))
                # pandapower 2.14 stores Sk'' in MVA despite the column
                # name `skss_mw` — see spec §7.1.
                skss = _nullable_float(getattr(row, "skss_mw", None))
            except Exception:
                per_row_failed = True

        if per_row_failed or ikss is None:
            rows.append(
                {
                    "internalId": internal_id,
                    "voltageLevelKv": vn_kv,
                    "ikssKa": None,
                    "ipKa": None,
                    "ithKa": None,
                    "skssMva": None,
                    "status": "failed",
                    "issueCodes": ["E-SC-001"],
                }
            )
        else:
            rows.append(
                {
                    "internalId": internal_id,
                    "voltageLevelKv": vn_kv,
                    "ikssKa": ikss,
                    "ipKa": ip_value,
                    "ithKa": ith,
                    "skssMva": skss,
                    "status": "valid",
                }
            )

    return rows


def run_short_circuit(request: Dict[str, Any]) -> ShortCircuitSidecarResponse:
    """Execute IEC 60909 maximum 3-phase short-circuit on a request.

    Returns a ``ShortCircuitSidecarResponse``. Never raises. Every
    failure mode maps to a structured ``E-SC-*`` issue with empty
    ``buses`` (top-level ``failed_validation`` / ``failed_solver``) so
    the TypeScript transport never has to invent a wire shape.
    """

    options_block_in = (
        request.get("shortCircuitOptions") if isinstance(request, dict) else None
    )
    solver_input = (
        request.get("solverInput") if isinstance(request, dict) else None
    ) or {}
    options_dict = (
        solver_input.get("options") if isinstance(solver_input, dict) else None
    ) or _default_solver_options()
    voltage_factor = (
        _slack_voltage_factor(solver_input) if isinstance(solver_input, dict) else 1.0
    )

    pp_module, sc_module, pp_version, import_error = _try_import_pandapower()
    metadata = _make_metadata(pp_version or "unavailable", options_dict)
    metadata_block = _make_metadata_block(options_block_in, voltage_factor)

    if pp_module is None or sc_module is None:
        return _failed_response(
            metadata,
            metadata_block,
            [
                {
                    "code": "E-SC-001",
                    "severity": "error",
                    "message": import_error or "pandapower import failed",
                }
            ],
            status="failed_solver",
        )

    validation_issues = _validate_request(request)
    if validation_issues:
        # Refresh the metadata block now that we know the request is at
        # least shaped correctly enough to read its options safely.
        if isinstance(options_block_in, dict):
            metadata_block = _make_metadata_block(options_block_in, voltage_factor)
        return _failed_response(
            metadata,
            metadata_block,
            validation_issues,
            status="failed_validation",
        )

    # Reuse the Load Flow network builder so the topology mapping lives
    # in one place (spec §6.1). The function is module-private but the
    # sidecar treats it as a shared helper; promoting it to a public
    # name is deferred until a third caller appears.
    from load_flow import _build_pandapower_net

    try:
        net, bus_id_map, _line_id_map, _trafo_id_map = _build_pandapower_net(
            pp_module, solver_input
        )
    except Exception as exc:
        return _failed_response(
            metadata,
            metadata_block,
            [
                {
                    "code": "E-SC-001",
                    "severity": "error",
                    "message": f"pandapower network build failed: {exc!r}",
                }
            ],
            status="failed_solver",
        )

    mode = request["mode"]
    if mode == "all_buses":
        fault_bus_internal_ids = [
            bus["internalId"]
            for bus in solver_input.get("buses", [])
            if isinstance(bus, dict) and bus.get("internalId") in bus_id_map
        ]
    else:
        fault_bus_internal_ids = [
            target["busInternalId"] for target in request.get("faultTargets", [])
        ]

    bus_pp_indices = [
        bus_id_map[internal_id]
        for internal_id in fault_bus_internal_ids
        if internal_id in bus_id_map
    ]

    if not bus_pp_indices:
        return _failed_response(
            metadata,
            metadata_block,
            [
                {
                    "code": "E-SC-005",
                    "severity": "error",
                    "message": "No fault bus matched the network bus index.",
                }
            ],
            status="failed_validation",
        )

    compute_peak = bool((options_block_in or {}).get("computePeak", True))
    compute_thermal = bool((options_block_in or {}).get("computeThermal", True))

    try:
        sc_module.calc_sc(
            net,
            fault="3ph",
            case="max",
            ip=compute_peak,
            ith=compute_thermal,
            bus=bus_pp_indices,
        )
    except Exception as exc:
        return _failed_response(
            metadata,
            metadata_block,
            [
                {
                    "code": "E-SC-001",
                    "severity": "error",
                    "message": f"pandapower calc_sc raised: {exc!r}",
                }
            ],
            status="failed_solver",
        )

    rows = _project_bus_rows(
        net,
        solver_input,
        bus_id_map,
        fault_bus_internal_ids,
        options_block_in or {},
    )

    return {
        "status": "succeeded",
        "metadata": metadata,
        "shortCircuit": metadata_block,
        "buses": rows,
        "issues": [],
    }

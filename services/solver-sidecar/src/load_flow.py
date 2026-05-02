"""Stage 2 PR #4 — pandapower invocation for balanced 3-phase Load Flow.

Converts a :class:`contracts.SolverInput` JSON dict into a pandapower
network, runs the balanced three-phase Newton-Raphson load flow (or the
selected algorithm), and projects the result back into a
:class:`contracts.SolverResult` JSON dict whose ``internalId`` fields
match the Stage 1 canonical IDs verbatim.

Guardrails honored here (spec §S2-OQ-02 / §S2-OQ-07):

- pandapower indices never leave this module; the wire format always
  uses ``internalId``.
- No fake numbers are returned. If pandapower fails to converge, the
  function emits ``E-LF-001``. If pandapower itself raises, the function
  emits ``E-LF-004``. In both cases ``status`` is ``"failed_solver"``.
- Loading percent for cables is reported as ``None``: Stage 1 / PR #4
  does not feed cable ampacity through the contract, so loading would
  be vs an arbitrary placeholder rating. Reporting ``None`` is
  honest; cable loading is wired in PR #5 once the rating field
  reaches the adapter contract.
"""

from __future__ import annotations

import datetime
import importlib
from typing import Any, Dict, List, Optional, Tuple

from contracts import (
    SIDECAR_VERSION,
    SOLVER_INPUT_VERSION,
    SolverBranchResult,
    SolverBusResult,
    SolverInput,
    SolverIssue,
    SolverMetadata,
    SolverResult,
)


# Symbolic adapter version reported in `SolverMetadata.adapterVersion`
# for results produced by the sidecar. The TypeScript adapter overrides
# this with its own package semver when it normalizes the result, but
# the sidecar still records what it observed for traceability.
ADAPTER_VERSION_SIDECAR_FALLBACK = SIDECAR_VERSION


def _utc_now_iso() -> str:
    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _try_import_pandapower() -> Tuple[Optional[Any], Optional[str], Optional[str]]:
    """Return ``(module, version, error_message)``.

    pandapower is imported lazily so that the ``health`` smoke command
    works on a stock CPython without the scientific stack. The function
    never raises — a missing pandapower is a structured ``E-LF-004``
    issue, not an interpreter error.
    """

    try:
        pp = importlib.import_module("pandapower")
    except Exception as exc:  # pragma: no cover - exercised by integration env
        return None, None, f"pandapower unavailable: {exc!r}"
    version = getattr(pp, "__version__", "unknown")
    return pp, str(version), None


def _make_metadata(
    solver_version: str,
    options: Dict[str, Any],
) -> SolverMetadata:
    return {
        "solverName": "pandapower",
        "solverVersion": solver_version,
        "adapterVersion": ADAPTER_VERSION_SIDECAR_FALLBACK,
        "options": options,
        "executedAt": _utc_now_iso(),
        "inputHash": None,
        "networkHash": None,
    }


def _failed_result(
    metadata: SolverMetadata,
    issues: List[SolverIssue],
    *,
    converged: bool = False,
) -> SolverResult:
    return {
        "status": "failed_solver",
        "converged": converged,
        "metadata": metadata,
        "buses": [],
        "branches": [],
        "issues": issues,
    }


def _validate_input(solver_input: Dict[str, Any]) -> List[SolverIssue]:
    """Minimal request-shape validation. Returns a list of E-LF-005 issues."""

    issues: List[SolverIssue] = []
    if not isinstance(solver_input, dict):
        issues.append(
            {
                "code": "E-LF-005",
                "severity": "error",
                "message": "SolverInput must be a JSON object.",
            }
        )
        return issues

    if solver_input.get("inputVersion") != SOLVER_INPUT_VERSION:
        issues.append(
            {
                "code": "E-LF-005",
                "severity": "error",
                "message": (
                    f"Unsupported inputVersion: expected {SOLVER_INPUT_VERSION}, "
                    f"got {solver_input.get('inputVersion')!r}."
                ),
                "field": "inputVersion",
            }
        )

    for required in ("buses", "sources", "transformers", "lines", "loads"):
        value = solver_input.get(required)
        if not isinstance(value, list):
            issues.append(
                {
                    "code": "E-LF-005",
                    "severity": "error",
                    "message": f"Missing or non-list field: {required}.",
                    "field": required,
                }
            )

    if not isinstance(solver_input.get("options"), dict):
        issues.append(
            {
                "code": "E-LF-005",
                "severity": "error",
                "message": "Missing options object.",
                "field": "options",
            }
        )

    freq = solver_input.get("frequencyHz")
    if freq not in (50, 60):
        issues.append(
            {
                "code": "E-LF-005",
                "severity": "error",
                "message": f"frequencyHz must be 50 or 60; got {freq!r}.",
                "field": "frequencyHz",
            }
        )

    return issues


def _build_pandapower_net(
    pp: Any,
    solver_input: Dict[str, Any],
) -> Tuple[Any, Dict[str, int], Dict[str, int], Dict[str, int]]:
    """Translate SolverInput → pandapower net.

    Returns ``(net, bus_id_map, line_id_map, trafo_id_map)`` with
    ``internalId → pandapower index`` lookups. The maps are private to
    this module; only ``internalId`` crosses back over the wire.
    """

    freq = solver_input["frequencyHz"]
    net = pp.create_empty_network(f_hz=float(freq))

    bus_id_map: Dict[str, int] = {}
    for bus in solver_input["buses"]:
        idx = pp.create_bus(
            net,
            vn_kv=float(bus["vnKv"]),
            name=bus.get("tag") or bus["internalId"],
        )
        bus_id_map[bus["internalId"]] = int(idx)

    # Slack(s) and PQ generators encoded inside `sources`.
    for source in solver_input["sources"]:
        bus_internal_id = source["busInternalId"]
        if bus_internal_id not in bus_id_map:
            continue
        bus_idx = bus_id_map[bus_internal_id]
        if source["role"] == "slack":
            voltage_factor = source.get("voltageFactor")
            vm_pu = float(voltage_factor) if voltage_factor is not None else 1.0
            sc_mva = source.get("scLevelMva")
            xr = source.get("xrRatio")
            kwargs: Dict[str, Any] = {
                "bus": bus_idx,
                "vm_pu": vm_pu,
                "name": source.get("tag") or source["internalId"],
            }
            if sc_mva is not None and float(sc_mva) > 0:
                kwargs["s_sc_max_mva"] = float(sc_mva)
                kwargs["s_sc_min_mva"] = float(sc_mva)
            if xr is not None and float(xr) > 0:
                # pandapower expects rx_max = R/X. Stage 1 stores X/R, so
                # invert. xr=10 → rx_max=0.1.
                kwargs["rx_max"] = 1.0 / float(xr)
                kwargs["rx_min"] = 1.0 / float(xr)
            pp.create_ext_grid(net, **kwargs)
        elif source["kind"] == "generator_pq":
            p_mw = source.get("pMw") or 0.0
            q_mvar = source.get("qMvar") or 0.0
            pp.create_sgen(
                net,
                bus=bus_idx,
                p_mw=float(p_mw),
                q_mvar=float(q_mvar),
                name=source.get("tag") or source["internalId"],
            )

    # Standalone PQ generators carried as a separate list.
    for gen in solver_input.get("generatorsPQ", []):
        bus_internal_id = gen["busInternalId"]
        if bus_internal_id not in bus_id_map:
            continue
        bus_idx = bus_id_map[bus_internal_id]
        pp.create_sgen(
            net,
            bus=bus_idx,
            p_mw=float(gen.get("pMw") or 0.0),
            q_mvar=float(gen.get("qMvar") or 0.0),
            name=gen.get("tag") or gen["internalId"],
        )

    trafo_id_map: Dict[str, int] = {}
    for tx in solver_input["transformers"]:
        from_id = tx["fromBusInternalId"]
        to_id = tx["toBusInternalId"]
        if from_id not in bus_id_map or to_id not in bus_id_map:
            continue
        sn_mva = tx.get("snMva") or 0.0
        vk_percent = tx.get("vkPercent") or 0.0
        vkr_percent = tx.get("vkrPercent")
        if vkr_percent is None and tx.get("xrRatio") is not None and vk_percent > 0:
            xr = float(tx["xrRatio"])
            vkr_percent = float(vk_percent) / ((xr * xr + 1.0) ** 0.5)
        if vkr_percent is None:
            vkr_percent = 0.0
        idx = pp.create_transformer_from_parameters(
            net,
            hv_bus=bus_id_map[from_id],
            lv_bus=bus_id_map[to_id],
            sn_mva=float(sn_mva),
            vn_hv_kv=float(tx.get("vnHvKv") or 0.0),
            vn_lv_kv=float(tx.get("vnLvKv") or 0.0),
            vk_percent=float(vk_percent),
            vkr_percent=float(vkr_percent),
            pfe_kw=0.0,
            i0_percent=0.0,
            name=tx.get("tag") or tx["internalId"],
        )
        trafo_id_map[tx["internalId"]] = int(idx)

    line_id_map: Dict[str, int] = {}
    for line in solver_input["lines"]:
        from_id = line["fromBusInternalId"]
        to_id = line["toBusInternalId"]
        if from_id not in bus_id_map or to_id not in bus_id_map:
            continue
        length_m = line.get("lengthM") or 0.0
        length_km = max(float(length_m) / 1000.0, 1e-9)
        r_ohm_per_km = float(line.get("rOhmPerKm") or 0.0)
        x_ohm_per_km = float(line.get("xOhmPerKm") or 0.0)
        idx = pp.create_line_from_parameters(
            net,
            from_bus=bus_id_map[from_id],
            to_bus=bus_id_map[to_id],
            length_km=length_km,
            r_ohm_per_km=r_ohm_per_km,
            x_ohm_per_km=x_ohm_per_km,
            c_nf_per_km=0.0,
            # max_i_ka is required by pandapower, but no rating is fed
            # through the contract in PR #4. Set a placeholder; the
            # reported `loadingPct` is forced to None below so the
            # placeholder never reaches the result.
            max_i_ka=1.0,
            name=line.get("tag") or line["internalId"],
        )
        line_id_map[line["internalId"]] = int(idx)

    for load in solver_input["loads"]:
        bus_internal_id = load["busInternalId"]
        if bus_internal_id not in bus_id_map:
            continue
        bus_idx = bus_id_map[bus_internal_id]
        pp.create_load(
            net,
            bus=bus_idx,
            p_mw=float(load.get("pMw") or 0.0),
            q_mvar=float(load.get("qMvar") or 0.0),
            name=load.get("tag") or load["internalId"],
        )

    return net, bus_id_map, line_id_map, trafo_id_map


def _project_buses(
    net: Any,
    solver_input: Dict[str, Any],
    bus_id_map: Dict[str, int],
) -> List[SolverBusResult]:
    results: List[SolverBusResult] = []
    res_bus = net.res_bus
    for bus in solver_input["buses"]:
        internal_id = bus["internalId"]
        if internal_id not in bus_id_map:
            continue
        pp_idx = bus_id_map[internal_id]
        row = res_bus.loc[pp_idx]
        vn_kv = float(bus["vnKv"])
        vm_pu = float(row.vm_pu)
        results.append(
            {
                "internalId": internal_id,
                "voltageKv": vm_pu * vn_kv,
                "voltagePuPct": vm_pu * 100.0,
                "angleDeg": float(row.va_degree),
            }
        )
    return results


def _project_branches(
    net: Any,
    solver_input: Dict[str, Any],
    line_id_map: Dict[str, int],
    trafo_id_map: Dict[str, int],
) -> List[SolverBranchResult]:
    branches: List[SolverBranchResult] = []

    for line in solver_input["lines"]:
        internal_id = line["internalId"]
        if internal_id not in line_id_map:
            continue
        pp_idx = line_id_map[internal_id]
        row = net.res_line.loc[pp_idx]
        # Cable rating is not part of the SolverInput contract today, so
        # report loadingPct as None rather than a vs-placeholder value.
        branches.append(
            {
                "internalId": internal_id,
                "branchKind": "line",
                "fromBusInternalId": line["fromBusInternalId"],
                "toBusInternalId": line["toBusInternalId"],
                "pMwFrom": float(row.p_from_mw),
                "qMvarFrom": float(row.q_from_mvar),
                "pMwTo": float(row.p_to_mw),
                "qMvarTo": float(row.q_to_mvar),
                "currentA": float(row.i_ka) * 1000.0,
                "loadingPct": None,
                "lossKw": float(row.pl_mw) * 1000.0,
            }
        )

    for tx in solver_input["transformers"]:
        internal_id = tx["internalId"]
        if internal_id not in trafo_id_map:
            continue
        pp_idx = trafo_id_map[internal_id]
        row = net.res_trafo.loc[pp_idx]
        loading_value: Optional[float]
        if (tx.get("snMva") or 0) > 0:
            loading_value = float(row.loading_percent)
        else:
            loading_value = None
        branches.append(
            {
                "internalId": internal_id,
                "branchKind": "transformer",
                "fromBusInternalId": tx["fromBusInternalId"],
                "toBusInternalId": tx["toBusInternalId"],
                "pMwFrom": float(row.p_hv_mw),
                "qMvarFrom": float(row.q_hv_mvar),
                "pMwTo": float(row.p_lv_mw),
                "qMvarTo": float(row.q_lv_mvar),
                "currentA": float(row.i_hv_ka) * 1000.0,
                "loadingPct": loading_value,
                "lossKw": float(row.pl_mw) * 1000.0,
            }
        )

    return branches


def run_load_flow(solver_input: Dict[str, Any]) -> SolverResult:
    """Execute Load Flow on a SolverInput JSON dict and return SolverResult."""

    options_dict = (
        solver_input.get("options") if isinstance(solver_input, dict) else None
    ) or {
        "algorithm": "nr",
        "tolerance": 1e-8,
        "maxIter": 50,
        "enforceQLim": False,
    }

    pp_module, pp_version, import_error = _try_import_pandapower()
    metadata = _make_metadata(pp_version or "unavailable", options_dict)

    if pp_module is None:
        return _failed_result(
            metadata,
            [
                {
                    "code": "E-LF-004",
                    "severity": "error",
                    "message": import_error or "pandapower import failed",
                }
            ],
        )

    validation_issues = _validate_input(solver_input)
    if validation_issues:
        return {
            "status": "failed_validation",
            "converged": False,
            "metadata": metadata,
            "buses": [],
            "branches": [],
            "issues": validation_issues,
        }

    try:
        net, bus_id_map, line_id_map, trafo_id_map = _build_pandapower_net(
            pp_module, solver_input
        )
    except Exception as exc:
        return _failed_result(
            metadata,
            [
                {
                    "code": "E-LF-004",
                    "severity": "error",
                    "message": f"pandapower network build failed: {exc!r}",
                }
            ],
        )

    algorithm = options_dict.get("algorithm", "nr")
    tolerance = float(options_dict.get("tolerance", 1e-8))
    max_iter = int(options_dict.get("maxIter", 50))

    converged = True
    try:
        pp_module.runpp(
            net,
            algorithm=algorithm,
            tolerance_mva=tolerance,
            max_iteration=max_iter,
            enforce_q_lims=False,
        )
    except Exception as exc:
        # pandapower's LoadflowNotConverged is a subclass of
        # pp.powerflow.LoadflowNotConverged. We map both convergence
        # failures and other adapter errors to structured issues.
        not_converged_cls = getattr(pp_module, "LoadflowNotConverged", None)
        if not_converged_cls is not None and isinstance(exc, not_converged_cls):
            return _failed_result(
                metadata,
                [
                    {
                        "code": "E-LF-001",
                        "severity": "error",
                        "message": (
                            "Load Flow did not converge within the configured "
                            f"iteration / tolerance limits: {exc}"
                        ),
                    }
                ],
            )
        return _failed_result(
            metadata,
            [
                {
                    "code": "E-LF-004",
                    "severity": "error",
                    "message": f"pandapower runpp raised: {exc!r}",
                }
            ],
        )

    # `net.converged` is set by pandapower; defensively treat as True
    # only if the attribute is present and truthy.
    converged = bool(getattr(net, "converged", True))

    buses_out = _project_buses(net, solver_input, bus_id_map)
    branches_out = _project_branches(
        net, solver_input, line_id_map, trafo_id_map
    )

    return {
        "status": "succeeded" if converged else "failed_solver",
        "converged": converged,
        "metadata": metadata,
        "buses": buses_out,
        "branches": branches_out,
        "issues": []
        if converged
        else [
            {
                "code": "E-LF-001",
                "severity": "error",
                "message": "pandapower reported non-converged after runpp.",
            }
        ],
    }

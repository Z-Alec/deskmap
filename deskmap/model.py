"""Load, validate and normalise a deskmap setup file."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from importlib import resources
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

DEFAULT_ZONES: dict[str, dict[str, Any]] = {
    "desk": {"label": "On the desk", "kind": "surface", "moves_with_desk": True},
    "tray": {"label": "Cable tray — moves with the desk", "kind": "underneath", "moves_with_desk": True},
    "floor": {"label": "Floor — does not move", "kind": "underneath", "moves_with_desk": False},
    "wall": {"label": "Wall", "kind": "external", "moves_with_desk": False},
}
COMPUTER_KINDS = {"computer", "laptop"}


@dataclass
class Issue:
    level: str          # "error" or "warning"
    where: str
    message: str

    def __str__(self) -> str:
        return f"{self.level}: {self.where}: {self.message}"


@dataclass
class StretchedCable:
    index: int
    cable: dict
    via_spine: bool


@dataclass
class Setup:
    raw: dict
    zones: dict[str, dict]
    channels: dict[str, dict]
    devices: dict[str, dict]
    cables: list[dict]
    issues: list[Issue] = field(default_factory=list)

    @property
    def desk(self) -> dict:
        return self.raw["desk"]

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.level == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.level == "warning"]

    def zone_of(self, device_id: str) -> dict:
        return self.zones[self.devices[device_id]["zone"]]

    def moves(self, device_id: str) -> bool:
        return bool(self.zone_of(device_id)["moves_with_desk"])

    @property
    def travel_mm(self) -> float | None:
        r = self.desk.get("height_range_mm")
        return (r[1] - r[0]) if r else None

    def stretched_cables(self) -> list[StretchedCable]:
        """Cables joining something that moves with the desk to something that doesn't."""
        out = []
        for i, c in enumerate(self.cables):
            a, b = node_of(c["from"]), node_of(c["to"])
            if a not in self.devices or b not in self.devices or c.get("type") == "wireless":
                continue
            if self.moves(a) != self.moves(b):
                via_spine = any(self.channels.get(v, {}).get("kind") == "spine"
                                for v in c.get("via", []))
                out.append(StretchedCable(i, c, via_spine))
        return out


def node_of(endpoint: str) -> str:
    return str(endpoint).split(".", 1)[0]


def load_schema() -> dict:
    return json.loads(resources.files("deskmap").joinpath("schema.json").read_text())


def _fmt_path(parts) -> str:
    out = ""
    for p in parts:
        out += f"[{p}]" if isinstance(p, int) else (f".{p}" if out else str(p))
    return out or "(root)"


def load(path: str | Path) -> Setup:
    """Parse and validate a setup file. Never raises on bad content: problems go in .issues."""
    text = Path(path).read_text()
    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as e:
        return Setup({}, {}, {}, {}, [], [Issue("error", str(path), f"not valid YAML: {e}")])
    return from_dict(raw if isinstance(raw, dict) else {})


def from_dict(raw: dict) -> Setup:
    issues: list[Issue] = []

    validator = Draft202012Validator(load_schema())
    for err in sorted(validator.iter_errors(raw), key=lambda e: list(e.absolute_path)):
        msg = err.message
        if err.validator == "additionalProperties" and "cables" in err.absolute_path:
            msg += " (check for an unquoted comma inside a { } value)"
        issues.append(Issue("error", _fmt_path(err.absolute_path), msg))
    if issues:
        return Setup(raw, {}, {}, {}, [], issues)

    zones = {}
    for zid, z in (raw.get("zones") or DEFAULT_ZONES).items():
        z = dict(z)
        z.setdefault("label", zid.replace("_", " ").capitalize())
        z.setdefault("moves_with_desk", z["kind"] == "surface")
        zones[zid] = z
    channels = dict(raw.get("channels") or {})
    devices = {k: dict(v) for k, v in raw["devices"].items()}
    cables = [dict(c) for c in raw.get("cables") or []]
    setup = Setup(raw, zones, channels, devices, cables, issues)

    width = raw["desk"]["size_mm"]["width"]
    depth = raw["desk"]["size_mm"]["depth"]

    for did, d in devices.items():
        where = f"devices.{did}"
        d.setdefault("kind", "other")
        d.setdefault("status", "owned")
        zone = zones.get(d["zone"])
        if zone is None:
            issues.append(Issue("error", where, f"zone '{d['zone']}' is not defined"))
            continue
        pos = d.get("position")
        if pos is None:
            issues.append(Issue("warning", where, "has no position, so it isn't drawn"))
        elif zone["kind"] == "surface":
            if "y" not in pos or "d" not in pos:
                issues.append(Issue("error", where, "a device on a surface needs position x, y, w and d"))
            elif pos["x"] < 0 or pos["y"] < 0 or pos["x"] + pos["w"] > width or pos["y"] + pos["d"] > depth:
                issues.append(Issue("warning", where, f"position runs off the {width} x {depth} mm desk"))
        for u in d.get("used_by", []):
            if u not in devices:
                issues.append(Issue("error", where, f"used_by '{u}' is not a device"))
            elif devices[u].get("kind") not in COMPUTER_KINDS:
                issues.append(Issue("warning", where, f"used_by '{u}' is not a computer or laptop"))

    referenced = set()
    for i, c in enumerate(cables):
        where = f"cables[{i}] ({c['from']} -> {c['to']})"
        for side in ("from", "to"):
            n = node_of(c[side])
            referenced.add(n)
            if n not in devices:
                issues.append(Issue("error", where, f"'{n}' is not a device"))
        if node_of(c["from"]) == node_of(c["to"]):
            issues.append(Issue("warning", where, "connects a device to itself"))
        for v in c.get("via", []):
            if v not in channels:
                issues.append(Issue("error", where, f"channel '{v}' is not defined"))
        if "type" not in c:
            issues.append(Issue("warning", where, "cable type not set yet"))

    for did, d in devices.items():
        if did not in referenced and d.get("kind") != "mount":
            issues.append(Issue("warning", f"devices.{did}", "has no cables"))

    if not setup.errors:
        travel = setup.travel_mm
        for s in setup.stretched_cables():
            if not s.via_spine:
                need = f"at least {travel:.0f} mm of slack" if travel else "slack for the desk's travel"
                issues.append(Issue(
                    "warning", f"cables[{s.index}] ({s.cable['from']} -> {s.cable['to']})",
                    f"runs between the moving desk and a static zone without a spine; it needs {need}"))
            if travel and s.cable.get("length_m") and s.cable["length_m"] * 1000 < travel:
                issues.append(Issue(
                    "warning", f"cables[{s.index}] ({s.cable['from']} -> {s.cable['to']})",
                    f"is {s.cable['length_m']} m long, shorter than the desk's {travel:.0f} mm travel"))
    return setup

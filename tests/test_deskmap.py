from pathlib import Path

import pytest
import yaml

from deskmap import from_dict, load, render
from deskmap.cli import main

EXAMPLES = sorted((Path(__file__).parent.parent / "examples").glob("*.yaml"))


def minimal(**overrides):
    data = {
        "schema_version": "0.1",
        "desk": {"size_mm": {"width": 1200, "depth": 600}, "height_range_mm": [650, 1250]},
        "devices": {
            "laptop": {"kind": "laptop", "zone": "desk", "position": {"x": 800, "y": 300, "w": 300, "d": 200}},
            "power_board": {"kind": "power", "zone": "tray", "position": {"x": 400, "w": 300}},
            "wall": {"kind": "power", "zone": "wall", "position": {"x": 0, "w": 150}},
        },
        "cables": [
            {"from": "laptop", "to": "power_board", "type": "power"},
            {"from": "power_board", "to": "wall", "type": "power"},
        ],
    }
    data.update(overrides)
    return data


@pytest.mark.parametrize("path", EXAMPLES, ids=lambda p: p.name)
def test_examples_are_valid_and_render(path):
    setup = load(path)
    assert setup.errors == [], [str(e) for e in setup.errors]
    svg = render(setup)
    assert svg.startswith("<svg") and svg.rstrip().endswith("</svg>")


def test_minimal_is_valid():
    setup = from_dict(minimal())
    assert setup.errors == []


def test_unquoted_comma_is_caught():
    # `route: a, b` inside { } parses as two keys; the schema rejects the stray one
    raw = yaml.safe_load("""
schema_version: "0.1"
desk: { size_mm: { width: 1000, depth: 500 } }
devices:
  a: { zone: desk, position: { x: 0, y: 0, w: 100, d: 100 } }
  b: { zone: desk, position: { x: 200, y: 0, w: 100, d: 100 } }
cables:
  - { from: a, to: b, note: one, two }
""")
    setup = from_dict(raw)
    assert any("unquoted comma" in e.message for e in setup.errors)


def test_unknown_endpoint_and_channel():
    data = minimal()
    data["cables"].append({"from": "laptop", "to": "ghost", "via": ["nowhere"]})
    msgs = [e.message for e in from_dict(data).errors]
    assert "'ghost' is not a device" in msgs
    assert "channel 'nowhere' is not defined" in msgs


def test_bad_cable_type_rejected():
    data = minimal()
    data["cables"][0]["type"] = "usb-c"  # enum uses usb_c
    assert from_dict(data).errors


def test_surface_device_needs_full_position():
    data = minimal()
    data["devices"]["laptop"]["position"] = {"x": 0, "w": 100}
    assert from_dict(data).errors


def test_position_off_desk_warns():
    data = minimal()
    data["devices"]["laptop"]["position"]["x"] = 1100
    assert any("runs off" in w.message for w in from_dict(data).warnings)


def test_stretch_check_flags_cable_without_spine():
    setup = from_dict(minimal())
    stretched = setup.stretched_cables()
    assert [(s.cable["from"], s.cable["to"], s.via_spine) for s in stretched] == [
        ("power_board", "wall", False)]
    assert any("600 mm of slack" in w.message for w in setup.warnings)


def test_stretch_check_flags_short_cable():
    data = minimal()
    data["cables"][1]["length_m"] = 0.5
    assert any("shorter than the desk's 600 mm travel" in w.message for w in from_dict(data).warnings)


def test_spine_routing_satisfies_stretch_check():
    data = minimal(channels={"spine": {"kind": "spine", "x_mm": -40}})
    data["cables"][1]["via"] = ["spine"]
    setup = from_dict(data)
    assert setup.stretched_cables()[0].via_spine
    assert not any("slack" in w.message for w in setup.warnings)


def test_cli_render_and_check(tmp_path, capsys):
    src = tmp_path / "setup.yaml"
    src.write_text(yaml.safe_dump(minimal()))
    assert main(["check", str(src)]) == 0
    assert main(["check", str(src), "--strict"]) == 1   # the stretch warning
    assert main(["render", str(src), "-q"]) == 0
    assert (tmp_path / "setup.svg").read_text().startswith("<svg")


def test_cli_render_refuses_invalid(tmp_path):
    src = tmp_path / "bad.yaml"
    src.write_text("schema_version: '0.1'\ndesk: {}\ndevices: {}\n")
    assert main(["render", str(src)]) == 1

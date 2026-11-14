"""deskmap command line: `deskmap check FILE` and `deskmap render FILE`."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__
from .model import load
from .render import render


def _report(setup, quiet=False) -> None:
    for issue in setup.errors + ([] if quiet else setup.warnings):
        print(f"  {issue}", file=sys.stderr)


def cmd_check(args) -> int:
    setup = load(args.file)
    print(f"{args.file}: {len(setup.devices)} devices, {len(setup.cables)} cables, "
          f"{len(setup.errors)} errors, {len(setup.warnings)} warnings")
    _report(setup)
    if setup.errors:
        return 1
    stretched = setup.stretched_cables()
    if stretched:
        travel = setup.travel_mm
        print(f"\nCables between the moving desk and something static"
              f"{f' (desk travels {travel:.0f} mm)' if travel else ''}:")
        for s in stretched:
            c = s.cable
            how = "via spine" if s.via_spine else "NOT via a spine"
            length = f", {c['length_m']} m" if c.get("length_m") else ""
            print(f"  {c['from']} -> {c['to']} ({c.get('type', 'type not set')}{length}) — {how}")
    return 1 if (args.strict and setup.warnings) else 0


def cmd_render(args) -> int:
    setup = load(args.file)
    if setup.errors:
        print(f"{args.file}: can't render, {len(setup.errors)} errors:", file=sys.stderr)
        _report(setup, quiet=True)
        return 1
    out = Path(args.output) if args.output else Path(args.file).with_suffix(".svg")
    out.write_text(render(setup))
    print(f"wrote {out}")
    if setup.warnings and not args.quiet:
        print(f"{len(setup.warnings)} warnings (run `deskmap check {args.file}` to see them)",
              file=sys.stderr)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="deskmap", description=__doc__)
    ap.add_argument("--version", action="version", version=f"deskmap {__version__}")
    sub = ap.add_subparsers(dest="command", required=True)

    c = sub.add_parser("check", help="validate a setup file and list cables the desk will stretch")
    c.add_argument("file")
    c.add_argument("--strict", action="store_true", help="exit non-zero on warnings too")
    c.set_defaults(func=cmd_check)

    r = sub.add_parser("render", help="draw a setup file as a top-down SVG")
    r.add_argument("file")
    r.add_argument("-o", "--output", help="output path (default: FILE with .svg)")
    r.add_argument("-q", "--quiet", action="store_true")
    r.set_defaults(func=cmd_render)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

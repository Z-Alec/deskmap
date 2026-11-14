"""Draw a Setup as a to-scale, top-down SVG."""
from __future__ import annotations

from html import escape

from .model import COMPUTER_KINDS, Setup, node_of

S = 0.5            # px per mm
LANE = 7           # spacing between cables running along the back edge
GUTTER_GAP = 16    # gap between the desk's back edge and the first lane
ROW_H = 44         # height of an underneath/external row
ROW_GAP = 30
FAN = 8            # spacing between cables leaving the same side of a box

COMPUTER_PALETTE = [("#d1fae5", "#059669"), ("#dbeafe", "#2563eb"),
                    ("#ede9fe", "#7c3aed"), ("#fce7f3", "#db2777")]
SHARED = ("#fef3c7", "#d97706")
INFRA = ("#e7e5e4", "#57534e")
SPINE_COLOUR = "#059669"
CABLE_COLOURS = {
    "power": ("#dc2626", "Power"), "hdmi": ("#ea580c", "HDMI"),
    "displayport": ("#db2777", "DisplayPort"), "usb_a": ("#ca8a04", "USB"),
    "usb_c": ("#ca8a04", "USB"), "thunderbolt": ("#0891b2", "Thunderbolt"),
    "audio": ("#7c3aed", "Audio"), "ethernet": ("#0f766e", "Ethernet"),
    "wireless": ("#78716c", "Wireless"), "other": ("#78716c", "Other"),
}
TBC = ("#78716c", "Type TBC")
INK, MUTED = "#1c1917", "#78716c"


def _fmt(n: float) -> str:
    return f"{n:.1f}".rstrip("0").rstrip(".")


class _Geometry:
    def __init__(self, setup: Setup):
        self.s = setup
        w_mm = setup.desk["size_mm"]["width"]
        d_mm = setup.desk["size_mm"]["depth"]
        spine_xs = [c["x_mm"] for c in setup.channels.values() if c["kind"] == "spine"]
        left_overhang = max([0] + [-x * S for x in spine_xs])
        self.x0 = max(70.0, 40 + left_overhang)
        self.W, self.D = w_mm * S, d_mm * S

        # Cables that run along the back edge need lanes above the desk
        self.plans = self._plan()
        n_lanes = sum(1 for p in self.plans if p["kind"] in ("spine", "gutter", "gutter_down"))
        self.y0 = 90 + n_lanes * LANE + GUTTER_GAP
        self.right = self.x0 + self.W
        self.bottom = self.y0 + self.D

        occupied = {d["zone"] for d in setup.devices.values() if d.get("position")}
        self.rows = [z for z, v in setup.zones.items() if v["kind"] == "underneath" and z in occupied]
        self.row_y = {}
        y = self.bottom + 90
        for z in self.rows:
            self.row_y[z] = y
            y += ROW_H + ROW_GAP
        self.strip_bottom = (y - ROW_GAP + 16) if self.rows else self.bottom
        last_row_y = self.row_y[self.rows[-1]] if self.rows else self.bottom + 40

        self.spine_x = {cid: self.x0 + c["x_mm"] * S
                        for cid, c in setup.channels.items() if c["kind"] == "spine"}
        right_extent = max([self.right] + list(self.spine_x.values()))

        self.boxes: dict[str, tuple[float, float, float, float]] = {}
        ext_x = right_extent + 40
        for did, d in setup.devices.items():
            pos = d.get("position")
            zone = setup.zones.get(d["zone"])
            if not pos or not zone:
                continue
            if zone["kind"] == "surface":
                if "y" in pos and "d" in pos:
                    self.boxes[did] = (self.x0 + pos["x"] * S, self.y0 + pos["y"] * S,
                                       pos["w"] * S, pos["d"] * S)
            elif zone["kind"] == "underneath":
                self.boxes[did] = (self.x0 + pos["x"] * S, self.row_y[d["zone"]], pos["w"] * S, ROW_H)
            else:
                w = max(pos["w"] * S, 70)
                self.boxes[did] = (ext_x, last_row_y, w, ROW_H)
                ext_x += w + 20
        self.width = max(ext_x, right_extent + 140) + 20

    # -- planning ------------------------------------------------------
    def _zone_kind(self, did):
        return self.s.zones[self.s.devices[did]["zone"]]["kind"]

    def _plan(self):
        rank = {"surface": 0, "underneath": 1, "external": 2}
        plans = []
        for c in self.s.cables:
            a, b = node_of(c["from"]), node_of(c["to"])
            if a not in self.s.devices or b not in self.s.devices:
                continue
            if rank[self._zone_kind(a)] > rank[self._zone_kind(b)]:
                a, b = b, a
            via = [self.s.channels[v] | {"id": v} for v in c.get("via", []) if v in self.s.channels]
            has_edge = any(v["kind"] == "edge" for v in via)
            spine = next((v["id"] for v in via if v["kind"] == "spine"), None)
            ka, kb = self._zone_kind(a), self._zone_kind(b)
            if ka == "surface":
                if spine and kb != "surface":
                    kind = "spine"
                elif kb == "surface":
                    kind = "gutter" if (has_edge or spine) else "direct"
                else:
                    kind = "gutter_down" if has_edge else "down"
            else:
                kind = "under"
            plans.append({"c": c, "a": a, "b": b, "kind": kind, "spine": spine})
        return plans

    def drawable(self, p):
        return p["a"] in self.boxes and p["b"] in self.boxes


def render(setup: Setup) -> str:
    g = _Geometry(setup)
    plans = [p for p in g.plans if g.drawable(p)]

    # Which side of each box does every cable leave from?
    side_use: dict[tuple[str, str], int] = {}

    def claim(node, side):
        k = (node, side)
        side_use[k] = side_use.get(k, 0) + 1
        return side_use[k] - 1

    for p in plans:
        a, b, k = p["a"], p["b"], p["kind"]
        ax, ay, aw, ah = g.boxes[a]
        bx, by, bw, bh = g.boxes[b]
        if k == "spine":
            sx = g.spine_x[p["spine"]]
            sa, sb = "top", ("right" if sx > bx + bw / 2 else "left")
        elif k in ("gutter", "gutter_down"):
            sa, sb = "top", "top"
        elif k == "down":
            sa, sb = "bottom", "top"
        elif k == "direct":
            # Straight across unless another box sits in the way, then go
            # under both boxes (toward the front of the desk).
            lo, hi = sorted((ax + aw, bx + bw))[0], sorted((ax, bx))[1]
            ylo = min(ay + ah / 2, by + bh / 2)
            yhi = max(ay + ah / 2, by + bh / 2)
            blocked = any(
                n not in (a, b) and ox < hi and ox + ow > lo and oy < yhi + 2 and oy + oh > ylo - 2
                for n, (ox, oy, ow, oh) in g.boxes.items())
            if blocked:
                p["kind"] = "direct_under"
                sa, sb = "bottom", "bottom"
            else:
                sa, sb = (("left", "right") if bx < ax else ("right", "left"))
        else:  # under
            if g._zone_kind(b) == "external":
                sa, sb = ("right" if bx > ax else "left"), "top"
            elif abs(ay - by) < 1:
                lo, hi = sorted((ax + aw, bx + bw))[0], sorted((ax, bx))[1]
                blocked = any(
                    n not in (a, b) and abs(oy - ay) < 1 and ox < hi and ox + ow > lo
                    for n, (ox, oy, ow, oh) in g.boxes.items())
                if blocked:   # another box in the way: dip under the row
                    sa, sb = "bottom", "bottom"
                else:
                    sa, sb = (("right", "left") if bx > ax else ("left", "right"))
            else:
                sa, sb = (("bottom", "top") if ay < by else ("top", "bottom"))
        p["sa"], p["sb"] = sa, sb
        p["ia"], p["ib"] = claim(a, sa), claim(b, sb)

    def anchor(node, side, i):
        x, y, w, h = g.boxes[node]
        n = side_use[(node, side)]
        off = (i - (n - 1) / 2) * FAN
        if side == "top":
            return x + w / 2 + off, y
        if side == "bottom":
            return x + w / 2 + off, y + h
        off = off * 0.6
        return (x if side == "left" else x + w), y + h / 2 + off

    gutter_lane = 0
    down_lane = 0
    gap_lane: dict[float, int] = {}
    spine_count: dict[str, int] = {}
    spine_extent: dict[str, list[float]] = {}
    paths = []
    first_row = g.row_y[g.rows[0]] if g.rows else g.bottom + 90

    for p in plans:
        c, k = p["c"], p["kind"]
        ax, ay = anchor(p["a"], p["sa"], p["ia"])
        bx, by = anchor(p["b"], p["sb"], p["ib"])
        pts = [(ax, ay)]
        if k in ("spine", "gutter", "gutter_down"):
            gy = g.y0 - GUTTER_GAP - gutter_lane * LANE
            gutter_lane += 1
            pts.append((ax, gy))
            if k == "spine":
                n = spine_count.get(p["spine"], 0)
                spine_count[p["spine"]] = n + 1
                sx = g.spine_x[p["spine"]] + ((n % 5) - 2) * 2.2
                pts += [(sx, gy), (sx, by), (bx, by)]
                ext = spine_extent.setdefault(p["spine"], [gy, by])
                ext[0], ext[1] = min(ext[0], gy), max(ext[1], by)
            else:
                pts += [(bx, gy), (bx, by)]
        elif k == "down":
            jy = first_row - 14 - down_lane * 6
            down_lane += 1
            pts += [(ax, jy), (bx, jy), (bx, by)]
        elif k == "direct":
            mx = (ax + bx) / 2
            pts += [(mx, ay), (mx, by), (bx, by)]
        elif k == "direct_under":
            x0, x1 = sorted((ax, bx))
            floor_y = max([ay, by] + [
                oy + oh for n, (ox, oy, ow, oh) in g.boxes.items()
                if n not in (p["a"], p["b"]) and setup.zones[setup.devices[n]["zone"]]["kind"] == "surface"
                and ox < x1 and ox + ow > x0 and oy + oh > min(ay, by) and oy < max(ay, by) + 40])
            jy = min(floor_y + 12, g.bottom - 6)
            pts += [(ax, jy), (bx, jy), (bx, by)]
        else:
            if p["sb"] == "top" and p["sa"] in ("left", "right"):
                pts += [(bx, ay), (bx, by)]
            elif p["sa"] in ("left", "right"):
                mx = (ax + bx) / 2
                pts += [(mx, ay), (mx, by), (bx, by)]
            else:
                upper = min(ay, by)
                lane = gap_lane.get(upper, 0)
                gap_lane[upper] = lane + 1
                jy = upper + 8 + lane * 6
                pts += [(ax, jy), (bx, jy), (bx, by)]
        pts.append((bx, by))
        paths.append((c, k, pts))

    # ---------------------------------------------------------------- SVG
    desk = setup.desk
    H = g.strip_bottom + 90
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{_fmt(g.width)}" height="{_fmt(H)}" '
           f'viewBox="0 0 {_fmt(g.width)} {_fmt(H)}" font-family="Helvetica, Arial, sans-serif" '
           'role="img">']
    title = setup.raw.get("name") or desk.get("model") or "Desk setup"
    out.append(f"<title>{escape(title)}</title>")
    out.append(f'<rect width="100%" height="100%" fill="white"/>')
    out.append(f'<text x="{_fmt(g.x0)}" y="30" font-size="15" font-weight="bold" fill="{INK}">'
               f"{escape(title)}</text>")
    sub = [f'{desk["size_mm"]["width"]} x {desk["size_mm"]["depth"]} mm']
    if desk.get("model") and setup.raw.get("name"):
        sub.insert(0, desk["model"])
    if desk.get("height_range_mm"):
        lo, hi = desk["height_range_mm"]
        sub.append(f"height {lo}–{hi} mm")
    sub.append("top-down, drawn to scale")
    out.append(f'<text x="{_fmt(g.x0)}" y="49" font-size="11" fill="{MUTED}">'
               f'{escape(" · ".join(str(s) for s in sub))}</text>')

    # Desk, labels and underneath area
    out.append(f'<rect x="{_fmt(g.x0)}" y="{_fmt(g.y0)}" width="{_fmt(g.W)}" height="{_fmt(g.D)}" '
               'rx="8" fill="#faf7f2" stroke="#a8a29e" stroke-width="1.2"/>')
    lab_x = max([g.right] + list(g.spine_x.values())) + 10
    out.append(f'<text x="{_fmt(lab_x)}" y="{_fmt(g.y0 + 12)}" font-size="10" fill="{MUTED}">back</text>')
    out.append(f'<text x="{_fmt(lab_x)}" y="{_fmt(g.bottom - 4)}" font-size="10" fill="{MUTED}">front (you)</text>')
    if g.rows:
        left = min([g.x0] + list(g.spine_x.values())) - 25
        out.append(f'<rect x="{_fmt(left)}" y="{_fmt(g.bottom + 40)}" width="{_fmt(g.right - left + 10)}" '
                   f'height="{_fmt(g.strip_bottom - g.bottom - 40)}" rx="10" fill="none" '
                   'stroke="#d6d3d1" stroke-dasharray="4 4"/>')
        out.append(f'<text x="{_fmt(g.x0 + 10)}" y="{_fmt(g.bottom + 56)}" font-size="10" fill="{MUTED}">'
                   "UNDERNEATH</text>")
        for z in g.rows:
            out.append(f'<text x="{_fmt(g.right - 4)}" y="{_fmt(g.row_y[z] - 5)}" font-size="10" '
                       f'fill="{MUTED}" text-anchor="end">{escape(setup.zones[z]["label"])}</text>')

    # Cables
    used_types = []
    for c, k, pts in paths:
        colour, name = CABLE_COLOURS.get(c.get("type"), TBC) if c.get("type") else TBC
        if name not in [n for _, n in used_types]:
            used_types.append((colour, name))
        dashed = c.get("type") in (None, "wireless")
        width = 2.0 if k == "spine" else 1.6
        tip = f'{c["from"]} → {c["to"]}: {c.get("type") or "type not set"}'
        if c.get("via"):
            tip += f' (via {", ".join(c["via"])})'
        if c.get("note"):
            tip += f' — {c["note"]}'
        d = "M" + " L".join(f"{_fmt(x)} {_fmt(y)}" for x, y in pts)
        dash = ' stroke-dasharray="6 4"' if dashed else ""
        out.append(f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{width}"'
                   f'{dash} stroke-linejoin="round">'
                   f"<title>{escape(tip)}</title></path>")

    # Spines, drawn over the cables they carry
    for cid, (top, bot) in spine_extent.items():
        x = g.spine_x[cid]
        label = setup.channels[cid].get("label") or cid.replace("_", " ")
        out.append(f'<line x1="{_fmt(x)}" y1="{_fmt(top)}" x2="{_fmt(x)}" y2="{_fmt(bot)}" '
                   f'stroke="{SPINE_COLOUR}" stroke-width="11" stroke-opacity="0.3" stroke-linecap="round">'
                   f"<title>{escape(label)}</title></line>")
        lx = x - 12 if x < g.x0 + g.W / 2 else x + 16
        ly = (g.y0 + g.bottom) / 2
        out.append(f'<text x="{_fmt(lx)}" y="{_fmt(ly)}" font-size="10" fill="{SPINE_COLOUR}" '
                   f'text-anchor="middle" transform="rotate(-90 {_fmt(lx)} {_fmt(ly)})">{escape(label)}</text>')

    # Devices
    computers = [d for d, v in setup.devices.items() if v.get("kind") in COMPUTER_KINDS]
    palette = {d: COMPUTER_PALETTE[i % len(COMPUTER_PALETTE)] for i, d in enumerate(computers)}

    def colours(did):
        d = setup.devices[did]
        if d.get("color"):
            return d["color"], INFRA[1]
        if did in palette:
            return palette[did]
        users = [u for u in d.get("used_by", []) if u in palette]
        if len(users) > 1:
            return SHARED
        if len(users) == 1:
            return palette[users[0]]
        return INFRA

    any_shared = False
    any_planned = False
    for did, (x, y, w, h) in g.boxes.items():
        d = setup.devices[did]
        fill, border = colours(did)
        any_shared |= (fill, border) == SHARED
        planned = d.get("status") in ("planned", "to_buy")
        any_planned |= planned
        is_ext = setup.zones[d["zone"]]["kind"] == "external"
        rx = h / 2 if is_ext else 6
        tip = d.get("model") or d.get("notes") or did
        dash = ' stroke-dasharray="5 3"' if planned else ""
        out.append(f'<rect x="{_fmt(x)}" y="{_fmt(y)}" width="{_fmt(w)}" height="{_fmt(h)}" rx="{_fmt(rx)}" '
                   f'fill="{fill}" stroke="{border}"{dash}>'
                   f"<title>{escape(str(tip))}</title></rect>")
        label = d.get("label") or did.replace("_", " ")
        fs = 11 if h >= 26 else 9
        ty = y + h / 2 + fs / 3
        if planned and h >= 30:
            ty -= 5
            tag = "to buy" if d["status"] == "to_buy" else "planned"
            out.append(f'<text x="{_fmt(x + w / 2)}" y="{_fmt(ty + 13)}" font-size="9" '
                       f'text-anchor="middle" fill="{MUTED}">{tag}</text>')
        out.append(f'<text x="{_fmt(x + w / 2)}" y="{_fmt(ty)}" font-size="{fs}" font-weight="600" '
                   f'text-anchor="middle" fill="{INK}">{escape(label)}</text>')

    # Legend: only what's actually on the page
    ly = g.strip_bottom + 32
    lx = g.x0 - 30
    for colour, name in used_types:
        dash = ' stroke-dasharray="6 4"' if name in ("Type TBC", "Wireless") else ""
        out.append(f'<line x1="{_fmt(lx)}" y1="{_fmt(ly)}" x2="{_fmt(lx + 22)}" y2="{_fmt(ly)}" '
                   f'stroke="{colour}" stroke-width="2"{dash}/>')
        out.append(f'<text x="{_fmt(lx + 28)}" y="{_fmt(ly + 4)}" font-size="11" fill="#44403c">{name}</text>')
        lx += 40 + 7 * len(name)
    if spine_extent:
        out.append(f'<line x1="{_fmt(lx)}" y1="{_fmt(ly)}" x2="{_fmt(lx + 22)}" y2="{_fmt(ly)}" '
                   f'stroke="{SPINE_COLOUR}" stroke-width="11" stroke-opacity="0.3"/>')
        out.append(f'<text x="{_fmt(lx + 28)}" y="{_fmt(ly + 4)}" font-size="11" fill="#44403c">Cable bundle</text>')
    ly += 24
    lx = g.x0 - 30
    swatches = [(palette[c], setup.devices[c].get("label") or c) for c in computers]
    if any_shared:
        swatches.append((SHARED, "Shared"))
    swatches.append((INFRA, "Other"))
    for (f_, b_), name in swatches:
        out.append(f'<rect x="{_fmt(lx)}" y="{_fmt(ly - 8)}" width="22" height="12" rx="3" '
                   f'fill="{f_}" stroke="{b_}"/>')
        out.append(f'<text x="{_fmt(lx + 28)}" y="{_fmt(ly + 2)}" font-size="11" fill="#44403c">'
                   f"{escape(str(name))}</text>")
        lx += 50 + 7 * len(str(name))
    if any_planned:
        out.append(f'<rect x="{_fmt(lx)}" y="{_fmt(ly - 8)}" width="22" height="12" rx="3" fill="white" '
                   'stroke="#57534e" stroke-dasharray="4 2"/>')
        out.append(f'<text x="{_fmt(lx + 28)}" y="{_fmt(ly + 2)}" font-size="11" fill="#44403c">'
                   "Planned / to buy</text>")
    out.append("</svg>")
    return "\n".join(out)

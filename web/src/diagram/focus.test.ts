import { describe, expect, it } from "vitest";
import { parseSetup, type Setup } from "../model/setup";
import { focusSet, focusTarget } from "./focus";

function fixture(): Setup {
  const parsed = parseSetup(`
schema: deskmap/0.2
devices:
  laptop:
    name: Laptop
    kind: laptop
    radios: [bluetooth]
    ports:
      hdmi: { connector: hdmi }
  monitor:
    name: Monitor
    kind: monitor
    ports:
      hdmi_in: { connector: hdmi }
  mouse:
    name: Mouse
    kind: mouse
    radios: [bluetooth]
  lamp:
    name: Lamp
    kind: other
links:
  - { medium: wired, from: laptop.hdmi, to: monitor.hdmi_in }
  - { medium: wireless, from: mouse, to: laptop, radio: bluetooth }
`);
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  return parsed.setup;
}

const VIDEO = "laptop.hdmi--monitor.hdmi_in";
const MOUSE = "mouse~laptop";

describe("focusSet", () => {
  it("lights nothing specially when there is no target", () => {
    expect(focusSet(fixture(), null)).toBeNull();
  });

  it("lights a device, its wired and wireless links, and their far ends", () => {
    const lit = focusSet(fixture(), { kind: "device", id: "laptop" });
    expect([...lit!.devices].sort()).toEqual(["laptop", "monitor", "mouse"]);
    expect([...lit!.links].sort()).toEqual([VIDEO, MOUSE].sort());
  });

  it("lights a link and only its two devices", () => {
    const lit = focusSet(fixture(), { kind: "link", id: VIDEO });
    expect([...lit!.devices].sort()).toEqual(["laptop", "monitor"]);
    expect([...lit!.links]).toEqual([VIDEO]);
  });

  it("lights an unconnected device on its own", () => {
    const lit = focusSet(fixture(), { kind: "device", id: "lamp" });
    expect([...lit!.devices]).toEqual(["lamp"]);
    expect(lit!.links.size).toBe(0);
  });
});

describe("focusTarget", () => {
  it("prefers the hovered device over the selection", () => {
    expect(focusTarget("mouse", { kind: "link", id: VIDEO })).toEqual({ kind: "device", id: "mouse" });
  });

  it("falls back to the selection when nothing is hovered", () => {
    expect(focusTarget(null, { kind: "link", id: VIDEO })).toEqual({ kind: "link", id: VIDEO });
  });
});

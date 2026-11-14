import { describe, expect, it } from "vitest";
import {
  addDevice,
  addLink,
  addPort,
  moveDevice,
  removeDevice,
  removeLink,
  removePort,
  setLinkBend,
  uniqueId,
  updateDevice,
  updateLink,
  updatePort,
} from "./edit";
import { linkId, parseSetup, serializeSetup, type Setup } from "./setup";

function fixture(): Setup {
  const parsed = parseSetup(`
schema: deskmap/0.2
devices:
  laptop:
    name: Laptop
    kind: laptop
    radios: [bluetooth, wifi]
    ports:
      usb_c_1: { connector: usb_c, side: left }
      hdmi: { connector: hdmi, side: right }
  monitor:
    name: Monitor
    kind: monitor
    ports:
      hdmi_in: { connector: hdmi }
  mouse:
    name: Mouse
    kind: mouse
    radios: [bluetooth]
links:
  - { medium: wired, from: laptop.hdmi, to: monitor.hdmi_in }
  - { medium: wireless, from: mouse, to: laptop, radio: bluetooth }
layout:
  devices:
    laptop: { x: 0, y: 0 }
    monitor: { x: 300, y: 0 }
  links:
    laptop.hdmi--monitor.hdmi_in: { bend: { x: 150, y: -50 } }
    mouse~laptop: { bend: { x: 10, y: 10 } }
`);
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  return parsed.setup;
}

const HDMI = "laptop.hdmi--monitor.hdmi_in";
const BT = "mouse~laptop";

describe("renaming a device", () => {
  const renamed = updateDevice(fixture(), "laptop", fixture().devices.laptop!, "mbp");

  it("moves the device and its position to the new id", () => {
    expect(Object.keys(renamed.devices)).toEqual(["mbp", "monitor", "mouse"]);
    expect(renamed.layout.devices.mbp).toEqual({ x: 0, y: 0 });
    expect(renamed.layout.devices.laptop).toBeUndefined();
  });

  it("rewrites wired and wireless links that point at it", () => {
    expect(renamed.links).toEqual([
      { medium: "wired", from: "mbp.hdmi", to: "monitor.hdmi_in" },
      { medium: "wireless", from: "mouse", to: "mbp", radio: "bluetooth" },
    ]);
  });

  it("keeps each link's bend under the link's new id", () => {
    expect(renamed.layout.links).toEqual({
      "mbp.hdmi--monitor.hdmi_in": { bend: { x: 150, y: -50 } },
      "mouse~mbp": { bend: { x: 10, y: 10 } },
    });
  });

  it("refuses an id that is taken or malformed", () => {
    const setup = fixture();
    expect(updateDevice(setup, "laptop", setup.devices.laptop!, "monitor")).toBe(setup);
    expect(updateDevice(setup, "laptop", setup.devices.laptop!, "Bad Id")).toBe(setup);
  });
});

describe("editing device fields", () => {
  it("drops wireless links that use a radio the device no longer has", () => {
    const setup = fixture();
    const next = updateDevice(setup, "laptop", { ...setup.devices.laptop!, radios: ["wifi"] });
    expect(next.links.map(linkId)).toEqual([HDMI]);
    expect(next.layout.links[BT]).toBeUndefined();
  });
});

describe("removing a device", () => {
  it("drops its links, their bends and its position", () => {
    const next = removeDevice(fixture(), "laptop");
    expect(Object.keys(next.devices)).toEqual(["monitor", "mouse"]);
    expect(next.links).toEqual([]);
    expect(next.layout.links).toEqual({});
    expect(next.layout.devices).toEqual({ monitor: { x: 300, y: 0 } });
  });
});

describe("ports", () => {
  it("removing a port unplugs only the cable on that port", () => {
    const next = removePort(fixture(), "laptop", "hdmi");
    expect(Object.keys(next.devices.laptop!.ports)).toEqual(["usb_c_1"]);
    expect(next.links.map(linkId)).toEqual([BT]);
    expect(next.layout.links[HDMI]).toBeUndefined();
  });

  it("renaming a port rewires its cable and keeps the bend", () => {
    const setup = fixture();
    const next = updatePort(setup, "laptop", "hdmi", setup.devices.laptop!.ports.hdmi!, "hdmi_out");
    expect(Object.keys(next.devices.laptop!.ports)).toEqual(["usb_c_1", "hdmi_out"]);
    expect(next.links[0]).toEqual({ medium: "wired", from: "laptop.hdmi_out", to: "monitor.hdmi_in" });
    expect(next.layout.links["laptop.hdmi_out--monitor.hdmi_in"]).toEqual({ bend: { x: 150, y: -50 } });
  });

  it("refuses to add a port whose id is taken", () => {
    const setup = fixture();
    expect(addPort(setup, "laptop", "hdmi", { connector: "usb_c", side: "back" })).toBe(setup);
  });
});

describe("links", () => {
  it("adds a cable once, in either direction", () => {
    const setup = addLink(fixture(), { medium: "wired", from: "laptop.usb_c_1", to: "monitor.hdmi_in" });
    expect(setup.links).toHaveLength(3);
    const again = addLink(setup, { medium: "wired", from: "monitor.hdmi_in", to: "laptop.usb_c_1" });
    expect(again).toBe(setup);
  });

  it("refuses a link from a device to itself", () => {
    const setup = fixture();
    expect(addLink(setup, { medium: "wired", from: "laptop.hdmi", to: "laptop.usb_c_1" })).toBe(setup);
  });

  it("updating a link's details keeps its bend", () => {
    const next = updateLink(fixture(), HDMI, {
      medium: "wired",
      from: "laptop.hdmi",
      to: "monitor.hdmi_in",
      length_m: 2,
    });
    expect(next.links[0]).toMatchObject({ length_m: 2 });
    expect(next.layout.links[HDMI]).toEqual({ bend: { x: 150, y: -50 } });
  });

  it("removing a link drops its bend", () => {
    const next = removeLink(fixture(), HDMI);
    expect(next.links.map(linkId)).toEqual([BT]);
    expect(Object.keys(next.layout.links)).toEqual([BT]);
  });

  it("sets and clears a bend", () => {
    const bent = setLinkBend(fixture(), BT, { x: 1, y: 2 });
    expect(bent.layout.links[BT]).toEqual({ bend: { x: 1, y: 2 } });
    expect(setLinkBend(bent, BT, null).layout.links[BT]).toBeUndefined();
  });
});

describe("layout", () => {
  it("adds a device at a position and moves it", () => {
    const added = addDevice(fixture(), "dock", { name: "Dock", kind: "dock", ports: {} }, { x: 5, y: 5 });
    expect(moveDevice(added, "dock", { x: 9, y: 9 }).layout.devices.dock).toEqual({ x: 9, y: 9 });
  });

  it("picks a free id", () => {
    expect(uniqueId(["device", "device_2"], "device")).toBe("device_3");
    expect(uniqueId([], "device")).toBe("device");
  });
});

describe("every edit", () => {
  it("leaves a setup that serializes and parses back", () => {
    const setup = removePort(updateDevice(fixture(), "laptop", fixture().devices.laptop!, "mbp"), "mbp", "hdmi");
    const reparsed = parseSetup(serializeSetup(setup));
    expect(reparsed).toEqual({ ok: true, setup });
  });
});

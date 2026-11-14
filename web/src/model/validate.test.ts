import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, Setup } from "./setup";
import { validate } from "./validate";

function laptopWithMonitorAndMouse(overrides: Record<string, unknown> = {}): Setup {
  return Setup.parse({
    schema: SCHEMA_VERSION,
    devices: {
      laptop: {
        name: "Laptop",
        kind: "laptop",
        ports: { hdmi: { connector: "hdmi", label: "HDMI" }, usb_c: { connector: "usb_c", label: "USB-C" } },
        radios: ["bluetooth"],
      },
      monitor: { name: "Monitor", kind: "monitor", ports: { hdmi_in: { connector: "hdmi", label: "HDMI in" } } },
      mouse: { name: "Mouse", kind: "mouse", radios: ["bluetooth"] },
    },
    links: [
      { medium: "wired", from: "laptop.hdmi", to: "monitor.hdmi_in" },
      { medium: "wireless", from: "mouse", to: "laptop", radio: "bluetooth" },
    ],
    layout: {
      devices: { laptop: { x: 0, y: 0 }, monitor: { x: 300, y: 0 } },
      links: { "laptop.hdmi--monitor.hdmi_in": { bend: { x: 150, y: -50 } } },
    },
    ...overrides,
  });
}

function withExtraLinks(...links: unknown[]): Setup {
  const base = laptopWithMonitorAndMouse();
  return laptopWithMonitorAndMouse({ links: [...base.links, ...links] });
}

describe("validate", () => {
  it("reports nothing for a consistent setup", () => {
    expect(validate(laptopWithMonitorAndMouse())).toEqual([]);
  });

  it("errors when a cable plugs into a device that does not exist", () => {
    const issues = validate(withExtraLinks({ medium: "wired", from: "laptop.usb_c", to: "dock.usb_c_in" }));
    expect(issues).toEqual([
      expect.objectContaining({ level: "error", message: expect.stringContaining('no device called "dock"') }),
    ]);
  });

  it("errors when a cable plugs into a port the device does not have", () => {
    const issues = validate(withExtraLinks({ medium: "wired", from: "laptop.usb_c", to: "monitor.usb_c_in" }));
    expect(issues).toEqual([
      expect.objectContaining({
        level: "error",
        message: expect.stringContaining('Monitor has no port called "usb_c_in"'),
      }),
    ]);
  });

  it("errors when a wireless connection names a device that does not exist", () => {
    const issues = validate(withExtraLinks({ medium: "wireless", from: "headphones", to: "laptop", radio: "bluetooth" }));
    expect(issues).toEqual([
      expect.objectContaining({ level: "error", message: expect.stringContaining('no device called "headphones"') }),
    ]);
  });

  it("errors when two cables share one port, naming the port and device", () => {
    const issues = validate(withExtraLinks({ medium: "wired", from: "laptop.hdmi", to: "monitor.hdmi_in" }));
    expect(issues).toEqual([
      { level: "error", subject: { kind: "device", id: "laptop" }, message: expect.stringContaining('"HDMI" port on Laptop') },
      { level: "error", subject: { kind: "device", id: "monitor" }, message: expect.stringContaining('"HDMI in" port on Monitor') },
    ]);
  });

  it("warns when a wireless connection uses a radio a device lacks", () => {
    const issues = validate(withExtraLinks({ medium: "wireless", from: "monitor", to: "laptop", radio: "wifi" }));
    expect(issues).toEqual([
      expect.objectContaining({ level: "warning", subject: { kind: "link", id: "monitor~laptop" } }),
      expect.objectContaining({ level: "warning", subject: { kind: "link", id: "monitor~laptop" } }),
    ]);
    expect(issues.map((issue) => issue.message).join("\n")).toMatch(/Monitor .*Wi-Fi[\s\S]*Laptop .*Wi-Fi/);
  });

  it("warns when a cable connects a device to itself", () => {
    const issues = validate(withExtraLinks({ medium: "wired", from: "laptop.usb_c", to: "laptop.hdmi" }));
    expect(issues).toContainEqual({
      level: "warning",
      subject: { kind: "link", id: "laptop.usb_c--laptop.hdmi" },
      message: "A cable connects Laptop to itself.",
    });
  });

  it("warns about layout positions and bends that point at removed things", () => {
    const issues = validate(
      laptopWithMonitorAndMouse({
        layout: {
          devices: { laptop: { x: 0, y: 0 }, old_dock: { x: 10, y: 10 } },
          links: { "laptop.usb_c--old_dock.usb_c_in": { bend: { x: 5, y: 5 } } },
        },
      }),
    );
    expect(issues).toEqual([
      expect.objectContaining({ level: "warning", subject: { kind: "setup" }, message: expect.stringContaining('"old_dock"') }),
      expect.objectContaining({
        level: "warning",
        subject: { kind: "setup" },
        message: expect.stringContaining('"laptop.usb_c--old_dock.usb_c_in"'),
      }),
    ]);
  });
});

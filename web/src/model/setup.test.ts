import { describe, expect, it } from "vitest";
import { parseSetup, serializeSetup } from "./setup";
import type { Setup } from "./setup";
import { validate } from "./validate";

const exampleFiles = import.meta.glob<string>("../../../examples/*.deskmap.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
});

const LAPTOP_AND_MONITOR_YAML = `
schema: deskmap/0.2
name: Test desk
devices:
  laptop:
    name: Laptop
    kind: laptop
    ports:
      hdmi: { connector: hdmi, side: right, carries: [video] }
  monitor:
    name: Monitor
    ports:
      hdmi_in: { connector: hdmi }
links:
  - { medium: wired, from: laptop.hdmi, to: monitor.hdmi_in, length_m: 1.5 }
layout:
  devices:
    laptop: { x: 0, y: 0 }
    monitor: { x: 300, y: 0 }
`;

function parsedOrThrow(text: string): Setup {
  const result = parseSetup(text);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.setup;
}

function parseErrors(text: string): string[] {
  const result = parseSetup(text);
  return result.ok ? [] : result.errors;
}

describe("parseSetup and serializeSetup", () => {
  it("round-trips a setup through YAML unchanged", () => {
    const setup = parsedOrThrow(LAPTOP_AND_MONITOR_YAML);
    expect(parsedOrThrow(serializeSetup(setup))).toEqual(setup);
  });

  it("accepts JSON input", () => {
    const json = JSON.stringify({
      schema: "deskmap/0.2",
      devices: { mouse: { name: "Mouse", kind: "mouse", radios: ["bluetooth"] } },
    });
    expect(parsedOrThrow(json).devices.mouse?.radios).toEqual(["bluetooth"]);
  });

  it("fills in defaults for omitted fields", () => {
    const setup = parsedOrThrow(LAPTOP_AND_MONITOR_YAML);
    expect(setup.devices.monitor?.kind).toBe("other");
    expect(setup.devices.monitor?.ports.hdmi_in?.side).toBe("back");
    expect(parsedOrThrow("schema: deskmap/0.2").name).toBe("My desk");
  });

  it("explains where a malformed port reference is", () => {
    const errors = parseErrors(LAPTOP_AND_MONITOR_YAML.replace("to: monitor.hdmi_in", "to: monitor"));
    expect(errors).toEqual([expect.stringMatching(/^links\.0\.to: expected device\.port/)]);
  });

  it("rejects a file written for another schema version, naming the field", () => {
    const errors = parseErrors(LAPTOP_AND_MONITOR_YAML.replace("deskmap/0.2", "deskmap/0.1"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^schema: .*deskmap\/0\.2/);
  });

  it("reports text that is not YAML", () => {
    expect(parseErrors("devices: [unclosed")).toEqual([expect.stringMatching(/^not valid YAML or JSON/)]);
  });
});

describe("example files", () => {
  it("finds both shipped examples", () => {
    expect(Object.keys(exampleFiles).sort()).toEqual([
      "../../../examples/macbook-desk.deskmap.yaml",
      "../../../examples/standing-desk-pc-and-laptop.deskmap.yaml",
    ]);
  });

  it.each(Object.entries(exampleFiles))("%s parses and has no validation issues", (_path, text) => {
    expect(validate(parsedOrThrow(text))).toEqual([]);
  });
});

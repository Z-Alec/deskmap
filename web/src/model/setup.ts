import { z } from "zod";
import YAML from "yaml";

export const SCHEMA_VERSION = "deskmap/0.2";

const Id = z.string().regex(/^[a-z0-9_]+$/, "use lowercase letters, digits and _");

export const CONNECTORS = [
  "usb_c",
  "usb_a",
  "micro_usb",
  "lightning",
  "magsafe",
  "hdmi",
  "displayport",
  "mini_displayport",
  "ethernet",
  "audio_3_5mm",
  "barrel",
  "ac",
  "other",
] as const;
export const Connector = z.enum(CONNECTORS);
export type Connector = z.infer<typeof Connector>;

export const SIGNALS = ["data", "video", "audio", "power_in", "power_out"] as const;
export const Signal = z.enum(SIGNALS);
export type Signal = z.infer<typeof Signal>;

export const SIDES = ["back", "left", "right", "front"] as const;
export const Side = z.enum(SIDES);
export type Side = z.infer<typeof Side>;

export const RADIOS = ["bluetooth", "rf_2_4ghz", "wifi"] as const;
export const Radio = z.enum(RADIOS);
export type Radio = z.infer<typeof Radio>;

export const DEVICE_KINDS = [
  "laptop",
  "desktop",
  "monitor",
  "dock",
  "hub",
  "adapter",
  "keyboard",
  "mouse",
  "trackpad",
  "headphones",
  "speaker",
  "microphone",
  "webcam",
  "receiver",
  "charger",
  "power_strip",
  "wall",
  "other",
] as const;
export const DeviceKind = z.enum(DEVICE_KINDS);
export type DeviceKind = z.infer<typeof DeviceKind>;

export const Port = z.object({
  label: z.string().optional(),
  connector: Connector,
  side: Side.default("back"),
  carries: z.array(Signal).optional(),
});
export type Port = z.infer<typeof Port>;

export const Device = z.object({
  name: z.string().min(1),
  kind: DeviceKind.default("other"),
  model: z.string().optional(),
  ports: z.record(Id, Port).default({}),
  radios: z.array(Radio).optional(),
  battery: z.boolean().optional(),
  notes: z.string().optional(),
});
export type Device = z.infer<typeof Device>;

export type PortRef = `${string}.${string}`;
const PortRefSchema = z.custom<PortRef>(
  (v) => typeof v === "string" && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(v),
  "expected device.port, e.g. laptop.usb_c_left_1",
);

export const WiredLink = z.object({
  medium: z.literal("wired"),
  from: PortRefSchema,
  to: PortRefSchema,
  length_m: z.number().positive().optional(),
  note: z.string().optional(),
});
export type WiredLink = z.infer<typeof WiredLink>;

export const WirelessLink = z.object({
  medium: z.literal("wireless"),
  from: Id,
  to: Id,
  radio: Radio,
  note: z.string().optional(),
});
export type WirelessLink = z.infer<typeof WirelessLink>;

export const Link = z.discriminatedUnion("medium", [WiredLink, WirelessLink]);
export type Link = z.infer<typeof Link>;

export const Point = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof Point>;

export const Layout = z.object({
  devices: z.record(Id, Point).default({}),
  links: z.record(z.string(), z.object({ bend: Point })).default({}),
});
export type Layout = z.infer<typeof Layout>;

export const Setup = z.object({
  schema: z.literal(SCHEMA_VERSION),
  name: z.string().default("My desk"),
  devices: z.record(Id, Device).default({}),
  links: z.array(Link).default([]),
  layout: Layout.default({ devices: {}, links: {} }),
});
export type Setup = z.infer<typeof Setup>;

export function splitPortRef(ref: PortRef): { device: string; port: string } {
  const [device = "", port = ""] = ref.split(".");
  return { device, port };
}

export function linkEnds(link: Link): [string, string] {
  return link.medium === "wired"
    ? [splitPortRef(link.from).device, splitPortRef(link.to).device]
    : [link.from, link.to];
}

export function linkId(link: Link): string {
  return link.medium === "wired" ? `${link.from}--${link.to}` : `${link.from}~${link.to}`;
}

export function emptySetup(): Setup {
  return { schema: SCHEMA_VERSION, name: "My desk", devices: {}, links: [], layout: { devices: {}, links: {} } };
}

export type ParseResult = { ok: true; setup: Setup } | { ok: false; errors: string[] };

export function parseSetup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (e) {
    return { ok: false, errors: [`not valid YAML or JSON: ${(e as Error).message}`] };
  }
  const result = Setup.safeParse(raw);
  if (result.success) return { ok: true, setup: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

export function serializeSetup(setup: Setup): string {
  return YAML.stringify(setup, { aliasDuplicateObjects: false });
}

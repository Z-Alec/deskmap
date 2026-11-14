import type { Connector, Port, Radio, Setup, Signal, WiredLink } from "../model/setup";
import { splitPortRef } from "../model/setup";

export type CableFamily = "power" | "video" | "data";
export type LinkLook = CableFamily | "wireless";

const CONNECTOR_FAMILY: Record<Connector, CableFamily> = {
  usb_c: "data",
  usb_a: "data",
  micro_usb: "data",
  lightning: "data",
  magsafe: "power",
  hdmi: "video",
  displayport: "video",
  mini_displayport: "video",
  ethernet: "data",
  audio_3_5mm: "data",
  barrel: "power",
  ac: "power",
  other: "data",
};

const POWER_SIGNALS: ReadonlySet<Signal> = new Set(["power_in", "power_out"]);

export function portFamily(port: Port): CableFamily {
  const carries = port.carries ?? [];
  if (carries.length > 0 && carries.every((s) => POWER_SIGNALS.has(s))) return "power";
  if (carries.includes("video") && !carries.includes("data")) return "video";
  return CONNECTOR_FAMILY[port.connector];
}

const FAMILY_PRIORITY: CableFamily[] = ["power", "video", "data"];

export function cableFamily(setup: Setup, link: WiredLink): CableFamily {
  const families = [link.from, link.to].map((ref) => {
    const { device, port } = splitPortRef(ref);
    const found = setup.devices[device]?.ports[port];
    return found ? portFamily(found) : "data";
  });
  return FAMILY_PRIORITY.find((family) => families.includes(family)) ?? "data";
}

export const LOOK_COLOR: Record<LinkLook, string> = {
  power: "#d9480f",
  video: "#7048e8",
  data: "#1971c2",
  wireless: "#0ca678",
};

export const LOOK_LABEL: Record<LinkLook, string> = {
  power: "Power cable",
  video: "Video cable",
  data: "Data cable",
  wireless: "Wireless",
};

export const RADIO_LABEL: Record<Radio, string> = {
  bluetooth: "Bluetooth",
  rf_2_4ghz: "2.4 GHz",
  wifi: "Wi-Fi",
};

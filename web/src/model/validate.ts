import { linkId, splitPortRef } from "./setup";
import type { Link, PortRef, Setup, WiredLink, WirelessLink } from "./setup";

export type Issue = {
  level: "error" | "warning";
  subject: { kind: "device"; id: string } | { kind: "link"; id: string } | { kind: "setup" };
  message: string;
};

type Rule = (setup: Setup) => Issue[];

const RADIO_NAMES: Record<WirelessLink["radio"], string> = {
  bluetooth: "Bluetooth",
  rf_2_4ghz: "a 2.4 GHz wireless receiver",
  wifi: "Wi-Fi",
};

function deviceName(setup: Setup, deviceId: string): string {
  return setup.devices[deviceId]?.name ?? deviceId;
}

function portName(setup: Setup, deviceId: string, portId: string): string {
  return setup.devices[deviceId]?.ports[portId]?.label ?? portId;
}

function wiredLinks(setup: Setup): WiredLink[] {
  return setup.links.filter((link): link is WiredLink => link.medium === "wired");
}

function wirelessLinks(setup: Setup): WirelessLink[] {
  return setup.links.filter((link): link is WirelessLink => link.medium === "wireless");
}

function linkSubject(link: Link): Issue["subject"] {
  return { kind: "link", id: linkId(link) };
}

function missingPortEndIssue(setup: Setup, link: WiredLink, ref: PortRef): Issue | null {
  const { device: deviceId, port: portId } = splitPortRef(ref);
  const device = setup.devices[deviceId];
  if (!device) {
    return {
      level: "error",
      subject: linkSubject(link),
      message: `A cable plugs into "${deviceId}", but there is no device called "${deviceId}".`,
    };
  }
  if (!device.ports[portId]) {
    return {
      level: "error",
      subject: linkSubject(link),
      message: `A cable plugs into port "${portId}" on ${device.name}, but ${device.name} has no port called "${portId}".`,
    };
  }
  return null;
}

const wiredLinkEndsExist: Rule = (setup) =>
  wiredLinks(setup).flatMap((link) =>
    [link.from, link.to].flatMap((ref) => missingPortEndIssue(setup, link, ref) ?? []),
  );

const wirelessLinkEndsExist: Rule = (setup) =>
  wirelessLinks(setup).flatMap((link) =>
    [link.from, link.to]
      .filter((deviceId) => !setup.devices[deviceId])
      .map((deviceId) => ({
        level: "error" as const,
        subject: linkSubject(link),
        message: `A wireless connection goes to "${deviceId}", but there is no device called "${deviceId}".`,
      })),
  );

const onePlugPerPort: Rule = (setup) => {
  const cablesPerPort = new Map<PortRef, number>();
  for (const link of wiredLinks(setup)) {
    for (const ref of [link.from, link.to]) cablesPerPort.set(ref, (cablesPerPort.get(ref) ?? 0) + 1);
  }
  return [...cablesPerPort]
    .filter(([, cableCount]) => cableCount > 1)
    .map(([ref, cableCount]) => {
      const { device: deviceId, port: portId } = splitPortRef(ref);
      return {
        level: "error" as const,
        subject: { kind: "device" as const, id: deviceId },
        message: `The "${portName(setup, deviceId, portId)}" port on ${deviceName(setup, deviceId)} has ${cableCount} cables plugged into it, but a port only fits one.`,
      };
    });
};

const wirelessRadiosDeclared: Rule = (setup) =>
  wirelessLinks(setup).flatMap((link) =>
    [link.from, link.to]
      .filter((deviceId) => {
        const device = setup.devices[deviceId];
        return device !== undefined && !(device.radios ?? []).includes(link.radio);
      })
      .map((deviceId) => ({
        level: "warning" as const,
        subject: linkSubject(link),
        message: `${deviceName(setup, deviceId)} connects using ${RADIO_NAMES[link.radio]}, but it is not marked as having ${RADIO_NAMES[link.radio]}.`,
      })),
  );

const noSelfCables: Rule = (setup) =>
  wiredLinks(setup)
    .filter((link) => splitPortRef(link.from).device === splitPortRef(link.to).device)
    .map((link): Issue => {
      const deviceId = splitPortRef(link.from).device;
      return {
        level: "warning",
        subject: linkSubject(link),
        message: `A cable connects ${deviceName(setup, deviceId)} to itself.`,
      };
    });

const layoutPointsAtExistingThings: Rule = (setup) => {
  const currentLinkIds = new Set(setup.links.map(linkId));
  const stalePositions = Object.keys(setup.layout.devices)
    .filter((deviceId) => !setup.devices[deviceId])
    .map((deviceId) => ({
      level: "warning" as const,
      subject: { kind: "setup" as const },
      message: `The layout has a saved position for "${deviceId}", but that device no longer exists.`,
    }));
  const staleBends = Object.keys(setup.layout.links)
    .filter((savedLinkId) => !currentLinkIds.has(savedLinkId))
    .map((savedLinkId) => ({
      level: "warning" as const,
      subject: { kind: "setup" as const },
      message: `The layout has a saved bend for the connection "${savedLinkId}", but that connection no longer exists.`,
    }));
  return [...stalePositions, ...staleBends];
};

const RULES: readonly Rule[] = [
  wiredLinkEndsExist,
  wirelessLinkEndsExist,
  onePlugPerPort,
  wirelessRadiosDeclared,
  noSelfCables,
  layoutPointsAtExistingThings,
];

export function validate(setup: Setup): Issue[] {
  return RULES.flatMap((rule) => rule(setup));
}

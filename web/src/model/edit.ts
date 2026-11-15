import {
  linkEnds,
  linkId,
  splitPortRef,
  type Device,
  type Link,
  type Point,
  type Port,
  type PortRef,
  type Radio,
  type Setup,
  type WiredLink,
} from "./setup";

export const ID_PATTERN = /^[a-z0-9_]+$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function uniqueId(taken: Iterable<string>, base: string): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

function renameKey<V>(record: Record<string, V>, from: string, to: string): Record<string, V> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k === from ? to : k, v]));
}

function withoutKey<V>(record: Record<string, V>, key: string): Record<string, V> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

function rewriteLinks(setup: Setup, rewrite: (link: Link) => Link | null): Setup {
  const links: Link[] = [];
  const bends: Setup["layout"]["links"] = {};
  for (const link of setup.links) {
    const next = rewrite(link);
    if (!next) continue;
    links.push(next);
    const bend = setup.layout.links[linkId(link)];
    if (bend) bends[linkId(next)] = bend;
  }
  return { ...setup, links, layout: { ...setup.layout, links: bends } };
}

function portRef(device: string, port: string): PortRef {
  return `${device}.${port}`;
}

function wiredTouches(link: WiredLink, device: string, port?: string): boolean {
  return [link.from, link.to].some((ref) => {
    const end = splitPortRef(ref);
    return end.device === device && (port === undefined || end.port === port);
  });
}

function touchesDevice(link: Link, device: string): boolean {
  return link.medium === "wired" ? wiredTouches(link, device) : link.from === device || link.to === device;
}

export function addDevice(setup: Setup, id: string, device: Device, position: Point): Setup {
  if (!isValidId(id) || setup.devices[id]) return setup;
  return {
    ...setup,
    devices: { ...setup.devices, [id]: device },
    layout: { ...setup.layout, devices: { ...setup.layout.devices, [id]: position } },
  };
}

export function updateDevice(setup: Setup, id: string, device: Device, nextId: string = id): Setup {
  const current = setup.devices[id];
  if (!current) return setup;
  if (nextId !== id && (!isValidId(nextId) || setup.devices[nextId])) return setup;

  const keptRadios = new Set<Radio>(device.radios ?? []);
  const lostRadio = (link: Link) =>
    link.medium === "wireless" && touchesDevice(link, id) && !keptRadios.has(link.radio);
  const withoutLostRadios = rewriteLinks(setup, (link) => (lostRadio(link) ? null : link));
  const updated = { ...withoutLostRadios, devices: { ...withoutLostRadios.devices, [id]: device } };
  return nextId === id ? updated : renameDevice(updated, id, nextId);
}

function renameDevice(setup: Setup, from: string, to: string): Setup {
  const renameRef = (ref: PortRef): PortRef => {
    const end = splitPortRef(ref);
    return end.device === from ? portRef(to, end.port) : ref;
  };
  const renameEnd = (end: string) => (end === from ? to : end);
  const relinked = rewriteLinks(setup, (link) =>
    link.medium === "wired"
      ? { ...link, from: renameRef(link.from), to: renameRef(link.to) }
      : { ...link, from: renameEnd(link.from), to: renameEnd(link.to) },
  );
  return {
    ...relinked,
    devices: renameKey(relinked.devices, from, to),
    layout: { ...relinked.layout, devices: renameKey(relinked.layout.devices, from, to) },
  };
}

export function removeDevice(setup: Setup, id: string): Setup {
  if (!setup.devices[id]) return setup;
  const unlinked = rewriteLinks(setup, (link) => (touchesDevice(link, id) ? null : link));
  return {
    ...unlinked,
    devices: withoutKey(unlinked.devices, id),
    layout: { ...unlinked.layout, devices: withoutKey(unlinked.layout.devices, id) },
  };
}

function replacePorts(setup: Setup, deviceId: string, ports: Record<string, Port>): Setup {
  const device = setup.devices[deviceId];
  if (!device) return setup;
  return { ...setup, devices: { ...setup.devices, [deviceId]: { ...device, ports } } };
}

export function addPort(setup: Setup, deviceId: string, portId: string, port: Port): Setup {
  const device = setup.devices[deviceId];
  if (!device || !isValidId(portId) || device.ports[portId]) return setup;
  return replacePorts(setup, deviceId, { ...device.ports, [portId]: port });
}

export function updatePort(
  setup: Setup,
  deviceId: string,
  portId: string,
  port: Port,
  nextPortId: string = portId,
): Setup {
  const device = setup.devices[deviceId];
  if (!device?.ports[portId]) return setup;
  if (nextPortId !== portId && (!isValidId(nextPortId) || device.ports[nextPortId])) return setup;

  const ports = renameKey({ ...device.ports, [portId]: port }, portId, nextPortId);
  const updated = replacePorts(setup, deviceId, ports);
  if (nextPortId === portId) return updated;

  const oldRef = portRef(deviceId, portId);
  const newRef = portRef(deviceId, nextPortId);
  const renameRef = (ref: PortRef) => (ref === oldRef ? newRef : ref);
  return rewriteLinks(updated, (link) =>
    link.medium === "wired" ? { ...link, from: renameRef(link.from), to: renameRef(link.to) } : link,
  );
}

export function removePort(setup: Setup, deviceId: string, portId: string): Setup {
  const device = setup.devices[deviceId];
  if (!device?.ports[portId]) return setup;
  const unplugged = rewriteLinks(setup, (link) =>
    link.medium === "wired" && wiredTouches(link, deviceId, portId) ? null : link,
  );
  return replacePorts(unplugged, deviceId, withoutKey(device.ports, portId));
}

export function addLink(setup: Setup, link: Link): Setup {
  const [a, b] = linkEnds(link);
  if (a === b) return setup;
  const sameEnds = (existing: Link) =>
    existing.medium === link.medium &&
    ((existing.from === link.from && existing.to === link.to) ||
      (existing.from === link.to && existing.to === link.from));
  if (setup.links.some(sameEnds)) return setup;
  return { ...setup, links: [...setup.links, link] };
}

export function updateLink(setup: Setup, id: string, link: Link): Setup {
  if (!setup.links.some((existing) => linkId(existing) === id)) return setup;
  return rewriteLinks(setup, (existing) => (linkId(existing) === id ? link : existing));
}

export function removeLink(setup: Setup, id: string): Setup {
  return rewriteLinks(setup, (link) => (linkId(link) === id ? null : link));
}

export function moveDevice(setup: Setup, id: string, position: Point): Setup {
  if (!setup.devices[id]) return setup;
  return { ...setup, layout: { ...setup.layout, devices: { ...setup.layout.devices, [id]: position } } };
}

export function setLinkBend(setup: Setup, id: string, bend: Point | null): Setup {
  if (!setup.links.some((link) => linkId(link) === id)) return setup;
  const links = bend ? { ...setup.layout.links, [id]: { bend } } : withoutKey(setup.layout.links, id);
  return { ...setup, layout: { ...setup.layout, links } };
}

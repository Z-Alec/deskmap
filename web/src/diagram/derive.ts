import type { Connection, Edge, Node } from "@xyflow/react";
import { linkId, splitPortRef, type Device, type Link, type Point, type Setup } from "../model/setup";
import type { Selection } from "../selection";
import { cableFamily, type LinkLook } from "./palette";

export const RADIO_HANDLE = "~radio";

export type Size = { width: number; height: number };

export type DeviceNodeData = { device: Device; pluggedPorts: ReadonlySet<string> };
export type DeviceNode = Node<DeviceNodeData, "device">;

export type LinkEdgeData = { link: Link; look: LinkLook; bend: Point | undefined };
export type LinkEdge = Edge<LinkEdgeData, "link">;

const GRID_COLUMNS = 4;
const GRID_CELL = { x: 320, y: 260 };

function gridSlot(index: number): Point {
  return { x: (index % GRID_COLUMNS) * GRID_CELL.x, y: Math.floor(index / GRID_COLUMNS) * GRID_CELL.y };
}

function pluggedPortsByDevice(setup: Setup): Map<string, Set<string>> {
  const plugged = new Map<string, Set<string>>();
  for (const link of setup.links) {
    if (link.medium !== "wired") continue;
    for (const ref of [link.from, link.to]) {
      const { device, port } = splitPortRef(ref);
      plugged.set(device, (plugged.get(device) ?? new Set()).add(port));
    }
  }
  return plugged;
}

export function toNodes(setup: Setup, selection: Selection, sizes: Record<string, Size>): DeviceNode[] {
  const plugged = pluggedPortsByDevice(setup);
  return Object.entries(setup.devices).map(([id, device], index) => ({
    id,
    type: "device",
    position: setup.layout.devices[id] ?? gridSlot(index),
    data: { device, pluggedPorts: plugged.get(id) ?? new Set() },
    selected: selection?.kind === "device" && selection.id === id,
    measured: sizes[id],
  }));
}

export function toEdges(setup: Setup, selection: Selection): LinkEdge[] {
  return setup.links.map((link) => {
    const id = linkId(link);
    const ends =
      link.medium === "wired"
        ? {
            source: splitPortRef(link.from).device,
            sourceHandle: splitPortRef(link.from).port,
            target: splitPortRef(link.to).device,
            targetHandle: splitPortRef(link.to).port,
          }
        : { source: link.from, sourceHandle: RADIO_HANDLE, target: link.to, targetHandle: RADIO_HANDLE };
    return {
      id,
      type: "link",
      ...ends,
      animated: link.medium === "wireless",
      selected: selection?.kind === "link" && selection.id === id,
      data: {
        link,
        look: link.medium === "wired" ? cableFamily(setup, link) : "wireless",
        bend: setup.layout.links[id]?.bend,
      },
    };
  });
}

type ConnectionAttempt = Pick<Connection, "source" | "target"> & {
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export function connectionToLink(setup: Setup, connection: ConnectionAttempt): Link | null {
  const { source, target, sourceHandle, targetHandle } = connection;
  if (!sourceHandle || !targetHandle || source === target) return null;
  const radioEnds = [sourceHandle, targetHandle].filter((handle) => handle === RADIO_HANDLE).length;
  if (radioEnds === 0) return { medium: "wired", from: `${source}.${sourceHandle}`, to: `${target}.${targetHandle}` };
  if (radioEnds === 1) return null;
  const targetRadios = setup.devices[target]?.radios ?? [];
  const radio = setup.devices[source]?.radios?.find((r) => targetRadios.includes(r));
  return radio ? { medium: "wireless", from: source, to: target, radio } : null;
}

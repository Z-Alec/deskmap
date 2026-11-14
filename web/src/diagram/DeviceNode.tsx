import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import { SIDES, type Port, type Side } from "../model/setup";
import { RADIO_HANDLE, type DeviceNode } from "./derive";
import { RADIO_LABEL, portFamily } from "./palette";

const SIDE_POSITION: Record<Side, Position> = {
  back: Position.Top,
  front: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
};

const EDGE_LABEL_ROW = 26;
const HEADER_HEIGHT = 48;
const RADIO_LINE = 16;
const SIDE_ROW = 30;
const PORT_SPACING = 96;
const MIN_WIDTH = 190;
const TWO_SIDED_MIN_WIDTH = 260;

type PortEntry = [id: string, port: Port];
type PortsBySide = Record<Side, PortEntry[]>;

function groupBySide(ports: Record<string, Port>): PortsBySide {
  const groups: PortsBySide = { back: [], front: [], left: [], right: [] };
  for (const entry of Object.entries(ports)) groups[entry[1].side].push(entry);
  return groups;
}

function nodeGeometry(sides: PortsBySide, hasRadios: boolean) {
  const top = sides.back.length > 0 ? EDGE_LABEL_ROW : 0;
  const bottom = sides.front.length > 0 ? EDGE_LABEL_ROW : 0;
  const rows = Math.max(sides.left.length, sides.right.length);
  const header = HEADER_HEIGHT + (hasRadios ? RADIO_LINE : 0);
  const twoSided = sides.left.length > 0 && sides.right.length > 0;
  return {
    paddingTop: top,
    width: Math.max(twoSided ? TWO_SIDED_MIN_WIDTH : MIN_WIDTH, (Math.max(sides.back.length, sides.front.length) + 1) * PORT_SPACING),
    height: top + header + rows * SIDE_ROW + bottom + 8,
    sideRowTop: (index: number) => top + header + index * SIDE_ROW + SIDE_ROW / 2,
  };
}

function handleOffset(side: Side, index: number, count: number, sideRowTop: (i: number) => number): CSSProperties {
  if (side === "left" || side === "right") return { top: sideRowTop(index) };
  return { left: `${((index + 1) / (count + 1)) * 100}%` };
}

export function DeviceNodeView({ data, selected }: NodeProps<DeviceNode>) {
  const { device, pluggedPorts } = data;
  const sides = groupBySide(device.ports);
  const radios = device.radios ?? [];
  const geometry = nodeGeometry(sides, radios.length > 0);
  const radioNames = radios.map((r) => RADIO_LABEL[r]).join(" · ");

  return (
    <div
      className={`device${selected ? " selected" : ""}`}
      style={{ width: geometry.width, height: geometry.height, paddingTop: geometry.paddingTop }}
    >
      <div className="device-name">{device.name}</div>
      <div className="device-meta">
        {device.kind}
        {device.model ? ` · ${device.model}` : ""}
        {device.battery ? " · battery" : ""}
      </div>
      {radioNames && <div className="device-radios">{radioNames}</div>}
      {SIDES.flatMap((side) =>
        sides[side].map(([portId, port], index, all) => (
          <Handle
            key={portId}
            id={portId}
            type="source"
            position={SIDE_POSITION[side]}
            className={`port port-${side} family-${portFamily(port)}${pluggedPorts.has(portId) ? " plugged" : ""}`}
            style={handleOffset(side, index, all.length, geometry.sideRowTop)}
            title={`${portId} (${port.connector})`}
          >
            <span className="port-label">
              {port.label ?? portId} <small>{port.connector}</small>
            </span>
          </Handle>
        )),
      )}
      {radios.length > 0 && (
        <Handle
          id={RADIO_HANDLE}
          type="source"
          position={Position.Top}
          className="radio-handle"
          style={{ left: "100%" }}
          title={`Wireless: ${radioNames}`}
        />
      )}
    </div>
  );
}

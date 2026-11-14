import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { createContext, useContext, type PointerEvent } from "react";
import type { Point } from "../model/setup";
import type { LinkEdge } from "./derive";
import { LOOK_COLOR, RADIO_LABEL } from "./palette";

export type SetBend = (linkId: string, bend: Point | null) => void;
export const SetBendContext = createContext<SetBend>(() => {});

function pathThrough(source: Point, bend: Point, target: Point): string {
  const control = { x: 2 * bend.x - (source.x + target.x) / 2, y: 2 * bend.y - (source.y + target.y) / 2 };
  return `M ${source.x},${source.y} Q ${control.x},${control.y} ${target.x},${target.y}`;
}

function placeAt(point: Point, shift = "-50%, -50%"): string {
  return `translate(${shift}) translate(${point.x}px, ${point.y}px)`;
}

export function LinkEdgeView(props: EdgeProps<LinkEdge>) {
  const { id, data, selected, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const setBend = useContext(SetBendContext);
  const { screenToFlowPosition } = useReactFlow();
  if (!data) return null;

  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const [curve, midX, midY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const path = data.bend ? pathThrough(source, data.bend, target) : curve;
  const handleAt = data.bend ?? { x: midX, y: midY };
  const wireless = data.link.medium === "wireless" ? data.link : null;

  function dragBend(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setBend(id, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`link link-${data.look}`}
        style={{ stroke: LOOK_COLOR[data.look], strokeWidth: selected ? 4 : 2.5 }}
      />
      <EdgeLabelRenderer>
        {wireless && (
          <div className="edge-label" style={{ transform: placeAt(handleAt, "-50%, -160%"), color: LOOK_COLOR.wireless }}>
            {RADIO_LABEL[wireless.radio]}
          </div>
        )}
        {selected && (
          <div
            className="bend-handle nodrag nopan"
            title="Drag to bend. Double-click to straighten."
            style={{ transform: placeAt(handleAt), borderColor: LOOK_COLOR[data.look] }}
            onPointerDown={(event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={dragBend}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            onDoubleClick={() => setBend(id, null)}
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
}

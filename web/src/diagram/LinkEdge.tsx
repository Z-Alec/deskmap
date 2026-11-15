import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useReactFlow, type EdgeProps } from "@xyflow/react";
import { createContext, useContext, type PointerEvent } from "react";
import type { Point } from "../model/setup";
import { routeCable, type MiddleSegmentAxis } from "./cable-route";
import type { LinkEdge } from "./derive";
import { LOOK_COLOR, RADIO_LABEL } from "./palette";

export type SetBend = (linkId: string, bend: Point | null) => void;
export const SetBendContext = createContext<SetBend>(() => {});

const PORT_EXIT_DISTANCE = 60;
const PORT_EXIT_DIRECTION: Record<Position, Point> = {
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 },
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
};

function awayFromPort(port: Point, side: Position): Point {
  const direction = PORT_EXIT_DIRECTION[side];
  return { x: port.x + direction.x * PORT_EXIT_DISTANCE, y: port.y + direction.y * PORT_EXIT_DISTANCE };
}

function pathThrough(source: Point, sourceSide: Position, bend: Point, target: Point, targetSide: Position): string {
  const tangent = { x: (target.x - source.x) / 4, y: (target.y - source.y) / 4 };
  const leaveSource = awayFromPort(source, sourceSide);
  const enterTarget = awayFromPort(target, targetSide);
  return [
    `M ${source.x},${source.y}`,
    `C ${leaveSource.x},${leaveSource.y} ${bend.x - tangent.x},${bend.y - tangent.y} ${bend.x},${bend.y}`,
    `C ${bend.x + tangent.x},${bend.y + tangent.y} ${enterTarget.x},${enterTarget.y} ${target.x},${target.y}`,
  ].join(" ");
}

type DragFreedom = MiddleSegmentAxis | "both";
type EdgeRoute = { path: string; handle: Point; movableAxis: DragFreedom | null };

const DRAG_CURSOR: Record<DragFreedom, string> = { x: "ew-resize", y: "ns-resize", both: "move" };

function airRoute(
  source: Point,
  sourceSide: Position,
  target: Point,
  targetSide: Position,
  bend: Point | undefined,
): EdgeRoute {
  const [curve, midX, midY] = getBezierPath({
    sourceX: source.x,
    sourceY: source.y,
    sourcePosition: sourceSide,
    targetX: target.x,
    targetY: target.y,
    targetPosition: targetSide,
  });
  return {
    path: bend ? pathThrough(source, sourceSide, bend, target, targetSide) : curve,
    handle: bend ?? { x: midX, y: midY },
    movableAxis: "both",
  };
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
  const wireless = data.link.medium === "wireless" ? data.link : null;
  const route: EdgeRoute = wireless
    ? airRoute(source, sourcePosition, target, targetPosition, data.bend)
    : routeCable({ at: source, side: sourcePosition }, { at: target, side: targetPosition }, data.bend);

  function dragBend(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setBend(id, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={route.path}
        className={`link link-${data.look}`}
        style={{ stroke: LOOK_COLOR[data.look], strokeWidth: selected ? 4 : 2.5 }}
      />
      <EdgeLabelRenderer>
        {wireless && (
          <div className="edge-label" style={{ transform: placeAt(route.handle, "-50%, -160%"), color: LOOK_COLOR.wireless }}>
            {RADIO_LABEL[wireless.radio]}
          </div>
        )}
        {selected && route.movableAxis && (
          <div
            className="bend-handle nodrag nopan"
            title={wireless ? "Drag to bend. Double-click to straighten." : "Drag to move this run. Double-click to reset."}
            style={{
              transform: placeAt(route.handle),
              borderColor: LOOK_COLOR[data.look],
              cursor: DRAG_CURSOR[route.movableAxis],
            }}
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

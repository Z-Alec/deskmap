import { getSmoothStepPath, Position } from "@xyflow/react";
import type { Point } from "../model/setup";

export const PORT_STUB_LENGTH = 24;
export const CORNER_RADIUS = 8;
const PROBE_SHIFT = 10;

export type MiddleSegmentAxis = "x" | "y";

export type PortAnchor = { at: Point; side: Position };

export type CableRoute = {
  path: string;
  handle: Point;
  movableAxis: MiddleSegmentAxis | null;
};

const OUTWARD: Record<Position, Point> = {
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 },
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
};

function normalAxis(side: Position): MiddleSegmentAxis {
  return OUTWARD[side].x === 0 ? "y" : "x";
}

function stubEnd(port: PortAnchor): Point {
  const outward = OUTWARD[port.side];
  return { x: port.at.x + outward.x * PORT_STUB_LENGTH, y: port.at.y + outward.y * PORT_STUB_LENGTH };
}

function atLeastStubAway(port: PortAnchor, wanted: number): number {
  const axis = normalAxis(port.side);
  const limit = stubEnd(port)[axis];
  return OUTWARD[port.side][axis] > 0 ? Math.max(wanted, limit) : Math.min(wanted, limit);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function stepToward(from: Point, to: Point, length: number): Point {
  const scale = length / distance(from, to);
  return { x: from.x + (to.x - from.x) * scale, y: from.y + (to.y - from.y) * scale };
}

function isStraightThrough(a: Point, b: Point, c: Point): boolean {
  return (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
}

function withoutRedundantPoints(points: Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept.at(-1);
    if (last && last.x === point.x && last.y === point.y) continue;
    const beforeLast = kept.at(-2);
    if (last && beforeLast && isStraightThrough(beforeLast, last, point)) kept.pop();
    kept.push(point);
  }
  return kept;
}

function roundedPolyline(points: Point[]): string {
  const route = withoutRedundantPoints(points);
  return route
    .map((corner, index) => {
      const previous = route[index - 1];
      const next = route[index + 1];
      if (!previous) return `M${corner.x} ${corner.y}`;
      if (!next) return `L${corner.x} ${corner.y}`;
      const size = Math.min(distance(previous, corner) / 2, distance(corner, next) / 2, CORNER_RADIUS);
      const enter = stepToward(corner, previous, size);
      const leave = stepToward(corner, next, size);
      return `L${enter.x} ${enter.y} Q${corner.x} ${corner.y} ${leave.x} ${leave.y}`;
    })
    .join(" ");
}

function sameSideRoute(source: PortAnchor, target: PortAnchor, bend: Point | undefined): CableRoute {
  const axis = normalAxis(source.side);
  const automatic = atLeastStubAway(source, atLeastStubAway(target, source.at[axis]));
  const line = atLeastStubAway(source, atLeastStubAway(target, bend?.[axis] ?? automatic));
  const leave = { ...source.at, [axis]: line };
  const arrive = { ...target.at, [axis]: line };
  return {
    path: roundedPolyline([source.at, leave, arrive, target.at]),
    handle: midpoint(leave, arrive),
    movableAxis: axis,
  };
}

function perpendicularRoute(source: PortAnchor, target: PortAnchor, bend: Point | undefined): CableRoute {
  const axis = normalAxis(source.side);
  const targetStub = stubEnd(target);
  const line = atLeastStubAway(source, bend?.[axis] ?? target.at[axis]);
  const leave = { ...source.at, [axis]: line };
  const approach = { ...targetStub, [axis]: line };
  return {
    path: roundedPolyline([source.at, leave, approach, targetStub, target.at]),
    handle: midpoint(leave, approach),
    movableAxis: axis,
  };
}

function smoothStep(source: PortAnchor, target: PortAnchor, center: Partial<Point>) {
  return getSmoothStepPath({
    sourceX: source.at.x,
    sourceY: source.at.y,
    sourcePosition: source.side,
    targetX: target.at.x,
    targetY: target.at.y,
    targetPosition: target.side,
    centerX: center.x,
    centerY: center.y,
    offset: PORT_STUB_LENGTH,
    borderRadius: CORNER_RADIUS,
  });
}

function axisSmoothStepMoves(source: PortAnchor, target: PortAnchor, automaticPath: string, automaticCenter: Point) {
  const shiftedAlongX = smoothStep(source, target, { x: automaticCenter.x + PROBE_SHIFT })[0];
  if (shiftedAlongX !== automaticPath) return "x";
  const shiftedAlongY = smoothStep(source, target, { y: automaticCenter.y + PROBE_SHIFT })[0];
  if (shiftedAlongY !== automaticPath) return "y";
  return null;
}

function facingRoute(source: PortAnchor, target: PortAnchor, bend: Point | undefined): CableRoute {
  const [automaticPath, labelX, labelY] = smoothStep(source, target, {});
  const automaticCenter = { x: labelX, y: labelY };
  const movableAxis = axisSmoothStepMoves(source, target, automaticPath, automaticCenter);
  if (!bend || !movableAxis) return { path: automaticPath, handle: automaticCenter, movableAxis };
  const [path] = smoothStep(source, target, { [movableAxis]: bend[movableAxis] });
  return { path, handle: { ...automaticCenter, [movableAxis]: bend[movableAxis] }, movableAxis };
}

export function routeCable(source: PortAnchor, target: PortAnchor, bend: Point | undefined): CableRoute {
  if (source.side === target.side) return sameSideRoute(source, target, bend);
  if (normalAxis(source.side) !== normalAxis(target.side)) return perpendicularRoute(source, target, bend);
  return facingRoute(source, target, bend);
}

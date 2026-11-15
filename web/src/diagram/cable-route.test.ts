import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { PORT_STUB_LENGTH, routeCable, type PortAnchor } from "./cable-route";

const rightPort = (x: number, y: number): PortAnchor => ({ at: { x, y }, side: Position.Right });
const leftPort = (x: number, y: number): PortAnchor => ({ at: { x, y }, side: Position.Left });
const bottomPort = (x: number, y: number): PortAnchor => ({ at: { x, y }, side: Position.Bottom });
const topPort = (x: number, y: number): PortAnchor => ({ at: { x, y }, side: Position.Top });

describe("routeCable", () => {
  it("draws only horizontal and vertical lines plus rounded corners", () => {
    const { path } = routeCable(rightPort(0, 0), leftPort(300, 200), undefined);
    expect(path).not.toMatch(/C/);
    expect(path).toMatch(/Q/);
  });

  it("leaves a right-facing port to the right even when the peer is behind it", () => {
    const route = routeCable(rightPort(0, 0), leftPort(-200, 200), undefined);
    const firstCorner = route.path.match(/^M0 0L [\d.]+,0Q ([\d.]+),0/);
    expect(Number(firstCorner?.[1])).toBe(PORT_STUB_LENGTH);
    expect(route.movableAxis).toBe("y");
  });

  it("moves the vertical middle segment of a side-to-side cable along x", () => {
    const automatic = routeCable(rightPort(0, 0), leftPort(300, 200), undefined);
    expect(automatic.movableAxis).toBe("x");
    const bent = routeCable(rightPort(0, 0), leftPort(300, 200), { x: 80, y: 999 });
    expect(bent.path).toContain("80");
    expect(bent.path).not.toContain("999");
    expect(bent.handle).toEqual({ x: 80, y: automatic.handle.y });
  });

  it("moves the horizontal middle segment of a top-to-bottom cable along y", () => {
    const automatic = routeCable(bottomPort(0, 0), topPort(200, 300), undefined);
    expect(automatic.movableAxis).toBe("y");
    const bent = routeCable(bottomPort(0, 0), topPort(200, 300), { x: 999, y: 70 });
    expect(bent.path).toContain("70");
    expect(bent.handle).toEqual({ x: automatic.handle.x, y: 70 });
  });

  it("runs two top ports out to one shared line that can only move further out", () => {
    const automatic = routeCable(topPort(0, 100), topPort(200, 40), undefined);
    expect(automatic.movableAxis).toBe("y");
    expect(automatic.handle).toEqual({ x: 100, y: 40 - PORT_STUB_LENGTH });
    expect(routeCable(topPort(0, 100), topPort(200, 40), { x: 0, y: -50 }).handle).toEqual({ x: 100, y: -50 });
    expect(routeCable(topPort(0, 100), topPort(200, 40), { x: 0, y: 90 }).path).toBe(automatic.path);
  });

  it("turns once from a side port into a top port and moves that turn along x", () => {
    const automatic = routeCable(rightPort(0, 0), topPort(200, 300), undefined);
    expect(automatic.movableAxis).toBe("x");
    expect(automatic.path).toBe("M0 0 L192 0 Q200 0 200 8 L200 300");
    const bent = routeCable(rightPort(0, 0), topPort(200, 300), { x: 120, y: 999 });
    expect(bent.handle.x).toBe(120);
    expect(bent.path).not.toContain("999");
  });

  it("has nothing to move on a straight cable between facing ports", () => {
    expect(routeCable(rightPort(0, 0), leftPort(300, 0), undefined).movableAxis).toBeNull();
  });
});

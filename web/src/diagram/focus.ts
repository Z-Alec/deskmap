import { linkEnds, linkId, type Setup } from "../model/setup";
import type { Selection } from "../selection";

export type FocusTarget = Selection;

export type Lit = { devices: ReadonlySet<string>; links: ReadonlySet<string> };

export function focusTarget(hoveredDevice: string | null, selection: Selection): FocusTarget {
  return hoveredDevice ? { kind: "device", id: hoveredDevice } : selection;
}

export function focusSet(setup: Setup, target: FocusTarget): Lit | null {
  if (!target) return null;
  const devices = new Set<string>();
  const links = new Set<string>();
  for (const link of setup.links) {
    const id = linkId(link);
    const ends = linkEnds(link);
    const touches = target.kind === "link" ? id === target.id : ends.includes(target.id);
    if (!touches) continue;
    links.add(id);
    for (const end of ends) devices.add(end);
  }
  if (target.kind === "device") devices.add(target.id);
  return { devices, links };
}

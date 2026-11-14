import type { Setup } from "./setup";

export type Issue = {
  level: "error" | "warning";
  subject: { kind: "device"; id: string } | { kind: "link"; id: string } | { kind: "setup" };
  message: string;
};

export function validate(_setup: Setup): Issue[] {
  return [];
}

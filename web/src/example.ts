import { parseSetup, type Setup } from "./model/setup";

const exampleFiles = import.meta.glob<string>("../../examples/*.deskmap.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
});

export type Example = { name: string; setup: Setup };

export const EXAMPLES: Example[] = Object.values(exampleFiles).flatMap((text) => {
  const parsed = parseSetup(text);
  return parsed.ok ? [{ name: parsed.setup.name, setup: parsed.setup }] : [];
});

export function firstExample(): Setup {
  const [example] = EXAMPLES;
  if (!example) throw new Error("no example setups were bundled");
  return example.setup;
}

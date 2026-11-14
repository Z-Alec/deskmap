import { parseSetup, serializeSetup, type Setup } from "./model/setup";

const STORAGE_KEY = "deskmap.setup";

export function loadSavedSetup(): Setup | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const parsed = parseSetup(text);
    return parsed.ok ? parsed.setup : null;
  } catch {
    return null;
  }
}

export function saveSetup(setup: Setup): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeSetup(setup));
  } catch {
    return;
  }
}

function fileName(setup: Setup): string {
  const slug = setup.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "desk"}.yaml`;
}

export function downloadSetup(setup: Setup): void {
  const url = URL.createObjectURL(new Blob([serializeSetup(setup)], { type: "text/yaml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName(setup);
  anchor.click();
  URL.revokeObjectURL(url);
}

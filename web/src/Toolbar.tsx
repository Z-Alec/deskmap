import { useRef } from "react";
import { EXAMPLES } from "./example";
import { parseSetup, type ParseResult, type Setup } from "./model/setup";
import { downloadSetup } from "./persistence";

type Props = {
  setup: Setup;
  name: string;
  onRename: (name: string) => void;
  onNew: () => void;
  onExample: (setup: Setup) => void;
  onOpened: (result: ParseResult) => void;
  onAddDevice: () => void;
};

export function Toolbar({ setup, name, onRename, onNew, onExample, onOpened, onAddDevice }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  async function open(file: File | undefined) {
    if (!file) return;
    onOpened(parseSetup(await file.text()));
  }

  return (
    <header className="toolbar">
      <strong className="brand">deskmap</strong>
      <input aria-label="Setup name" className="setup-name" value={name} onChange={(e) => onRename(e.target.value)} />
      <button onClick={onNew}>New</button>
      <button onClick={() => fileInput.current?.click()}>Open…</button>
      <button onClick={() => downloadSetup(setup)}>Save</button>
      <select
        aria-label="Load example"
        value=""
        onChange={(e) => {
          const example = EXAMPLES[Number(e.target.value)];
          if (example) onExample(example.setup);
        }}
      >
        <option value="" disabled>
          Load example…
        </option>
        {EXAMPLES.map((example, index) => (
          <option key={example.name} value={index}>
            {example.name}
          </option>
        ))}
      </select>
      <button className="primary" onClick={onAddDevice}>
        Add device
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".yaml,.yml,.json"
        hidden
        onChange={(e) => {
          void open(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </header>
  );
}

import { useState } from "react";

type Props = {
  value: string;
  isAvailable: (id: string) => boolean;
  onCommit: (id: string) => void;
  label?: string;
};

export function IdInput({ value, isAvailable, onCommit, label }: Props) {
  const [draft, setDraft] = useState(value);
  const acceptable = draft === value || isAvailable(draft);

  function commit() {
    if (draft !== value && acceptable) onCommit(draft);
    else setDraft(value);
  }

  return (
    <input
      aria-label={label}
      className={acceptable ? "" : "invalid"}
      value={draft}
      title={acceptable ? undefined : "Use lowercase letters, digits and _, and pick an unused id"}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(value);
      }}
    />
  );
}

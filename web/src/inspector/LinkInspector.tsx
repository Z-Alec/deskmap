import { removeLink, updateLink } from "../model/edit";
import { splitPortRef, type Link, type PortRef, type Setup } from "../model/setup";
import { RADIO_LABEL } from "../diagram/palette";
import type { Selection } from "../selection";

type Props = {
  setup: Setup;
  linkId: string;
  link: Link;
  onSetupChange: (setup: Setup) => void;
  onSelect: (selection: Selection) => void;
};

function describePort(setup: Setup, ref: PortRef): string {
  const { device, port } = splitPortRef(ref);
  const found = setup.devices[device];
  const portInfo = found?.ports[port];
  return `${found?.name ?? device} · ${portInfo?.label ?? port}${portInfo ? ` (${portInfo.connector})` : ""}`;
}

function parseLength(text: string): number | undefined {
  const value = Number(text);
  return text.trim() !== "" && value > 0 ? value : undefined;
}

export function LinkInspector({ setup, linkId, link, onSetupChange, onSelect }: Props) {
  const change = (next: Link) => onSetupChange(updateLink(setup, linkId, next));
  const ends =
    link.medium === "wired"
      ? [describePort(setup, link.from), describePort(setup, link.to)]
      : [setup.devices[link.from]?.name ?? link.from, setup.devices[link.to]?.name ?? link.to];

  return (
    <section className="inspector">
      <h2>{link.medium === "wired" ? "Cable" : `Wireless (${RADIO_LABEL[link.radio]})`}</h2>
      <dl>
        <dt>From</dt>
        <dd>{ends[0]}</dd>
        <dt>To</dt>
        <dd>{ends[1]}</dd>
      </dl>
      {link.medium === "wired" && (
        <label>
          Length (m)
          <input
            type="number"
            min="0"
            step="0.1"
            defaultValue={link.length_m ?? ""}
            key={linkId}
            onChange={(e) => change({ ...link, length_m: parseLength(e.target.value) })}
          />
        </label>
      )}
      <label>
        Note
        <input value={link.note ?? ""} onChange={(e) => change({ ...link, note: e.target.value || undefined })} />
      </label>
      <button
        className="danger"
        onClick={() => {
          onSetupChange(removeLink(setup, linkId));
          onSelect(null);
        }}
      >
        Delete {link.medium === "wired" ? "cable" : "link"}
      </button>
    </section>
  );
}

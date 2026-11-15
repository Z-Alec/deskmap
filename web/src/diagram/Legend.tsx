import { LOOK_COLOR, LOOK_LABEL, type LinkLook } from "./palette";

const LOOKS: LinkLook[] = ["power", "video", "data", "wireless"];

type LegendProps = { hiddenLooks: ReadonlySet<LinkLook>; onToggleLook: (look: LinkLook) => void };

export function Legend({ hiddenLooks, onToggleLook }: LegendProps) {
  return (
    <div className="legend">
      {LOOKS.map((look) => (
        <button
          key={look}
          type="button"
          className="legend-row legend-toggle"
          aria-pressed={!hiddenLooks.has(look)}
          title={hiddenLooks.has(look) ? "Show on diagram" : "Hide from diagram"}
          onClick={() => onToggleLook(look)}
        >
          <svg width="32" height="8" aria-hidden>
            <line
              x1="0"
              y1="4"
              x2="32"
              y2="4"
              stroke={LOOK_COLOR[look]}
              strokeWidth="3"
              strokeDasharray={look === "wireless" ? "5 4" : undefined}
            />
          </svg>
          {LOOK_LABEL[look]}
        </button>
      ))}
      <div className="legend-row">
        <span className="legend-port plugged" /> plugged port
      </div>
      <div className="legend-row">
        <span className="legend-port" /> free port
      </div>
    </div>
  );
}

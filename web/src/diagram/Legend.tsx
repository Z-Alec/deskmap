import { LOOK_COLOR, LOOK_LABEL, type LinkLook } from "./palette";

const LOOKS: LinkLook[] = ["power", "video", "data", "wireless"];

export function Legend() {
  return (
    <div className="legend">
      {LOOKS.map((look) => (
        <div key={look} className="legend-row">
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
        </div>
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

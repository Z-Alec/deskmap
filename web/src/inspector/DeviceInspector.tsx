import { addPort, isValidId, removeDevice, removePort, uniqueId, updateDevice, updatePort } from "../model/edit";
import { CONNECTORS, DEVICE_KINDS, RADIOS, SIDES, type Device, type Port, type Radio, type Setup } from "../model/setup";
import { KIND_LOOK } from "../diagram/kinds";
import { RADIO_LABEL } from "../diagram/palette";
import type { Selection } from "../selection";
import { IdInput } from "./IdInput";

type Props = {
  setup: Setup;
  deviceId: string;
  device: Device;
  onSetupChange: (setup: Setup) => void;
  onSelect: (selection: Selection) => void;
};

function toggleRadio(radios: Radio[] | undefined, radio: Radio, on: boolean): Radio[] | undefined {
  const next = RADIOS.filter((r) => (r === radio ? on : (radios ?? []).includes(r)));
  return next.length > 0 ? next : undefined;
}

export function DeviceInspector({ setup, deviceId, device, onSetupChange, onSelect }: Props) {
  const change = (patch: Partial<Device>) => onSetupChange(updateDevice(setup, deviceId, { ...device, ...patch }));
  const changePort = (portId: string, port: Port, nextPortId = portId) =>
    onSetupChange(updatePort(setup, deviceId, portId, port, nextPortId));

  return (
    <section className="inspector">
      <h2>Device</h2>
      <label>
        Id
        <IdInput
          key={deviceId}
          label="Device id"
          value={deviceId}
          isAvailable={(id) => isValidId(id) && !setup.devices[id]}
          onCommit={(nextId) => {
            onSetupChange(updateDevice(setup, deviceId, device, nextId));
            onSelect({ kind: "device", id: nextId });
          }}
        />
      </label>
      <label>
        Name
        <input value={device.name} onChange={(e) => change({ name: e.target.value || deviceId })} />
      </label>
      <label>
        Kind
        <select value={device.kind} onChange={(e) => change({ kind: e.target.value as Device["kind"] })}>
          {DEVICE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LOOK[kind].label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Model
        <input value={device.model ?? ""} onChange={(e) => change({ model: e.target.value || undefined })} />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={device.battery ?? false}
          onChange={(e) => change({ battery: e.target.checked || undefined })}
        />
        Has a battery
      </label>
      <fieldset>
        <legend>Radios</legend>
        {RADIOS.map((radio) => (
          <label key={radio} className="checkbox">
            <input
              type="checkbox"
              checked={device.radios?.includes(radio) ?? false}
              onChange={(e) => change({ radios: toggleRadio(device.radios, radio, e.target.checked) })}
            />
            {RADIO_LABEL[radio]}
          </label>
        ))}
      </fieldset>

      <h3>Ports</h3>
      <table className="ports">
        <thead>
          <tr>
            <th>Id</th>
            <th>Label</th>
            <th>Connector</th>
            <th>Side</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Object.entries(device.ports).map(([portId, port]) => (
            <tr key={portId}>
              <td>
                <IdInput
                  key={portId}
                  label="Port id"
                  value={portId}
                  isAvailable={(id) => isValidId(id) && !device.ports[id]}
                  onCommit={(nextId) => changePort(portId, port, nextId)}
                />
              </td>
              <td>
                <input
                  aria-label="Port label"
                  value={port.label ?? ""}
                  onChange={(e) => changePort(portId, { ...port, label: e.target.value || undefined })}
                />
              </td>
              <td>
                <select
                  aria-label="Port connector"
                  value={port.connector}
                  onChange={(e) => changePort(portId, { ...port, connector: e.target.value as Port["connector"] })}
                >
                  {CONNECTORS.map((connector) => (
                    <option key={connector}>{connector}</option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  aria-label="Port side"
                  value={port.side}
                  onChange={(e) => changePort(portId, { ...port, side: e.target.value as Port["side"] })}
                >
                  {SIDES.map((side) => (
                    <option key={side}>{side}</option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  className="icon"
                  title="Remove port and its cable"
                  onClick={() => onSetupChange(removePort(setup, deviceId, portId))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() =>
          onSetupChange(
            addPort(setup, deviceId, uniqueId(Object.keys(device.ports), "port"), { connector: "usb_c", side: "right" }),
          )
        }
      >
        Add port
      </button>

      <button
        className="danger"
        onClick={() => {
          onSetupChange(removeDevice(setup, deviceId));
          onSelect(null);
        }}
      >
        Delete device
      </button>
    </section>
  );
}

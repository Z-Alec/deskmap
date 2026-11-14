import { SCHEMA_VERSION, type Setup } from "./model/setup";

export function exampleSetup(): Setup {
  return {
    schema: SCHEMA_VERSION,
    name: "Example desk",
    devices: {
      laptop: {
        name: "MacBook Pro",
        kind: "laptop",
        model: "14-inch, M3",
        battery: true,
        radios: ["bluetooth", "wifi"],
        ports: {
          magsafe: { label: "MagSafe", connector: "magsafe", side: "left", carries: ["power_in"] },
          usb_c_left_1: { label: "USB-C 1", connector: "usb_c", side: "left" },
          usb_c_left_2: { label: "USB-C 2", connector: "usb_c", side: "left" },
          hdmi: { label: "HDMI", connector: "hdmi", side: "right", carries: ["video", "audio"] },
          usb_c_right: { label: "USB-C 3", connector: "usb_c", side: "right" },
          sd: { label: "SD card", connector: "other", side: "right", carries: ["data"] },
        },
      },
      monitor: {
        name: "External monitor",
        kind: "monitor",
        model: "27-inch 4K",
        ports: {
          hdmi_in: { label: "HDMI in", connector: "hdmi", side: "front", carries: ["video", "audio"] },
          usb_c_in: { label: "USB-C in", connector: "usb_c", side: "front" },
        },
      },
      dock: {
        name: "USB-C dock",
        kind: "dock",
        ports: {
          host: { label: "Host", connector: "usb_c", side: "right", carries: ["data", "video", "power_out"] },
          usb_a_1: { label: "USB-A 1", connector: "usb_a", side: "left" },
          usb_a_2: { label: "USB-A 2", connector: "usb_a", side: "left" },
          ethernet: { label: "Ethernet", connector: "ethernet", side: "front" },
        },
      },
      keyboard: {
        name: "Keyboard",
        kind: "keyboard",
        ports: { usb_c: { label: "USB-C", connector: "usb_c", side: "right" } },
      },
      mouse: {
        name: "Mouse",
        kind: "mouse",
        battery: true,
        radios: ["bluetooth"],
        ports: {},
      },
      charger: {
        name: "Charger",
        kind: "charger",
        model: "70W USB-C",
        ports: { usb_c: { label: "USB-C", connector: "usb_c", side: "right", carries: ["power_out"] } },
      },
    },
    links: [
      { medium: "wired", from: "charger.usb_c", to: "laptop.magsafe", length_m: 2 },
      { medium: "wired", from: "dock.host", to: "laptop.usb_c_left_1" },
      { medium: "wired", from: "laptop.hdmi", to: "monitor.hdmi_in", length_m: 1.5 },
      { medium: "wired", from: "keyboard.usb_c", to: "dock.usb_a_1" },
      { medium: "wireless", from: "mouse", to: "laptop", radio: "bluetooth" },
    ],
    layout: {
      devices: {
        monitor: { x: 960, y: 20 },
        keyboard: { x: -300, y: 300 },
        dock: { x: 60, y: 300 },
        laptop: { x: 440, y: 280 },
        mouse: { x: 1180, y: 330 },
        charger: { x: 130, y: 600 },
      },
      links: {},
    },
  };
}

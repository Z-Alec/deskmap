import {
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type NodeChange,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { connectionToLink, toEdges, toNodes, type DeviceNode, type Size } from "./diagram/derive";
import { DeviceNodeView } from "./diagram/DeviceNode";
import { Legend } from "./diagram/Legend";
import { LinkEdgeView, SetBendContext, type SetBend } from "./diagram/LinkEdge";
import { exampleSetup } from "./example";
import { DeviceInspector } from "./inspector/DeviceInspector";
import { LinkInspector } from "./inspector/LinkInspector";
import { IssueList } from "./IssueList";
import { addDevice, addLink, moveDevice, removeDevice, removeLink, setLinkBend, uniqueId } from "./model/edit";
import { emptySetup, linkId, type Point, type Setup } from "./model/setup";
import { validate } from "./model/validate";
import { loadSavedSetup, saveSetup } from "./persistence";
import type { Selection } from "./selection";
import { Toolbar } from "./Toolbar";

const nodeTypes = { device: DeviceNodeView };
const edgeTypes = { link: LinkEdgeView };
const FIT_VIEW_OPTIONS = { padding: 0.15 };

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function roundPoint(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function withoutSelected(setup: Setup, selection: Selection): Setup {
  if (!selection) return setup;
  return selection.kind === "device" ? removeDevice(setup, selection.id) : removeLink(setup, selection.id);
}

export function App() {
  const [setup, setSetup] = useState<Setup>(() => loadSavedSetup() ?? exampleSetup());
  const [selection, setSelection] = useState<Selection>(null);
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [fitRequests, setFitRequests] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { fitView, screenToFlowPosition } = useReactFlow();

  const nodes = useMemo(() => toNodes(setup, selection, sizes), [setup, selection, sizes]);
  const edges = useMemo(() => toEdges(setup, selection), [setup, selection]);
  const issues = useMemo(() => validate(setup), [setup]);
  const setBend: SetBend = (id, bend) => setSetup((current) => setLinkBend(current, id, bend && roundPoint(bend)));

  useEffect(() => saveSetup(setup), [setup]);

  useEffect(() => {
    if (fitRequests > 0) fitView(FIT_VIEW_OPTIONS);
  }, [fitRequests, fitView]);

  useEffect(() => {
    function deleteSelected(event: KeyboardEvent) {
      if ((event.key !== "Delete" && event.key !== "Backspace") || isTyping(event.target) || !selection) return;
      setSetup((current) => withoutSelected(current, selection));
      setSelection(null);
    }
    window.addEventListener("keydown", deleteSelected);
    return () => window.removeEventListener("keydown", deleteSelected);
  }, [selection]);

  function replaceSetup(next: Setup) {
    setSetup(next);
    setSelection(null);
    setLoadErrors([]);
    setFitRequests((n) => n + 1);
  }

  function applyNodeChanges(changes: NodeChange<DeviceNode>[]) {
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        const { id, position } = change;
        setSetup((current) => moveDevice(current, id, roundPoint(position)));
      }
      if (change.type === "dimensions" && change.dimensions) {
        const { id, dimensions } = change;
        setSizes((current) => ({ ...current, [id]: dimensions }));
      }
    }
  }

  function connect(connection: Connection) {
    const link = connectionToLink(setup, connection);
    if (!link) return;
    setSetup((current) => addLink(current, link));
    setSelection({ kind: "link", id: linkId(link) });
  }

  function addNewDevice() {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
    const id = uniqueId(Object.keys(setup.devices), "device");
    setSetup(addDevice(setup, id, { name: "New device", kind: "other", ports: {} }, roundPoint(screenToFlowPosition(center))));
    setSelection({ kind: "device", id });
  }

  const selectedDevice = selection?.kind === "device" ? setup.devices[selection.id] : undefined;
  const selectedLink = selection?.kind === "link" ? setup.links.find((l) => linkId(l) === selection.id) : undefined;

  return (
    <div className="app">
      <Toolbar
        name={setup.name}
        onRename={(name) => setSetup({ ...setup, name })}
        onNew={() => replaceSetup(emptySetup())}
        onExample={() => replaceSetup(exampleSetup())}
        onOpened={(result) => (result.ok ? replaceSetup(result.setup) : setLoadErrors(result.errors))}
        onAddDevice={addNewDevice}
        setup={setup}
      />
      {loadErrors.length > 0 && (
        <div className="banner" role="alert">
          <strong>Could not open that file.</strong>
          <ul>
            {loadErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <button onClick={() => setLoadErrors([])}>Dismiss</button>
        </div>
      )}
      <main>
        <div className="canvas" ref={canvasRef}>
          <SetBendContext.Provider value={setBend}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionMode={ConnectionMode.Loose}
              onNodesChange={applyNodeChanges}
              onConnect={connect}
              isValidConnection={(connection) => connectionToLink(setup, connection) !== null}
              onNodeClick={(_, node) => setSelection({ kind: "device", id: node.id })}
              onEdgeClick={(_, edge) => setSelection({ kind: "link", id: edge.id })}
              onPaneClick={() => setSelection(null)}
              deleteKeyCode={null}
              fitView
              fitViewOptions={FIT_VIEW_OPTIONS}
              minZoom={0.2}
            >
              <Controls />
              <MiniMap pannable zoomable />
              <Panel position="top-left">
                <Legend />
              </Panel>
              <Panel position="top-right">
                <IssueList issues={issues} onSelect={setSelection} />
              </Panel>
            </ReactFlow>
          </SetBendContext.Provider>
        </div>
        {!selectedDevice && !selectedLink && (
          <section className="inspector empty">
            <p>Select a device or cable to edit it.</p>
            <p>Drag from one port to another to plug in a cable. Drag between the green radio dots to pair wireless devices.</p>
          </section>
        )}
        {selection?.kind === "device" && selectedDevice && (
          <DeviceInspector
            setup={setup}
            deviceId={selection.id}
            device={selectedDevice}
            onSetupChange={setSetup}
            onSelect={setSelection}
          />
        )}
        {selection?.kind === "link" && selectedLink && (
          <LinkInspector
            setup={setup}
            linkId={selection.id}
            link={selectedLink}
            onSetupChange={setSetup}
            onSelect={setSelection}
          />
        )}
      </main>
    </div>
  );
}

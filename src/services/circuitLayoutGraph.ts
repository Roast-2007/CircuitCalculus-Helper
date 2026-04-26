import {
  CircuitComponent,
  CircuitComponentPlacement,
  CircuitLayout,
  CircuitNode,
  CircuitPoint,
  CircuitTerminal,
  CircuitTerminalPlacement,
  CircuitTopology,
  CircuitWirePlacement,
  ComponentOrientation,
} from "../types";

const PADDING_X = 88;
const PADDING_Y = 48;
const NODE_GAP_X = 150;
const ROW_GAP_Y = 150;
const FIRST_ROW_Y = 150;
const COMPONENT_WIDTH = 104;
const COMPONENT_HEIGHT = 82;
const MULTI_TERMINAL_WIDTH = 124;
const MULTI_TERMINAL_HEIGHT = 126;
const COMPONENT_COLUMN_GAP = 116;
const WIRE_STUB = 16;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 360;

type NodeColumn = {
  node: CircuitNode;
  x: number;
};

type ComponentLayoutInfo = {
  component: CircuitComponent;
  placement: CircuitComponentPlacement;
  orientation: ComponentOrientation;
};

type LayoutIndexes = {
  nodeXById: Map<string, number>;
  componentById: Map<string, ComponentLayoutInfo>;
  terminalPlacementByKey: Map<string, CircuitTerminalPlacement>;
};

const GROUND_LABELS = new Set(["0", "gnd", "ground", "地"]);
const TERMINAL_LABELS = new Set(["a", "b", "out", "output", "端口a", "端口b"]);

function terminalKey(componentId: string, terminalId: string): string {
  return `${componentId}:${terminalId}`;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function nodeKindScore(node: CircuitNode): number {
  if (node.kind === "ground" || GROUND_LABELS.has(normalizeLabel(node.id))) return 3;
  if (node.kind === "reference") return 2;
  if (TERMINAL_LABELS.has(normalizeLabel(node.id)) || TERMINAL_LABELS.has(normalizeLabel(node.label))) return 0;
  return 1;
}

function numericLabel(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  return Number(normalized);
}

function sortNodes(left: CircuitNode, right: CircuitNode): number {
  const scoreDelta = nodeKindScore(left) - nodeKindScore(right);
  if (scoreDelta !== 0) return scoreDelta;

  const leftNumber = numericLabel(left.label || left.id);
  const rightNumber = numericLabel(right.label || right.id);
  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  return (left.label || left.id).localeCompare(right.label || right.id, "zh-CN", { numeric: true });
}

function normalizeNodes(topology: CircuitTopology): CircuitNode[] {
  const nodeMap = new Map<string, CircuitNode>();
  topology.nodes.forEach((node) => {
    const id = node.id.trim();
    if (!id) return;
    nodeMap.set(id, {
      id,
      label: node.label?.trim() || id,
      kind: node.kind,
    });
  });

  topology.connections.forEach((connection) => {
    const id = connection.nodeId.trim();
    if (!id || nodeMap.has(id)) return;
    nodeMap.set(id, {
      id,
      label: id,
      kind: GROUND_LABELS.has(normalizeLabel(id)) ? "ground" : "signal",
    });
  });

  return Array.from(nodeMap.values()).sort(sortNodes);
}

function getNodeColumns(nodes: CircuitNode[]): NodeColumn[] {
  return nodes.map((node, index) => ({
    node,
    x: PADDING_X + index * NODE_GAP_X,
  }));
}

function getComponentWidth(component: CircuitComponent): number {
  return component.terminals.length > 2 ? MULTI_TERMINAL_WIDTH : COMPONENT_WIDTH;
}

function getComponentHeight(component: CircuitComponent): number {
  return component.terminals.length > 2 ? MULTI_TERMINAL_HEIGHT : COMPONENT_HEIGHT;
}

function getComponentOrientation(component: CircuitComponent): ComponentOrientation {
  if (component.orientation === "vertical" || component.orientation === "horizontal") {
    return component.orientation;
  }
  if (component.kind === "ground" || component.kind === "probe") {
    return "vertical";
  }
  return "horizontal";
}

function buildComponentLayouts(
  components: CircuitComponent[],
  nodeColumns: NodeColumn[]
): ComponentLayoutInfo[] {
  const maxBusX = nodeColumns.length > 0
    ? Math.max(...nodeColumns.map((entry) => entry.x))
    : PADDING_X;
  const componentLeftX = maxBusX + COMPONENT_COLUMN_GAP;

  return components.map((component, index) => {
    const width = getComponentWidth(component);
    const height = getComponentHeight(component);
    const rowY = FIRST_ROW_Y + index * ROW_GAP_Y;
    const orientation = getComponentOrientation(component);

    return {
      component,
      orientation,
      placement: {
        componentId: component.id,
        x: componentLeftX,
        y: rowY - height / 2,
        width,
        height,
        orientation,
      },
    };
  });
}

function sideForTerminal(
  terminal: CircuitTerminal,
  orientation: ComponentOrientation
): CircuitTerminal["side"] {
  if (orientation !== "vertical") return terminal.side;
  switch (terminal.side) {
    case "left": return "top";
    case "right": return "bottom";
    case "top": return "left";
    case "bottom": return "right";
  }
}

function terminalPosition(
  placement: CircuitComponentPlacement,
  terminal: CircuitTerminal,
  orientation: ComponentOrientation,
  index: number,
  total: number
): CircuitTerminalPlacement {
  const fraction = total <= 1 ? 0.5 : (index + 1) / (total + 1);
  const side = sideForTerminal(terminal, orientation);

  if (side === "right") {
    return {
      componentId: placement.componentId,
      terminalId: terminal.id,
      x: placement.x + placement.width,
      y: placement.y + placement.height * fraction,
    };
  }

  if (side === "top") {
    return {
      componentId: placement.componentId,
      terminalId: terminal.id,
      x: placement.x + placement.width * fraction,
      y: placement.y,
    };
  }

  if (side === "bottom") {
    return {
      componentId: placement.componentId,
      terminalId: terminal.id,
      x: placement.x + placement.width * fraction,
      y: placement.y + placement.height,
    };
  }

  return {
    componentId: placement.componentId,
    terminalId: terminal.id,
    x: placement.x,
    y: placement.y + placement.height * fraction,
  };
}

function buildTerminalPlacements(layouts: ComponentLayoutInfo[]): CircuitTerminalPlacement[] {
  return layouts.flatMap(({ component, placement, orientation }) => {
    const terminalsBySide = new Map<CircuitTerminal["side"], CircuitTerminal[]>();
    component.terminals.forEach((terminal) => {
      const side = sideForTerminal(terminal, orientation);
      const terminals = terminalsBySide.get(side) || [];
      terminalsBySide.set(side, [...terminals, terminal]);
    });

    return component.terminals.map((terminal) => {
      const side = sideForTerminal(terminal, orientation);
      const sideTerminals = terminalsBySide.get(side) || [];
      const index = sideTerminals.findIndex((candidate) => candidate.id === terminal.id);
      return terminalPosition(placement, terminal, orientation, index, sideTerminals.length);
    });
  });
}

function buildIndexes(
  nodeColumns: NodeColumn[],
  componentLayouts: ComponentLayoutInfo[],
  terminalPlacements: CircuitTerminalPlacement[]
): LayoutIndexes {
  return {
    nodeXById: new Map(nodeColumns.map((entry) => [entry.node.id, entry.x])),
    componentById: new Map(componentLayouts.map((entry) => [entry.component.id, entry])),
    terminalPlacementByKey: new Map(
      terminalPlacements.map((placement) => [
        terminalKey(placement.componentId, placement.terminalId),
        placement,
      ])
    ),
  };
}

function busWirePath(
  start: CircuitPoint,
  busX: number,
  side: CircuitTerminal["side"],
  trackY: number
): CircuitPoint[] {
  const stubPoint = { ...start };
  if (side === "right") stubPoint.x += WIRE_STUB;
  if (side === "left") stubPoint.x -= WIRE_STUB;
  if (side === "top") stubPoint.y -= WIRE_STUB;
  if (side === "bottom") stubPoint.y += WIRE_STUB;

  return [
    start,
    stubPoint,
    { x: stubPoint.x, y: trackY },
    { x: busX, y: trackY },
  ].filter((point, index, points) => {
    const previous = points[index - 1];
    return !previous || previous.x !== point.x || previous.y !== point.y;
  });
}

function terminalTrackY(
  component: CircuitComponent,
  terminal: CircuitTerminal,
  terminalPlacement: CircuitTerminalPlacement
): number {
  const index = component.terminals.findIndex((candidate) => candidate.id === terminal.id);
  const centerOffset = index - (component.terminals.length - 1) / 2;
  return terminalPlacement.y + centerOffset * 22;
}

function buildConnectionWires(
  topology: CircuitTopology,
  indexes: LayoutIndexes
): CircuitWirePlacement[] {
  return topology.connections.flatMap((connection) => {
    const componentInfo = indexes.componentById.get(connection.componentId);
    const terminal = componentInfo?.component.terminals.find(
      (candidate) => candidate.id === connection.terminalId
    );
    const terminalPlacement = indexes.terminalPlacementByKey.get(
      terminalKey(connection.componentId, connection.terminalId)
    );
    const busX = indexes.nodeXById.get(connection.nodeId);

    if (!componentInfo || !terminal || !terminalPlacement || busX === undefined) return [];

    return [{
      id: `wire-${connection.id}`,
      connectionId: connection.id,
      componentId: connection.componentId,
      terminalId: connection.terminalId,
      nodeId: connection.nodeId,
      points: busWirePath(
        { x: terminalPlacement.x, y: terminalPlacement.y },
        busX,
        sideForTerminal(terminal, componentInfo.orientation),
        terminalTrackY(componentInfo.component, terminal, terminalPlacement)
      ),
    }];
  });
}

function buildNodePlacements(
  topology: CircuitTopology,
  nodeColumns: NodeColumn[],
  wires: CircuitWirePlacement[]
): CircuitLayout["nodePlacements"] {
  const headers = nodeColumns.map(({ node, x }) => ({
    nodeId: node.id,
    x,
    y: PADDING_Y,
    label: node.label || node.id,
    role: TERMINAL_LABELS.has(normalizeLabel(node.label || node.id)) ? "terminal" as const : "junction" as const,
  }));

  const connectionPointById = new Map(
    wires.map((wire) => [wire.connectionId, wire.points[wire.points.length - 1]])
  );
  const junctions = topology.connections.flatMap((connection) => {
    const lastPoint = connectionPointById.get(connection.id);
    if (!lastPoint) return [];
    return [{
      nodeId: `${connection.nodeId}:${connection.id}`,
      x: lastPoint.x,
      y: lastPoint.y,
      role: "junction" as const,
    }];
  });

  return [...headers, ...junctions];
}

function computeBounds(
  nodeColumns: NodeColumn[],
  componentPlacements: CircuitComponentPlacement[],
  wirePlacements: CircuitWirePlacement[]
): { width: number; height: number } {
  let maxX = PADDING_X;
  let maxY = PADDING_Y;

  nodeColumns.forEach((entry) => {
    maxX = Math.max(maxX, entry.x);
  });

  componentPlacements.forEach((placement) => {
    maxX = Math.max(maxX, placement.x + placement.width);
    maxY = Math.max(maxY, placement.y + placement.height);
  });

  wirePlacements.forEach((wire) => {
    wire.points.forEach((point) => {
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  });

  return {
    width: Math.max(MIN_WIDTH, maxX + PADDING_X),
    height: Math.max(MIN_HEIGHT, maxY + PADDING_Y),
  };
}

export function buildGraphCircuitLayout(topology: CircuitTopology): CircuitLayout | null {
  if (topology.components.length === 0) return null;

  const nodes = normalizeNodes(topology);
  const nodeColumns = getNodeColumns(nodes);
  const componentLayouts = buildComponentLayouts(topology.components, nodeColumns);
  const componentPlacements = componentLayouts.map((entry) => entry.placement);
  const terminalPlacements = buildTerminalPlacements(componentLayouts);
  const indexes = buildIndexes(nodeColumns, componentLayouts, terminalPlacements);
  const wirePlacements = buildConnectionWires(topology, indexes);
  const bounds = computeBounds(nodeColumns, componentPlacements, wirePlacements);

  return {
    width: bounds.width,
    height: bounds.height,
    nodePlacements: buildNodePlacements(topology, nodeColumns, wirePlacements),
    componentPlacements,
    terminalPlacements,
    wirePlacements,
  };
}

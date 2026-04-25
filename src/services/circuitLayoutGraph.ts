import {
  CircuitComponent,
  CircuitComponentPlacement,
  CircuitConnection,
  CircuitLayout,
  CircuitNode,
  CircuitPoint,
  CircuitTerminal,
  CircuitTerminalPlacement,
  CircuitTopology,
  CircuitWirePlacement,
  ComponentOrientation,
} from "../types";
import { getComponentNodeMap } from "./circuitSerialize";

const PADDING_X = 96;
const PADDING_Y = 150;
const TOP_Y = PADDING_Y;
const BOTTOM_Y = PADDING_Y + 230;
const SOURCE_X = PADDING_X;
const COLUMN_GAP = 190;
const END_STUB = 150;
const PARALLEL_BRANCH_GAP = 92;
const HORIZONTAL_WIDTH = 118;
const HORIZONTAL_HEIGHT = 66;
const VERTICAL_WIDTH = 66;
const VERTICAL_HEIGHT = 124;
const WIRE_STUB = 12;

const SOURCE_KINDS = new Set(["voltage_source", "current_source"]);
const CONTROLLED_SOURCE_KINDS = new Set(["vcvs", "vccs", "ccvs", "cccs"]);
const PASSIVE_BRANCH_KINDS = new Set(["resistor", "capacitor", "inductor", "diode", "switch"]);
const TERMINAL_LABELS = new Set(["a", "b", "out", "output", "端口a", "端口b"]);

type Edge = {
  component: CircuitComponent;
  nodeA: string;
  nodeB: string;
};

type LogicalNode = {
  nodeId: string;
  x: number;
  y: number;
  role?: "junction" | "terminal" | "hidden";
  label?: string;
};

type PlacedComponent = {
  component: CircuitComponent;
  edge: Edge;
  placement: CircuitComponentPlacement;
};

type ParallelEdge = {
  edge: Edge;
  baseEdge: Edge;
  offsetIndex: number;
};

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function isTerminalNode(node: CircuitNode | undefined): boolean {
  if (!node) {
    return false;
  }
  const id = normalizeLabel(node.id);
  const label = normalizeLabel(node.label);
  return TERMINAL_LABELS.has(id) || TERMINAL_LABELS.has(label);
}

function getNodeLabel(topology: CircuitTopology, nodeId: string): string {
  return topology.nodes.find((node) => node.id === nodeId)?.label || nodeId;
}

function getEdge(topology: CircuitTopology, component: CircuitComponent): Edge | null {
  if (component.terminals.length !== 2) {
    return null;
  }

  const nodeMap = getComponentNodeMap(topology, component.id);
  const nodeIds = component.terminals.map((terminal) => nodeMap[terminal.id] || "");

  if (!nodeIds[0] || !nodeIds[1] || nodeIds[0] === nodeIds[1]) {
    return null;
  }

  return {
    component,
    nodeA: nodeIds[0],
    nodeB: nodeIds[1],
  };
}

function getEdges(topology: CircuitTopology): Edge[] | null {
  const edges = topology.components.map((component) => getEdge(topology, component));
  if (edges.some((edge) => edge === null)) {
    return null;
  }
  return edges as Edge[];
}

function addAdjacency(adjacency: Map<string, Edge[]>, nodeId: string, edge: Edge): void {
  const edges = adjacency.get(nodeId) || [];
  edges.push(edge);
  adjacency.set(nodeId, edges);
}

function buildAdjacency(edges: Edge[]): Map<string, Edge[]> {
  const adjacency = new Map<string, Edge[]>();
  edges.forEach((edge) => {
    addAdjacency(adjacency, edge.nodeA, edge);
    addAdjacency(adjacency, edge.nodeB, edge);
  });
  return adjacency;
}

function otherNode(edge: Edge, nodeId: string): string {
  return edge.nodeA === nodeId ? edge.nodeB : edge.nodeA;
}

function findSource(edges: Edge[]): Edge | undefined {
  return edges.find((edge) => SOURCE_KINDS.has(edge.component.kind));
}

function findTerminalNode(topology: CircuitTopology, preferred: string): string | null {
  const normalizedPreferred = preferred.toLowerCase();
  const node = topology.nodes.find((candidate) => {
    const id = normalizeLabel(candidate.id);
    const label = normalizeLabel(candidate.label);
    return id === normalizedPreferred || label === normalizedPreferred;
  });
  return node?.id || null;
}

function chooseSourceTopNode(topology: CircuitTopology, sourceEdge: Edge): string {
  const positiveConnection = topology.connections.find(
    (connection) =>
      connection.componentId === sourceEdge.component.id &&
      ["positive", "+", "p", "a", "top"].includes(normalizeLabel(connection.terminalId))
  );

  if (positiveConnection) {
    return positiveConnection.nodeId;
  }

  const nodeA = topology.nodes.find((node) => node.id === sourceEdge.nodeA);
  const nodeB = topology.nodes.find((node) => node.id === sourceEdge.nodeB);
  if (nodeA?.kind === "ground" && nodeB) {
    return nodeB.id;
  }
  if (nodeB?.kind === "ground" && nodeA) {
    return nodeA.id;
  }

  return sourceEdge.nodeA;
}

function terminalScore(topology: CircuitTopology, nodeId: string): number {
  const node = topology.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return 0;
  }
  const label = normalizeLabel(node.label || node.id);
  if (label === "a") return 100;
  if (label === "out" || label === "output") return 90;
  if (isTerminalNode(node)) return 80;
  return 0;
}

function componentPathPriority(component: CircuitComponent): number {
  if (CONTROLLED_SOURCE_KINDS.has(component.kind)) {
    return 100;
  }
  if (component.kind === "wire") {
    return 80;
  }
  if (PASSIVE_BRANCH_KINDS.has(component.kind)) {
    return 60;
  }
  return 40;
}

function walkMainPath(
  topology: CircuitTopology,
  adjacency: Map<string, Edge[]>,
  sourceEdge: Edge,
  sourceTopNodeId: string
): Edge[] {
  const used = new Set<string>([sourceEdge.component.id]);
  const path: Edge[] = [];
  let currentNodeId = sourceTopNodeId;

  while (true) {
    const candidates = (adjacency.get(currentNodeId) || []).filter((edge) => {
      if (used.has(edge.component.id)) {
        return false;
      }
      const nextNodeId = otherNode(edge, currentNodeId);
      const nextNode = topology.nodes.find((node) => node.id === nextNodeId);
      return nextNode?.kind !== "ground";
    });

    if (candidates.length === 0) {
      break;
    }

    const nextEdge = [...candidates].sort((left, right) => {
      const leftNext = otherNode(left, currentNodeId);
      const rightNext = otherNode(right, currentNodeId);
      const leftTerminal = terminalScore(topology, leftNext);
      const rightTerminal = terminalScore(topology, rightNext);
      if (leftTerminal !== rightTerminal) {
        return rightTerminal - leftTerminal;
      }
      return componentPathPriority(right.component) - componentPathPriority(left.component);
    })[0];

    path.push(nextEdge);
    used.add(nextEdge.component.id);
    currentNodeId = otherNode(nextEdge, currentNodeId);

    if (terminalScore(topology, currentNodeId) > 0) {
      break;
    }
  }

  return path;
}

function edgeKey(left: string, right: string): string {
  return [left, right].sort().join("::");
}

function findParallelEdges(edges: Edge[], mainPath: Edge[], usedComponentIds: Set<string>): ParallelEdge[] {
  const mainByNodePair = new Map<string, Edge>();
  mainPath.forEach((edge) => {
    mainByNodePair.set(edgeKey(edge.nodeA, edge.nodeB), edge);
  });

  const parallelCounts = new Map<string, number>();
  return edges.flatMap((edge) => {
    if (usedComponentIds.has(edge.component.id)) {
      return [];
    }

    const key = edgeKey(edge.nodeA, edge.nodeB);
    const baseEdge = mainByNodePair.get(key);
    if (!baseEdge) {
      return [];
    }

    const offsetIndex = parallelCounts.get(key) || 0;
    parallelCounts.set(key, offsetIndex + 1);
    usedComponentIds.add(edge.component.id);
    return [{ edge, baseEdge, offsetIndex }];
  });
}

function findBranchEdges(
  adjacency: Map<string, Edge[]>,
  mainNodeIds: Set<string>,
  usedComponentIds: Set<string>
): Edge[] {
  const branches: Edge[] = [];
  mainNodeIds.forEach((nodeId) => {
    (adjacency.get(nodeId) || []).forEach((edge) => {
      if (usedComponentIds.has(edge.component.id)) {
        return;
      }
      const nextNodeId = otherNode(edge, nodeId);
      if (mainNodeIds.has(nextNodeId)) {
        return;
      }
      branches.push(edge);
      usedComponentIds.add(edge.component.id);
    });
  });
  return branches;
}

function createLogicalNodes(
  topology: CircuitTopology,
  mainPath: Edge[],
  sourceTopNodeId: string,
  sourceBottomNodeId: string,
  branchEdges: Edge[],
  parallelEdges: ParallelEdge[]
): LogicalNode[] {
  const nodes = new Map<string, LogicalNode>();
  const setNode = (node: LogicalNode) => {
    nodes.set(node.nodeId, node);
  };

  setNode({ nodeId: sourceTopNodeId, x: SOURCE_X, y: TOP_Y, role: "hidden" });
  setNode({ nodeId: sourceBottomNodeId, x: SOURCE_X, y: BOTTOM_Y, role: "hidden" });

  let currentNodeId = sourceTopNodeId;
  mainPath.forEach((edge, index) => {
    const nextNodeId = otherNode(edge, currentNodeId);
    const x = SOURCE_X + (index + 1) * COLUMN_GAP;
    const nextNode = topology.nodes.find((node) => node.id === nextNodeId);
    setNode({
      nodeId: nextNodeId,
      x,
      y: TOP_Y,
      role: isTerminalNode(nextNode) ? "terminal" : "junction",
      label: getNodeLabel(topology, nextNodeId),
    });
    currentNodeId = nextNodeId;
  });

  parallelEdges.forEach(({ edge, offsetIndex }) => {
    const nodeA = nodes.get(edge.nodeA);
    const nodeB = nodes.get(edge.nodeB);
    if (!nodeA || !nodeB) {
      return;
    }
    const y = TOP_Y - PARALLEL_BRANCH_GAP * (offsetIndex + 1);
    setNode({ nodeId: `${edge.nodeA}:parallel-${edge.component.id}`, x: nodeA.x, y, role: "hidden" });
    setNode({ nodeId: `${edge.nodeB}:parallel-${edge.component.id}`, x: nodeB.x, y, role: "hidden" });
  });

  const terminalB = findTerminalNode(topology, "b");
  const lastTop = Array.from(nodes.values())
    .filter((placement) => placement.y === TOP_Y)
    .sort((left, right) => right.x - left.x)[0];

  branchEdges.forEach((edge) => {
    const mainNodeId = nodes.has(edge.nodeA) ? edge.nodeA : edge.nodeB;
    const branchNodeId = otherNode(edge, mainNodeId);
    const mainNode = nodes.get(mainNodeId);
    if (!mainNode) {
      return;
    }

    const branchNode = topology.nodes.find((node) => node.id === branchNodeId);
    const isBTerminal = terminalB === branchNodeId;
    setNode({
      nodeId: `${branchNodeId}:branch-${edge.component.id}`,
      x: mainNode.x,
      y: BOTTOM_Y,
      role: "junction",
      label: isBTerminal ? undefined : getNodeLabel(topology, branchNodeId),
    });

    if (!nodes.has(branchNodeId)) {
      setNode({
        nodeId: branchNodeId,
        x: mainNode.x,
        y: BOTTOM_Y,
        role: isTerminalNode(branchNode) && !isBTerminal ? "terminal" : "hidden",
        label: isTerminalNode(branchNode) && !isBTerminal ? getNodeLabel(topology, branchNodeId) : undefined,
      });
    }
  });

  topology.nodes.forEach((node) => {
    if (nodes.has(node.id)) {
      return;
    }

    const isA = normalizeLabel(node.label || node.id) === "a";
    const isB = normalizeLabel(node.label || node.id) === "b";
    const x = (lastTop?.x || SOURCE_X) + END_STUB;

    setNode({
      nodeId: node.id,
      x,
      y: isB ? BOTTOM_Y : TOP_Y,
      role: isA || isB || isTerminalNode(node) ? "terminal" : "junction",
      label: node.label || node.id,
    });
  });

  return Array.from(nodes.values());
}

function getDimensions(orientation: ComponentOrientation) {
  return orientation === "vertical"
    ? { width: VERTICAL_WIDTH, height: VERTICAL_HEIGHT }
    : { width: HORIZONTAL_WIDTH, height: HORIZONTAL_HEIGHT };
}

function placeComponentBetween(
  edge: Edge,
  nodeA: LogicalNode,
  nodeB: LogicalNode,
  orientation: ComponentOrientation
): PlacedComponent {
  const dimensions = getDimensions(orientation);
  const centerX = orientation === "vertical" ? nodeA.x : (nodeA.x + nodeB.x) / 2;
  const centerY = (nodeA.y + nodeB.y) / 2;

  return {
    component: edge.component,
    edge,
    placement: {
      componentId: edge.component.id,
      x: centerX - dimensions.width / 2,
      y: centerY - dimensions.height / 2,
      width: dimensions.width,
      height: dimensions.height,
      orientation,
    },
  };
}

function getPhysicalNode(logicalNodeMap: Map<string, LogicalNode>, edge: Edge, nodeId: string): LogicalNode | undefined {
  return (
    logicalNodeMap.get(`${nodeId}:parallel-${edge.component.id}`) ||
    logicalNodeMap.get(`${nodeId}:branch-${edge.component.id}`) ||
    logicalNodeMap.get(nodeId)
  );
}

function buildComponentPlacements(
  sourceEdge: Edge,
  mainPath: Edge[],
  branchEdges: Edge[],
  logicalNodeMap: Map<string, LogicalNode>,
  sourceTopNodeId: string,
  sourceBottomNodeId: string
): PlacedComponent[] {
  const placed: PlacedComponent[] = [];
  const sourceTopNode = logicalNodeMap.get(sourceTopNodeId);
  const sourceBottomNode = logicalNodeMap.get(sourceBottomNodeId);
  if (sourceTopNode && sourceBottomNode) {
    placed.push(placeComponentBetween(sourceEdge, sourceTopNode, sourceBottomNode, "vertical"));
  }

  let currentNodeId = sourceTopNodeId;
  mainPath.forEach((edge) => {
    const nextNodeId = otherNode(edge, currentNodeId);
    const leftNode = getPhysicalNode(logicalNodeMap, edge, currentNodeId);
    const rightNode = getPhysicalNode(logicalNodeMap, edge, nextNodeId);
    if (leftNode && rightNode) {
      placed.push(placeComponentBetween(edge, leftNode, rightNode, "horizontal"));
    }
    currentNodeId = nextNodeId;
  });

  branchEdges.forEach((edge) => {
    const nodeA = getPhysicalNode(logicalNodeMap, edge, edge.nodeA);
    const nodeB = getPhysicalNode(logicalNodeMap, edge, edge.nodeB);
    if (!nodeA || !nodeB) {
      return;
    }
    const orientation = Math.abs(nodeA.x - nodeB.x) < Math.abs(nodeA.y - nodeB.y)
      ? "vertical"
      : "horizontal";
    placed.push(placeComponentBetween(edge, nodeA, nodeB, orientation));
  });

  return placed;
}

function sideForTerminal(
  terminal: CircuitTerminal, orientation: ComponentOrientation): CircuitTerminal["side"] {
  if (orientation !== "vertical") {
    return terminal.side;
  }

  switch (terminal.side) {
    case "left":
      return "top";
    case "right":
      return "bottom";
    case "top":
      return "left";
    case "bottom":
      return "right";
  }
}

function getTerminalPosition(
  placement: CircuitComponentPlacement,
  terminal: CircuitTerminal,
  orientation: ComponentOrientation,
  index: number,
  total: number
): CircuitTerminalPlacement {
  const fraction = total <= 1 ? 0.5 : (index + 1) / (total + 1);
  const side = sideForTerminal(terminal, orientation);

  if (side === "right") {
    return { componentId: placement.componentId, terminalId: terminal.id, x: placement.x + placement.width, y: placement.y + placement.height * fraction };
  }
  if (side === "top") {
    return { componentId: placement.componentId, terminalId: terminal.id, x: placement.x + placement.width * fraction, y: placement.y };
  }
  if (side === "bottom") {
    return { componentId: placement.componentId, terminalId: terminal.id, x: placement.x + placement.width * fraction, y: placement.y + placement.height };
  }
  return { componentId: placement.componentId, terminalId: terminal.id, x: placement.x, y: placement.y + placement.height * fraction };
}

function buildTerminalPlacements(placedComponents: PlacedComponent[]): CircuitTerminalPlacement[] {
  return placedComponents.flatMap(({ component, placement }) => {
    const orientation = placement.orientation || component.orientation || "horizontal";
    const bySide = new Map<CircuitTerminal["side"], CircuitTerminal[]>();
    component.terminals.forEach((terminal) => {
      const side = sideForTerminal(terminal, orientation);
      const terminals = bySide.get(side) || [];
      terminals.push(terminal);
      bySide.set(side, terminals);
    });

    return component.terminals.map((terminal) => {
      const side = sideForTerminal(terminal, orientation);
      const terminals = bySide.get(side) || [];
      const index = terminals.findIndex((candidate) => candidate.id === terminal.id);
      return getTerminalPosition(placement, terminal, orientation, index, terminals.length);
    });
  });
}

function getConnectionNodeId(connections: CircuitConnection[], componentId: string, terminalId: string): string | null {
  return connections.find(
    (connection) => connection.componentId === componentId && connection.terminalId === terminalId
  )?.nodeId || null;
}

function wirePath(start: CircuitPoint, end: CircuitPoint, side: CircuitTerminal["side"]): CircuitPoint[] {
  const points: CircuitPoint[] = [{ x: start.x, y: start.y }];
  let stubX = start.x;
  let stubY = start.y;

  if (side === "right") stubX += WIRE_STUB;
  if (side === "left") stubX -= WIRE_STUB;
  if (side === "top") stubY -= WIRE_STUB;
  if (side === "bottom") stubY += WIRE_STUB;

  if (stubX !== start.x || stubY !== start.y) {
    points.push({ x: stubX, y: stubY });
  }

  if (Math.abs(stubY - end.y) < Math.abs(stubX - end.x)) {
    if (stubX !== end.x) points.push({ x: end.x, y: stubY });
    if (stubY !== end.y) points.push({ x: end.x, y: end.y });
  } else {
    if (stubY !== end.y) points.push({ x: stubX, y: end.y });
    if (stubX !== end.x) points.push({ x: end.x, y: end.y });
  }

  return points;
}

function buildWirePlacements(
  topology: CircuitTopology,
  placedComponents: PlacedComponent[],
  terminalPlacements: CircuitTerminalPlacement[],
  logicalNodeMap: Map<string, LogicalNode>
): CircuitWirePlacement[] {
  const terminalPlacementMap = new Map(
    terminalPlacements.map((placement) => [`${placement.componentId}:${placement.terminalId}`, placement])
  );
  const placedMap = new Map(placedComponents.map((placed) => [placed.component.id, placed]));

  return topology.connections.flatMap((connection) => {
    const placed = placedMap.get(connection.componentId);
    const terminalPlacement = terminalPlacementMap.get(`${connection.componentId}:${connection.terminalId}`);
    if (!placed || !terminalPlacement) {
      return [];
    }

    const nodePlacement = getPhysicalNode(logicalNodeMap, placed.edge, connection.nodeId);
    const terminal = placed.component.terminals.find((candidate) => candidate.id === connection.terminalId);

    if (!nodePlacement || !terminal) {
      return [];
    }

    const orientation = placed.placement.orientation || placed.component.orientation || "horizontal";
    const side = sideForTerminal(terminal, orientation);
    const connectedNodeId = getConnectionNodeId(
      topology.connections,
      connection.componentId,
      connection.terminalId
    );

    if (!connectedNodeId) {
      return [];
    }

    return [{
      id: `wire-${connection.id}`,
      connectionId: connection.id,
      points: wirePath(terminalPlacement, nodePlacement, side),
    }];
  });
}

function buildParallelLeadWires(parallelEdges: ParallelEdge[], nodes: LogicalNode[]): CircuitWirePlacement[] {
  const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));
  return parallelEdges.flatMap(({ edge }) => {
    const leftMain = nodeMap.get(edge.nodeA);
    const rightMain = nodeMap.get(edge.nodeB);
    const leftParallel = nodeMap.get(`${edge.nodeA}:parallel-${edge.component.id}`);
    const rightParallel = nodeMap.get(`${edge.nodeB}:parallel-${edge.component.id}`);
    if (!leftMain || !rightMain || !leftParallel || !rightParallel) {
      return [];
    }

    return [
      {
        id: `wire-${edge.component.id}-parallel-left`,
        connectionId: `${edge.component.id}-parallel-left`,
        points: [
          { x: leftMain.x, y: leftMain.y },
          { x: leftParallel.x, y: leftParallel.y },
        ],
      },
      {
        id: `wire-${edge.component.id}-parallel-right`,
        connectionId: `${edge.component.id}-parallel-right`,
        points: [
          { x: rightMain.x, y: rightMain.y },
          { x: rightParallel.x, y: rightParallel.y },
        ],
      },
    ];
  });
}

function computeBounds(
  nodes: LogicalNode[],
  components: CircuitComponentPlacement[],
  wires: CircuitWirePlacement[]
) {
  let maxX = PADDING_X * 2;
  let maxY = PADDING_Y * 2;

  nodes.forEach((node) => {
    maxX = Math.max(maxX, node.x + 90);
    maxY = Math.max(maxY, node.y + 70);
  });
  components.forEach((component) => {
    maxX = Math.max(maxX, component.x + component.width + 70);
    maxY = Math.max(maxY, component.y + component.height + 70);
  });
  wires.forEach((wire) => {
    wire.points.forEach((point) => {
      maxX = Math.max(maxX, point.x + 30);
      maxY = Math.max(maxY, point.y + 30);
    });
  });

  return {
    width: Math.max(520, maxX),
    height: Math.max(360, maxY),
  };
}

function addSyntheticTerminals(
  topology: CircuitTopology,
  nodes: LogicalNode[],
  mainPath: Edge[],
  branchEdges: Edge[]
): LogicalNode[] {
  const result = [...nodes];
  const hasLabel = (label: string) =>
    result.some((node) => normalizeLabel(node.label || node.nodeId) === label);
  const lastTop = result
    .filter((node) => node.y === TOP_Y)
    .sort((left, right) => right.x - left.x)[0];
  const bottomJunction = result
    .filter((node) => node.y === BOTTOM_Y && node.role !== "terminal")
    .sort((left, right) => right.x - left.x)[0];
  const endNodeX = (lastTop?.x || SOURCE_X) + END_STUB;

  if (!hasLabel("a") && mainPath.length > 0 && lastTop) {
    result.push({
      nodeId: `${lastTop.nodeId}:terminal-a`,
      x: endNodeX,
      y: TOP_Y,
      role: "terminal",
      label: "a",
    });
  }

  if (!hasLabel("b") && (branchEdges.length > 0 || bottomJunction)) {
    const referenceNodeId = bottomJunction?.nodeId || result.find((node) => node.y === BOTTOM_Y)?.nodeId || "b";
    result.push({
      nodeId: `${referenceNodeId}:terminal-b`,
      x: endNodeX,
      y: BOTTOM_Y,
      role: "terminal",
      label: "b",
    });
  }

  return result;
}

function buildSyntheticWirePlacements(nodes: LogicalNode[]): CircuitWirePlacement[] {
  const realNodes = nodes.filter((node) => !node.nodeId.includes(":terminal-"));
  const terminalWires = nodes
    .filter((node) => node.nodeId.includes(":terminal-"))
    .flatMap((terminalNode) => {
      const sourceNodeId = terminalNode.nodeId.split(":terminal-")[0];
      const sourceNode = realNodes.find((node) => node.nodeId === sourceNodeId);
      if (!sourceNode) {
        return [];
      }
      return [{
        id: `wire-${terminalNode.nodeId}`,
        connectionId: terminalNode.nodeId,
        points: [
          { x: sourceNode.x, y: sourceNode.y },
          { x: terminalNode.x, y: terminalNode.y },
        ],
      }];
    });

  const bottomRailNodes = realNodes
    .filter((node) => node.y === BOTTOM_Y)
    .sort((left, right) => left.x - right.x);

  const railWires = bottomRailNodes.length >= 2
    ? [{
        id: "wire-bottom-rail",
        connectionId: "bottom-rail",
        points: bottomRailNodes.map((node) => ({ x: node.x, y: node.y })),
      }]
    : [];

  return [...railWires, ...terminalWires];
}

function nodePlacementsForCanvas(nodes: LogicalNode[]) {
  return nodes.map((node) => ({
    nodeId: node.nodeId,
    x: node.x,
    y: node.y,
    role: node.role,
    label: node.label,
  }));
}

export function buildGraphCircuitLayout(topology: CircuitTopology): CircuitLayout | null {
  const edges = getEdges(topology);
  if (!edges || edges.length === 0) {
    return null;
  }

  const sourceEdge = findSource(edges);
  if (!sourceEdge) {
    return null;
  }

  const sourceTopNodeId = chooseSourceTopNode(topology, sourceEdge);
  const sourceBottomNodeId = otherNode(sourceEdge, sourceTopNodeId);
  const adjacency = buildAdjacency(edges);
  const mainPath = walkMainPath(topology, adjacency, sourceEdge, sourceTopNodeId);
  const mainNodeIds = new Set<string>([sourceTopNodeId]);
  let currentNodeId = sourceTopNodeId;
  mainPath.forEach((edge) => {
    currentNodeId = otherNode(edge, currentNodeId);
    mainNodeIds.add(currentNodeId);
  });

  const usedComponentIds = new Set<string>([
    sourceEdge.component.id,
    ...mainPath.map((edge) => edge.component.id),
  ]);
  const branchEdges = findBranchEdges(adjacency, mainNodeIds, usedComponentIds);
  const parallelEdges = findParallelEdges(edges, mainPath, usedComponentIds);
  const baseLogicalNodes = createLogicalNodes(
    topology,
    mainPath,
    sourceTopNodeId,
    sourceBottomNodeId,
    branchEdges,
    parallelEdges
  );
  const logicalNodes = addSyntheticTerminals(topology, baseLogicalNodes, mainPath, branchEdges);
  const logicalNodeMap = new Map(baseLogicalNodes.map((node) => [node.nodeId, node]));
  const placedComponents = buildComponentPlacements(
    sourceEdge,
    mainPath,
    [...branchEdges, ...parallelEdges.map((parallelEdge) => parallelEdge.edge)],
    logicalNodeMap,
    sourceTopNodeId,
    sourceBottomNodeId
  );
  const componentPlacements = placedComponents.map((placed) => placed.placement);
  const terminalPlacements = buildTerminalPlacements(placedComponents);
  const realWirePlacements = buildWirePlacements(topology, placedComponents, terminalPlacements, logicalNodeMap);
  const wirePlacements = [
    ...realWirePlacements,
    ...buildParallelLeadWires(parallelEdges, logicalNodes),
    ...buildSyntheticWirePlacements(logicalNodes),
  ];
  const bounds = computeBounds(logicalNodes, componentPlacements, wirePlacements);

  return {
    width: bounds.width,
    height: bounds.height,
    nodePlacements: nodePlacementsForCanvas(logicalNodes),
    componentPlacements,
    terminalPlacements,
    wirePlacements,
  };
}

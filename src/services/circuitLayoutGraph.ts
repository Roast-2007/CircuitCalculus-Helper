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

const PADDING_X = 80;
const PADDING_Y = 60;
const LAYER_GAP_X = 200;
const RANK_GAP_Y = 120;
const COMPONENT_W = 110;
const COMPONENT_H = 60;
const VERTICAL_W = 56;
const VERTICAL_H = 110;
const MULTI_TERMINAL_W = 120;
const MULTI_TERMINAL_H = 140;
const PARALLEL_OFFSET = 84;
const WIRE_STUB = 14;
const SUBGRAPH_GAP = 160;

type NodeId = string;
type ComponentId = string;
type Edge = { component: CircuitComponent; nodeA: NodeId; nodeB: NodeId };

const SOURCE_KINDS = new Set(["voltage_source", "current_source"]);
const CONTROLLED_SOURCE_KINDS = new Set(["vcvs", "vccs", "ccvs", "cccs"]);
const MULTI_TERMINAL_KINDS = new Set(["bjt", "mosfet", "opamp", "transformer"]);

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

// ── Graph building ──

function buildAdjacency(topology: CircuitTopology) {
  const nodeToComponents = new Map<NodeId, ComponentId[]>();
  const componentToNodes = new Map<ComponentId, NodeId[]>();

  for (const conn of topology.connections) {
    const component = topology.components.find((c) => c.id === conn.componentId);
    if (!component) continue;

    let nodeIds = componentToNodes.get(conn.componentId) || [];
    if (!nodeIds.includes(conn.nodeId)) {
      nodeIds.push(conn.nodeId);
      componentToNodes.set(conn.componentId, nodeIds);
    }

    let compIds = nodeToComponents.get(conn.nodeId) || [];
    if (!compIds.includes(conn.componentId)) {
      compIds.push(conn.componentId);
      nodeToComponents.set(conn.nodeId, compIds);
    }
  }

  return { nodeToComponents, componentToNodes };
}

// ── Connected subgraphs ──

function findSubgraphs(
  topology: CircuitTopology,
  nodeToComponents: Map<NodeId, ComponentId[]>,
  componentToNodes: Map<ComponentId, NodeId[]>
): Array<{ nodeIds: Set<NodeId>; componentIds: Set<ComponentId> }> {
  const visited = new Set<NodeId>();
  const subgraphs: Array<{ nodeIds: Set<NodeId>; componentIds: Set<ComponentId> }> = [];

  const allNodeIds = new Set<string>([
    ...topology.nodes.map((n) => n.id),
    ...Array.from(componentToNodes.values()).flat(),
  ]);

  for (const startNodeId of allNodeIds) {
    if (visited.has(startNodeId)) continue;

    const nodeIds = new Set<NodeId>();
    const componentIds = new Set<ComponentId>();
    const queue: NodeId[] = [startNodeId];
    visited.add(startNodeId);

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      nodeIds.add(nodeId);

      const compIds = nodeToComponents.get(nodeId) || [];
      for (const compId of compIds) {
        componentIds.add(compId);
        const neighborNodes = componentToNodes.get(compId) || [];
        for (const neighborId of neighborNodes) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        }
      }
    }

    subgraphs.push({ nodeIds, componentIds });
  }

  return subgraphs;
}

// ── Layer assignment ──

type NodeLayerInfo = { layer: number; rank: number };
type LayerAssignment = Map<NodeId, NodeLayerInfo>;

const GROUND_LABELS = new Set(["0", "gnd", "ground"]);

function isGroundNode(nodeId: string, nodes: CircuitNode[]): boolean {
  const label = normalizeLabel(nodeId);
  if (GROUND_LABELS.has(label)) return true;
  const node = nodes.find((n) => n.id === nodeId);
  return node?.kind === "ground";
}

function isTerminalLabel(nodeId: string): boolean {
  const label = normalizeLabel(nodeId);
  return ["a", "b", "out", "output"].includes(label);
}

function assignLayers(
  subgraph: { nodeIds: Set<string>; componentIds: Set<string> },
  topology: CircuitTopology,
  nodeToComponents: Map<NodeId, ComponentId[]>,
  componentToNodes: Map<ComponentId, NodeId[]>
): LayerAssignment {
  const layers = new Map<NodeId, NodeLayerInfo>();
  const componentMap = new Map(topology.components.map((c) => [c.id, c]));

  // Seed: ground nodes at layer 0, rank at bottom
  const groundNodes: NodeId[] = [];
  for (const nodeId of subgraph.nodeIds) {
    if (isGroundNode(nodeId, topology.nodes)) {
      groundNodes.push(nodeId);
    }
  }

  // Find source components (voltage_source, current_source)
  const sourceCompIds: ComponentId[] = [];
  for (const compId of subgraph.componentIds) {
    const comp = componentMap.get(compId);
    if (comp && SOURCE_KINDS.has(comp.kind)) {
      sourceCompIds.push(compId);
    }
  }

  // BFS layer assignment
  const visited = new Set<NodeId>();
  const queue: Array<{ nodeId: NodeId; layer: number }> = [];

  // Start from ground nodes (layer 0)
  for (const nodeId of groundNodes) {
    layers.set(nodeId, { layer: 0, rank: 0 });
    visited.add(nodeId);
  }

  // Start from source non-ground-side nodes (layer 0 or 1)
  for (const compId of sourceCompIds) {
    const nodeIds = componentToNodes.get(compId) || [];
    const nonGround = nodeIds.filter((nid) => !isGroundNode(nid, topology.nodes));
    const ground = nodeIds.filter((nid) => isGroundNode(nid, topology.nodes));

    for (const nid of nonGround) {
      if (!visited.has(nid)) {
        const srcLayer = ground.length > 0 ? 1 : 0;
        layers.set(nid, { layer: srcLayer, rank: 0 });
        visited.add(nid);
        queue.push({ nodeId: nid, layer: srcLayer });
      }
    }
    for (const nid of ground) {
      if (!visited.has(nid)) {
        layers.set(nid, { layer: 0, rank: 0 });
        visited.add(nid);
      }
    }
  }

  // If no sources, start from terminal nodes or first node
  if (queue.length === 0 && visited.size === 0) {
    for (const nodeId of subgraph.nodeIds) {
      if (isTerminalLabel(nodeId)) {
        const termLayer = nodeId.toLowerCase() === "b" ? 2 : 0;
        layers.set(nodeId, { layer: termLayer, rank: 0 });
        visited.add(nodeId);
        queue.push({ nodeId, layer: termLayer });
      }
    }
  }

  // If still nothing, start at layer 0 with first node
  if (queue.length === 0 && visited.size === 0) {
    const firstNode = Array.from(subgraph.nodeIds)[0];
    if (firstNode) {
      layers.set(firstNode, { layer: 0, rank: 0 });
      visited.add(firstNode);
      queue.push({ nodeId: firstNode, layer: 0 });
    }
  }

  // BFS from queued nodes
  while (queue.length > 0) {
    const current = queue.shift()!;
    const compIds = nodeToComponents.get(current.nodeId) || [];

    for (const compId of compIds) {
      if (!subgraph.componentIds.has(compId)) continue;
      const comp = componentMap.get(compId);
      if (!comp) continue;

      // Skip multi-terminal — handled separately
      if (comp.terminals.length > 2) continue;

      const nodeIds = componentToNodes.get(compId) || [];
      const nextNodeId = nodeIds.find((nid) => nid !== current.nodeId);
      if (!nextNodeId || visited.has(nextNodeId)) continue;

      const nextLayer = current.layer + 1;
      layers.set(nextNodeId, { layer: nextLayer, rank: 0 });
      visited.add(nextNodeId);
      queue.push({ nodeId: nextNodeId, layer: nextLayer });
    }
  }

  // Assign remaining unvisited nodes
  for (const nodeId of subgraph.nodeIds) {
    if (!visited.has(nodeId)) {
      const maxLayer = Math.max(0, ...Array.from(layers.values()).map((l) => l.layer));
      layers.set(nodeId, { layer: maxLayer + 1, rank: 0 });
      visited.add(nodeId);
    }
  }

  // Assign ranks within each layer (top-to-bottom order)
  const layerGroups = new Map<number, NodeId[]>();
  for (const [nodeId, info] of layers) {
    let group = layerGroups.get(info.layer);
    if (!group) {
      group = [];
      layerGroups.set(info.layer, group);
    }
    group.push(nodeId);
  }

  for (const [, nodeIds] of layerGroups) {
    // Sort: ground nodes at bottom, terminal 'b' near bottom, others top
    const sorted = [...nodeIds].sort((a, b) => {
      const aIsGround = isGroundNode(a, topology.nodes) ? 1 : 0;
      const bIsGround = isGroundNode(b, topology.nodes) ? 1 : 0;
      if (aIsGround !== bIsGround) return aIsGround - bIsGround;

      const aIsB = normalizeLabel(a) === "b" ? 1 : 0;
      const bIsB = normalizeLabel(b) === "b" ? 1 : 0;
      return aIsB - bIsB;
    });

    sorted.forEach((nodeId, rank) => {
      const info = layers.get(nodeId)!;
      layers.set(nodeId, { ...info, rank });
    });
  }

  return layers;
}

// ── Physical placement ──

type Position = { x: number; y: number };
type PlacedResult = {
  nodePositions: Map<NodeId, Position>;
  componentPlacements: CircuitComponentPlacement[];
  terminalPlacements: CircuitTerminalPlacement[];
  wirePlacements: CircuitWirePlacement[];
  maxX: number;
  maxY: number;
};

function computeDimensions(component: CircuitComponent): { w: number; h: number } {
  if (MULTI_TERMINAL_KINDS.has(component.kind)) {
    return { w: MULTI_TERMINAL_W, h: MULTI_TERMINAL_H };
  }
  if (
    component.orientation === "vertical" ||
    SOURCE_KINDS.has(component.kind) ||
    CONTROLLED_SOURCE_KINDS.has(component.kind)
  ) {
    return { w: VERTICAL_W, h: VERTICAL_H };
  }
  return { w: COMPONENT_W, h: COMPONENT_H };
}

function getEffectiveOrientation(nodeA: Position, nodeB: Position, comp: CircuitComponent): ComponentOrientation {
  if (comp.orientation === "vertical") return "vertical";
  if (comp.orientation === "horizontal") return "horizontal";
  const dx = Math.abs(nodeB.x - nodeA.x);
  const dy = Math.abs(nodeB.y - nodeA.y);
  return dy > dx * 1.2 ? "vertical" : "horizontal";
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

function getTerminalPosition(
  placement: CircuitComponentPlacement,
  terminal: CircuitTerminal,
  orientation: ComponentOrientation,
  index: number,
  total: number
): CircuitTerminalPlacement {
  const fraction = total <= 1 ? 0.5 : (index + 1) / (total + 1);
  const side = sideForTerminal(terminal, orientation);

  if (side === "right") return { componentId: placement.componentId, terminalId: terminal.id, x: placement.x + placement.width, y: placement.y + placement.height * fraction };
  if (side === "top") return { componentId: placement.componentId, terminalId: terminal.id, x: placement.x + placement.width * fraction, y: placement.y };
  if (side === "bottom") return { componentId: placement.componentId, terminalId: terminal.id, x: placement.x + placement.width * fraction, y: placement.y + placement.height };
  return { componentId: placement.componentId, terminalId: terminal.id, x: placement.x, y: placement.y + placement.height * fraction };
}

function wirePath(start: CircuitPoint, end: CircuitPoint, side: CircuitTerminal["side"]): CircuitPoint[] {
  const points: CircuitPoint[] = [{ x: start.x, y: start.y }];
  let stubX = start.x;
  let stubY = start.y;

  if (side === "right") stubX += WIRE_STUB;
  else if (side === "left") stubX -= WIRE_STUB;
  else if (side === "top") stubY -= WIRE_STUB;
  else stubY += WIRE_STUB;

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

// ── Main layout function ──

function placeSubgraph(
  subgraph: { nodeIds: Set<string>; componentIds: Set<string> },
  topology: CircuitTopology,
  layers: LayerAssignment,
  nodeToComponents: Map<NodeId, ComponentId[]>,
  componentToNodes: Map<ComponentId, NodeId[]>,
  offsetY: number
): PlacedResult {
  const nodePositions = new Map<NodeId, Position>();
  const componentPlacements: CircuitComponentPlacement[] = [];
  const terminalPlacements: CircuitTerminalPlacement[] = [];
  const wirePlacements: CircuitWirePlacement[] = [];
  const componentMap = new Map(topology.components.map((c) => [c.id, c]));

  // 1. Place nodes
  const maxLayer = Math.max(0, ...Array.from(layers.values()).map((l) => l.layer));
  for (const [nodeId, info] of layers) {
    nodePositions.set(nodeId, {
      x: PADDING_X + info.layer * LAYER_GAP_X,
      y: offsetY + PADDING_Y + info.rank * RANK_GAP_Y,
    });
  }

  // 2. Track parallel edges on same node pair
  const pairCounts = new Map<string, number>();
  const getPairKey = (nA: string, nB: string) => [nA, nB].sort().join("::");

  // First pass: count parallel edges
  const twoTermComponents: Array<{ comp: CircuitComponent; nA: NodeId; nB: NodeId }> = [];
  const multiTermComponents: CircuitComponent[] = [];

  for (const compId of subgraph.componentIds) {
    const comp = componentMap.get(compId);
    if (!comp) continue;

    const nodeIds = componentToNodes.get(compId) || [];
    if (comp.terminals.length <= 2 || MULTI_TERMINAL_KINDS.has(comp.kind)) {
      if (nodeIds.length >= 2) {
        const key = getPairKey(nodeIds[0], nodeIds[1]);
        const count = (pairCounts.get(key) || 0) + 1;
        pairCounts.set(key, count);
        twoTermComponents.push({ comp, nA: nodeIds[0], nB: nodeIds[1] });
      } else if (nodeIds.length === 1) {
        twoTermComponents.push({ comp, nA: nodeIds[0], nB: nodeIds[0] });
      }
    } else {
      multiTermComponents.push(comp);
    }
  }

  // 3. Place two-terminal components
  const pairOffsets = new Map<string, number>();
  for (const { comp, nA, nB } of twoTermComponents) {
    if (nA === nB) {
      // Single-node component (like ground) — place at node
      const pos = nodePositions.get(nA);
      if (!pos) continue;
      const dims = computeDimensions(comp);
      componentPlacements.push({
        componentId: comp.id,
        x: pos.x - dims.w / 2,
        y: pos.y + 30,
        width: dims.w,
        height: dims.h,
        orientation: "vertical",
      });
      continue;
    }

    const posA = nodePositions.get(nA);
    const posB = nodePositions.get(nB);
    if (!posA || !posB) continue;

    const key = getPairKey(nA, nB);
    const offsetIdx = pairOffsets.get(key) || 0;
    pairOffsets.set(key, offsetIdx + 1);
    const totalInPair = pairCounts.get(key) || 1;

    const orientation = getEffectiveOrientation(posA, posB, comp);
    const dims = computeDimensions(comp);

    let cx: number;
    let cy: number;

    if (orientation === "vertical") {
      cx = posA.x;
      cy = (posA.y + posB.y) / 2;
    } else {
      cx = (posA.x + posB.x) / 2;
      cy = (posA.y + posB.y) / 2;
    }

    // Apply parallel offset
    if (totalInPair > 1 && orientation === "horizontal") {
      const offset = (offsetIdx - (totalInPair - 1) / 2) * PARALLEL_OFFSET;
      cy += offset;
    } else if (totalInPair > 1 && orientation === "vertical") {
      const offset = (offsetIdx - (totalInPair - 1) / 2) * PARALLEL_OFFSET;
      cx += offset;
    }

    const placement: CircuitComponentPlacement = {
      componentId: comp.id,
      x: cx - dims.w / 2,
      y: cy - dims.h / 2,
      width: dims.w,
      height: dims.h,
      orientation,
    };
    componentPlacements.push(placement);

    // Terminal placements
    const bySide = new Map<CircuitTerminal["side"], CircuitTerminal[]>();
    comp.terminals.forEach((t) => {
      const side = sideForTerminal(t, orientation);
      let group = bySide.get(side);
      if (!group) { group = []; bySide.set(side, group); }
      group.push(t);
    });

    comp.terminals.forEach((terminal) => {
      const side = sideForTerminal(terminal, orientation);
      const group = bySide.get(side) || [];
      const idx = group.findIndex((t) => t.id === terminal.id);
      terminalPlacements.push(getTerminalPosition(placement, terminal, orientation, idx, group.length));
    });

    // Wire from terminals to nodes
    const termPosA = terminalPlacements.find(
      (tp) => tp.componentId === comp.id && tp.terminalId === comp.terminals[0]?.id
    );
    const termPosB = terminalPlacements.find(
      (tp) => tp.componentId === comp.id && tp.terminalId === comp.terminals[1]?.id
    );

    if (termPosA && posA) {
      wirePlacements.push({
        id: `wire-${comp.id}-a`,
        connectionId: `${comp.id}-a`,
        points: wirePath(termPosA, posA, sideForTerminal(comp.terminals[0], orientation)),
      });
    }
    if (termPosB && posB && comp.terminals[1]) {
      wirePlacements.push({
        id: `wire-${comp.id}-b`,
        connectionId: `${comp.id}-b`,
        points: wirePath(termPosB, posB, sideForTerminal(comp.terminals[1], orientation)),
      });
    }
  }

  // 4. Place multi-terminal components
  let multiTermY = offsetY + PADDING_Y;
  for (const comp of multiTermComponents) {
    const nodeIds = componentToNodes.get(comp.id) || [];
    const dims = computeDimensions(comp);

    // Find a position near connected nodes
    let avgX = 0;
    let avgY = multiTermY;
    let connectedCount = 0;
    for (const nid of nodeIds) {
      const pos = nodePositions.get(nid);
      if (pos) {
        avgX += pos.x;
        avgY = Math.max(avgY, pos.y);
        connectedCount++;
      }
    }
    if (connectedCount > 0) {
      avgX /= connectedCount;
    } else {
      avgX = PADDING_X + (maxLayer + 1) * LAYER_GAP_X;
    }

    const placement: CircuitComponentPlacement = {
      componentId: comp.id,
      x: avgX - dims.w / 2,
      y: avgY - dims.h / 2,
      width: dims.w,
      height: dims.h,
      orientation: "horizontal",
    };
    componentPlacements.push(placement);
    multiTermY += dims.h + 40;

    // Terminal placements
    const orientation = "horizontal" as ComponentOrientation;
    const bySide = new Map<CircuitTerminal["side"], CircuitTerminal[]>();
    comp.terminals.forEach((t) => {
      const side = sideForTerminal(t, orientation);
      let group = bySide.get(side);
      if (!group) { group = []; bySide.set(side, group); }
      group.push(t);
    });

    comp.terminals.forEach((terminal) => {
      const side = sideForTerminal(terminal, orientation);
      const group = bySide.get(side) || [];
      const idx = group.findIndex((t) => t.id === terminal.id);
      terminalPlacements.push(getTerminalPosition(placement, terminal, orientation, idx, group.length));
    });

    // Wire from terminals to connected nodes
    for (const terminal of comp.terminals) {
      const nodeMap = getComponentNodeMap(topology, comp.id);
      const nodeId = nodeMap[terminal.id];
      if (!nodeId) continue;
      const nodePos = nodePositions.get(nodeId);
      if (!nodePos) continue;
      const termPos = terminalPlacements.find(
        (tp) => tp.componentId === comp.id && tp.terminalId === terminal.id
      );
      if (!termPos) continue;

      wirePlacements.push({
        id: `wire-${comp.id}-${terminal.id}`,
        connectionId: `${comp.id}-${terminal.id}`,
        points: wirePath(termPos, nodePos, sideForTerminal(terminal, orientation)),
      });
    }
  }

  // 5. Draw inter-node wires (for nodes directly connected through junctions)
  // Nodes at same position connected via multiple components should have bus wires
  const drawnWires = new Set<string>();
  for (const [, pos] of nodePositions) {
    for (const [, pos2] of nodePositions) {
      if (pos === pos2) continue;
      if (Math.abs(pos.x - pos2.x) < 2 && Math.abs(pos.y - pos2.y) < 2) continue;
    }
  }

  // 6. Compute bounds
  let maxX = PADDING_X * 2;
  let maxY = offsetY + PADDING_Y * 2;
  for (const [, pos] of nodePositions) {
    maxX = Math.max(maxX, pos.x + 80);
    maxY = Math.max(maxY, pos.y + 40);
  }
  for (const cp of componentPlacements) {
    maxX = Math.max(maxX, cp.x + cp.width + 60);
    maxY = Math.max(maxY, cp.y + cp.height + 40);
  }
  for (const wp of wirePlacements) {
    for (const pt of wp.points) {
      maxX = Math.max(maxX, pt.x + 20);
      maxY = Math.max(maxY, pt.y + 20);
    }
  }

  return {
    nodePositions,
    componentPlacements,
    terminalPlacements,
    wirePlacements,
    maxX,
    maxY: Math.max(maxY, multiTermY + 100),
  };
}

// ── Node placement output ──

function buildNodePlacements(
  nodePositions: Map<NodeId, Position>,
  topology: CircuitTopology
) {
  const result: CircuitLayout["nodePlacements"] = [];
  for (const [nodeId, pos] of nodePositions) {
    const node = topology.nodes.find((n) => n.id === nodeId);
    const isGnd = node?.kind === "ground" || isGroundNode(nodeId, topology.nodes);
    result.push({
      nodeId,
      x: pos.x,
      y: pos.y,
      label: node?.label || nodeId,
      role: isTerminalLabel(nodeId) ? "terminal" : isGnd ? undefined : "junction",
    });
  }
  return result;
}

// ── Export ──

export function buildGraphCircuitLayout(topology: CircuitTopology): CircuitLayout | null {
  if (topology.components.length === 0 || topology.connections.length === 0) {
    return null;
  }

  const { nodeToComponents, componentToNodes } = buildAdjacency(topology);
  const subgraphs = findSubgraphs(topology, nodeToComponents, componentToNodes);

  if (subgraphs.length === 0) return null;

  const allNodePositions = new Map<NodeId, Position>();
  const allComponentPlacements: CircuitComponentPlacement[] = [];
  const allTerminalPlacements: CircuitTerminalPlacement[] = [];
  const allWirePlacements: CircuitWirePlacement[] = [];
  let globalMaxX = 0;
  let currentY = 0;

  for (const subgraph of subgraphs) {
    const layers = assignLayers(subgraph, topology, nodeToComponents, componentToNodes);
    const result = placeSubgraph(
      subgraph,
      topology,
      layers,
      nodeToComponents,
      componentToNodes,
      currentY
    );

    // Merge results
    for (const [nodeId, pos] of result.nodePositions) {
      allNodePositions.set(nodeId, pos);
    }
    allComponentPlacements.push(...result.componentPlacements);
    allTerminalPlacements.push(...result.terminalPlacements);
    allWirePlacements.push(...result.wirePlacements);
    globalMaxX = Math.max(globalMaxX, result.maxX);
    currentY = result.maxY + SUBGRAPH_GAP;
  }

  // Add any node IDs from connections that weren't placed (isolated nodes)
  for (const [nodeId] of nodeToComponents) {
    if (!allNodePositions.has(nodeId)) {
      allNodePositions.set(nodeId, { x: PADDING_X, y: currentY });
      currentY += RANK_GAP_Y;
    }
  }

  return {
    width: Math.max(520, globalMaxX),
    height: Math.max(360, currentY),
    nodePlacements: buildNodePlacements(allNodePositions, topology),
    componentPlacements: allComponentPlacements,
    terminalPlacements: allTerminalPlacements,
    wirePlacements: allWirePlacements,
  };
}

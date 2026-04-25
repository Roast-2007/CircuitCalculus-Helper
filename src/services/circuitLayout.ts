import { getCircuitCatalogItem } from "../constants/circuitCatalog";
import {
  CircuitComponent,
  CircuitComponentPlacement,
  CircuitLayout,
  CircuitNodeKind,
  CircuitPoint,
  CircuitTerminal,
  CircuitTerminalPlacement,
  CircuitTopology,
  CircuitWirePlacement,
  ComponentOrientation,
} from "../types";
import { buildGraphCircuitLayout } from "./circuitLayoutGraph";
import { getComponentNodeMap } from "./circuitSerialize";

const COMPONENT_WIDTH = 120;
const COMPONENT_HEIGHT = 64;
const RAIL_GAP_Y = 200;
const NODE_STUB = 28;
const WIRE_STUB = 14;
const PADDING_X = 80;
const PADDING_Y = 60;

type TerminalPositionMap = Record<string, CircuitTerminalPlacement>;
type NodeConnection = {
  componentId: string;
  terminalId: string;
  terminal: CircuitTerminal;
};

function isSourceKind(kind: string): boolean {
  return ["voltage_source", "current_source"].includes(kind);
}

function getComponentMap(topology: CircuitTopology): Map<string, CircuitComponent> {
  return new Map(topology.components.map((component) => [component.id, component]));
}

function buildConnectionsByNode(topology: CircuitTopology): Map<string, NodeConnection[]> {
  const componentMap = getComponentMap(topology);
  return topology.connections.reduce<Map<string, NodeConnection[]>>((acc, connection) => {
    const component = componentMap.get(connection.componentId);
    const terminal = component?.terminals.find((t) => t.id === connection.terminalId);
    if (!component || !terminal) return acc;
    const entries = acc.get(connection.nodeId) || [];
    entries.push({ componentId: connection.componentId, terminalId: connection.terminalId, terminal });
    acc.set(connection.nodeId, entries);
    return acc;
  }, new Map());
}

function isGroundNode(nodeId: string, topology: CircuitTopology): boolean {
  return topology.nodes.find((n) => n.id === nodeId)?.kind === "ground";
}

function getComponentOrientation(component: CircuitComponent): ComponentOrientation {
  return component.orientation || "auto";
}

function getComponentDimensions(component: CircuitComponent): { width: number; height: number } {
  const o = getComponentOrientation(component);
  if (o === "vertical") return { width: COMPONENT_HEIGHT, height: COMPONENT_WIDTH };
  return { width: COMPONENT_WIDTH, height: COMPONENT_HEIGHT };
}

function getEffectiveSide(terminal: CircuitTerminal, orientation: ComponentOrientation): CircuitTerminal["side"] {
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
  index: number,
  total: number
): CircuitTerminalPlacement {
  const fraction = total <= 1 ? 0.5 : (index + 1) / (total + 1);
  let x: number;
  let y: number;
  switch (terminal.side) {
    case "right": x = placement.x + placement.width; y = placement.y + placement.height * fraction; break;
    case "top": x = placement.x + placement.width * fraction; y = placement.y; break;
    case "bottom": x = placement.x + placement.width * fraction; y = placement.y + placement.height; break;
    default: x = placement.x; y = placement.y + placement.height * fraction;
  }
  return { componentId: placement.componentId, terminalId: terminal.id, x, y };
}

function buildTerminalPlacements(
  components: CircuitComponent[],
  componentPlacements: CircuitComponentPlacement[]
): CircuitTerminalPlacement[] {
  const placementMap = new Map(componentPlacements.map((p) => [p.componentId, p]));
  return components.flatMap((component) => {
    const placement = placementMap.get(component.id);
    if (!placement) return [];
    const orientation = getComponentOrientation(component);
    const bySide = new Map<CircuitTerminal["side"], CircuitTerminal[]>();
    component.terminals.forEach((t) => {
      const side = getEffectiveSide(t, orientation);
      const bucket = bySide.get(side) || [];
      bucket.push(t);
      bySide.set(side, bucket);
    });
    return component.terminals.map((terminal) => {
      const side = getEffectiveSide(terminal, orientation);
      const sameSide = bySide.get(side) || [];
      const idx = sameSide.findIndex((t) => t.id === terminal.id);
      return getTerminalPosition(placement, terminal, idx, sameSide.length);
    });
  });
}

function createTerminalPositionMap(placements: CircuitTerminalPlacement[]): TerminalPositionMap {
  const map: TerminalPositionMap = {};
  placements.forEach((p) => { map[`${p.componentId}:${p.terminalId}`] = p; });
  return map;
}

// ── Rail-based layout engine ──

type ComponentEntry = {
  componentId: string;
  rail: "top" | "bottom" | "left";
  position: number;
};

function assignRailLayout(
  topology: CircuitTopology,
  connectionsByNode: Map<string, NodeConnection[]>
): ComponentEntry[] {
  const componentMap = getComponentMap(topology);
  const components = topology.components;
  if (components.length === 0) return [];

  // Step 1: find all ground nodes
  const groundNodeIds = new Set<string>();
  for (const [nodeId] of connectionsByNode) {
    if (isGroundNode(nodeId, topology)) groundNodeIds.add(nodeId);
  }

  // Step 2: classify components
  // - "left": voltage/current source that connects to ground → vertical, left edge
  // - "bottom": ground component (actual ground symbol)
  // - "top": everything else, arranged left→right

  // Find the source that connects to ground — this becomes the left anchor
  let leftSourceId: string | null = null;
  components.forEach((c) => {
    if (["voltage_source", "current_source"].includes(c.kind)) {
      const nodeIds = new Set(
        topology.connections
          .filter((conn) => conn.componentId === c.id)
          .map((conn) => conn.nodeId)
      );
      const touchesGround = Array.from(nodeIds).some((nid) => groundNodeIds.has(nid));
      const touchesNonGround = Array.from(nodeIds).some((nid) => !groundNodeIds.has(nid));
      if (touchesGround && touchesNonGround) leftSourceId = c.id;
    }
  });

  // BFS from source to assign top-rail positions
  const rail = new Map<string, "top" | "bottom" | "left">();
  const position = new Map<string, number>();
  const visited = new Set<string>();

  if (leftSourceId) {
    rail.set(leftSourceId, "left");
    position.set(leftSourceId, 0);
    visited.add(leftSourceId);

    // Find components connected to the source's non-ground node
    const sourceNodeIds = new Set(
      topology.connections
        .filter((conn) => conn.componentId === leftSourceId)
        .map((conn) => conn.nodeId)
        .filter((nid) => !groundNodeIds.has(nid))
    );

    const queue: { componentId: string; pos: number }[] = [];
    for (const nodeId of sourceNodeIds) {
      const nodeConns = connectionsByNode.get(nodeId) || [];
      for (const conn of nodeConns) {
        if (conn.componentId !== leftSourceId && !visited.has(conn.componentId)) {
          visited.add(conn.componentId);
          rail.set(conn.componentId, "top");
          position.set(conn.componentId, queue.length + 1);
          queue.push({ componentId: conn.componentId, pos: queue.length + 1 });
        }
      }
    }

    // BFS for remaining components
    const compQueue = [...queue];
    const seen = new Set<string>(compQueue.map((q) => q.componentId));
    seen.add(leftSourceId);

    while (compQueue.length > 0) {
      const current = compQueue.shift()!;
      const currentNodeIds = new Set(
        topology.connections
          .filter((conn) => conn.componentId === current.componentId)
          .map((conn) => conn.nodeId)
      );

      for (const nodeId of currentNodeIds) {
        if (groundNodeIds.has(nodeId)) continue;
        const nodeConns = connectionsByNode.get(nodeId) || [];
        for (const conn of nodeConns) {
          if (seen.has(conn.componentId)) continue;
          const comp = componentMap.get(conn.componentId);
          if (!comp) continue;

          seen.add(conn.componentId);

          // Check if this component also connects to ground via any of its nodes
          const compNodeIds = new Set(
            topology.connections
              .filter((c) => c.componentId === conn.componentId)
              .map((c) => c.nodeId)
          );
          const touchesGround = Array.from(compNodeIds).some((nid) => groundNodeIds.has(nid));

          if (touchesGround && !isSourceKind(comp.kind)) {
            // Vertical branch: connects top-rail node to ground → place on bottom rail at same column
            rail.set(conn.componentId, "bottom");
            position.set(conn.componentId, current.pos);
          } else {
            rail.set(conn.componentId, "top");
            position.set(conn.componentId, current.pos + 1);
            compQueue.push({ componentId: conn.componentId, pos: current.pos + 1 });
          }
        }
      }
    }
  }

  // Place remaining unvisited components
  let nextTop = position.size;
  components.forEach((c) => {
    if (!visited.has(c.id)) {
      visited.add(c.id);
      if (c.kind === "ground" || ["ground", "probe"].includes(c.kind)) {
        rail.set(c.id, "bottom");
        position.set(c.id, 0);
      } else {
        rail.set(c.id, "top");
        position.set(c.id, nextTop);
        nextTop += 1;
      }
    }
  });

  return components.map((c) => ({
    componentId: c.id,
    rail: rail.get(c.id) || "top",
    position: position.get(c.id) ?? 0,
  }));
}

function createComponentPlacements(
  topology: CircuitTopology,
  connectionsByNode: Map<string, NodeConnection[]>
): CircuitComponentPlacement[] {
  const entries = assignRailLayout(topology, connectionsByNode);
  const placements: CircuitComponentPlacement[] = [];

  for (const entry of entries) {
    const comp = topology.components.find((c) => c.id === entry.componentId);
    if (!comp) continue;
    const dims = getComponentDimensions(comp);

    if (entry.rail === "left") {
      // Vertical source on the left edge, spanning both rails
      placements.push({
        componentId: entry.componentId,
        x: PADDING_X - COMPONENT_HEIGHT / 2,
        y: PADDING_Y,
        width: COMPONENT_HEIGHT,
        height: RAIL_GAP_Y,
      });
    } else if (entry.rail === "top") {
      placements.push({
        componentId: entry.componentId,
        x: PADDING_X + entry.position * COMPONENT_WIDTH,
        y: PADDING_Y,
        width: dims.width,
        height: dims.height,
      });
    } else {
      // Bottom rail (ground symbols etc.)
      placements.push({
        componentId: entry.componentId,
        x: PADDING_X + entry.position * COMPONENT_WIDTH,
        y: PADDING_Y + RAIL_GAP_Y,
        width: dims.width,
        height: dims.height,
      });
    }
  }

  return placements;
}

function createNodePlacements(
  topology: CircuitTopology,
  componentPlacements: CircuitComponentPlacement[],
  terminalPlacements: CircuitTerminalPlacement[],
  connectionsByNode: Map<string, NodeConnection[]>
) {
  const terminalMap = createTerminalPositionMap(terminalPlacements);
  const componentMap = getComponentMap(topology);

  return topology.nodes.map((node) => {
    const conns = connectionsByNode.get(node.id) || [];
    if (conns.length === 0) {
      return { nodeId: node.id, x: PADDING_X, y: PADDING_Y };
    }

    const points = conns
      .map((c) => terminalMap[`${c.componentId}:${c.terminalId}`])
      .filter(Boolean) as CircuitTerminalPlacement[];

    if (points.length === 0) {
      return { nodeId: node.id, x: PADDING_X, y: PADDING_Y };
    }

    const isGround = isGroundNode(node.id, topology);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);

    const connectsToTop = points.some((p) => p.y < PADDING_Y + RAIL_GAP_Y * 0.5);
    const connectsToBottom = points.some((p) => p.y >= PADDING_Y + RAIL_GAP_Y * 0.5);

    let x: number;
    let y: number;

    if (isGround) {
      // Ground node: place below bottom rail, centered horizontally
      x = xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : PADDING_X;
      y = maxY + 36;
    } else if (connectsToTop && connectsToBottom) {
      // Junction node between rails — midpoint
      x = xs.reduce((a, b) => a + b, 0) / xs.length;
      y = (minY + maxY) / 2;
    } else if (points.length === 1) {
      // Single terminal: offset away from component center
      const p = points[0];
      const comp = componentMap.get(p.componentId);
      const cp = comp && componentPlacements.find((c) => c.componentId === comp.id);
      if (cp) {
        const compCenterX = cp.x + cp.width / 2;
        const compCenterY = cp.y + cp.height / 2;
        // Offset in the direction away from component center
        const dx = p.x - compCenterX;
        const dy = p.y - compCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const offset = NODE_STUB;
        x = p.x + (dx / dist) * offset;
        y = p.y + (dy / dist) * offset;
      } else {
        x = p.x;
        y = p.y;
      }
    } else {
      // Same-rail multi-terminal: midpoint
      x = xs.reduce((a, b) => a + b, 0) / xs.length;
      y = connectsToTop ? minY : maxY;
    }

    // Push node out of component bounding boxes
    for (const cp of componentPlacements) {
      const inside = x > cp.x + 2 && x < cp.x + cp.width - 2 &&
        y > cp.y + 2 && y < cp.y + cp.height - 2;
      if (inside) {
        const dxL = cp.x - x;
        const dxR = cp.x + cp.width - x;
        const dyT = cp.y - y;
        const dyB = cp.y + cp.height - y;
        const minDist = Math.min(Math.abs(dxL), Math.abs(dxR), Math.abs(dyT), Math.abs(dyB));
        if (minDist === Math.abs(dxL)) x = cp.x - 12;
        else if (minDist === Math.abs(dxR)) x = cp.x + cp.width + 12;
        else if (minDist === Math.abs(dyT)) y = cp.y - 12;
        else y = cp.y + cp.height + 12;
      }
    }

    return { nodeId: node.id, x, y };
  });
}

function createWirePath(start: CircuitPoint, end: CircuitPoint, side: CircuitTerminal["side"]): CircuitPoint[] {
  const stub = WIRE_STUB;
  let sx = start.x;
  let sy = start.y;

  switch (side) {
    case "right": sx += stub; break;
    case "left": sx -= stub; break;
    case "top": sy -= stub; break;
    case "bottom": sy += stub; break;
  }

  const points: CircuitPoint[] = [{ x: start.x, y: start.y }];
  if (sx !== start.x || sy !== start.y) points.push({ x: sx, y: sy });

  if (side === "left" || side === "right") {
    if (sx !== end.x) points.push({ x: end.x, y: sy });
    if (sy !== end.y) points.push({ x: end.x, y: end.y });
  } else {
    if (sy !== end.y) points.push({ x: sx, y: end.y });
    if (sx !== end.x) points.push({ x: end.x, y: end.y });
  }

  return points;
}

function buildWirePlacements(
  topology: CircuitTopology,
  terminalPositionMap: TerminalPositionMap,
  nodePlacementMap: Map<string, { x: number; y: number }>,
  connectionsByNode: Map<string, NodeConnection[]>,
  componentMap: Map<string, CircuitComponent>
): CircuitWirePlacement[] {
  return topology.connections.flatMap((conn) => {
    const start = terminalPositionMap[`${conn.componentId}:${conn.terminalId}`];
    const end = nodePlacementMap.get(conn.nodeId);
    if (!start || !end) return [];

    const nodeConns = connectionsByNode.get(conn.nodeId) || [];
    const entry = nodeConns.find((e) => e.componentId === conn.componentId && e.terminalId === conn.terminalId);
    if (!entry) return [];

    const comp = componentMap.get(conn.componentId);
    const orientation = comp ? getComponentOrientation(comp) : "auto";
    const side = getEffectiveSide(entry.terminal, orientation);

    return [{
      id: `wire-${conn.id}`,
      connectionId: conn.id,
      points: createWirePath(start, end, side),
    }];
  });
}

function computeLayoutBounds(
  componentPlacements: CircuitComponentPlacement[],
  nodePlacements: Array<{ nodeId: string; x: number; y: number }>,
  wirePlacements: CircuitWirePlacement[]
) {
  let maxX = PADDING_X * 2;
  let maxY = PADDING_Y * 2;

  componentPlacements.forEach((p) => {
    maxX = Math.max(maxX, p.x + p.width + PADDING_X);
    maxY = Math.max(maxY, p.y + p.height + 40);
  });
  nodePlacements.forEach((p) => {
    maxX = Math.max(maxX, p.x + 60);
    maxY = Math.max(maxY, p.y + 30);
  });
  wirePlacements.forEach((w) => {
    w.points.forEach((pt) => {
      maxX = Math.max(maxX, pt.x + 20);
      maxY = Math.max(maxY, pt.y + 20);
    });
  });

  return { width: Math.max(360, maxX), height: Math.max(240, maxY) };
}

export function ensureCircuitLayout(topology: CircuitTopology): CircuitLayout {
  if (topology.layout && topology.layout.componentPlacements.length > 0) {
    return topology.layout;
  }

  const graphLayout = buildGraphCircuitLayout(topology);
  if (graphLayout) {
    return graphLayout;
  }

  const componentMap = getComponentMap(topology);
  const connectionsByNode = buildConnectionsByNode(topology);
  const componentPlacements = createComponentPlacements(topology, connectionsByNode);
  const terminalPlacements = buildTerminalPlacements(topology.components, componentPlacements);
  const terminalPositionMap = createTerminalPositionMap(terminalPlacements);
  const nodePlacements = createNodePlacements(topology, componentPlacements, terminalPlacements, connectionsByNode);
  const nodePlacementMap = new Map(nodePlacements.map((p) => [p.nodeId, p]));
  const wirePlacements = buildWirePlacements(topology, terminalPositionMap, nodePlacementMap, connectionsByNode, componentMap);
  const bounds = computeLayoutBounds(componentPlacements, nodePlacements, wirePlacements);

  return {
    width: bounds.width,
    height: bounds.height,
    nodePlacements,
    componentPlacements,
    terminalPlacements,
    wirePlacements,
  };
}

export function getComponentPlacement(layout: CircuitLayout, componentId: string) {
  return layout.componentPlacements.find((p) => p.componentId === componentId);
}

export function getConnectedNodeSummary(topology: CircuitTopology, componentId: string): string {
  const nodeMap = getComponentNodeMap(topology, componentId);
  return Object.entries(nodeMap)
    .map(([tid, nid]) => `${tid}:${nid}`)
    .join(" · ");
}

export function getComponentAccentColor(component: CircuitComponent): string {
  return getCircuitCatalogItem(component.kind).accentColor;
}

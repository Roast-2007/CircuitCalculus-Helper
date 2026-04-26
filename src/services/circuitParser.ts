import {
  createComponentFromKind,
  createParametersForKind,
  getCircuitCatalogItem,
} from "../constants/circuitCatalog";
import {
  CircuitComponent,
  CircuitComponentKind,
  CircuitConnection,
  CircuitControlRelation,
  CircuitNode,
  CircuitTopology,
  ComponentOrientation,
} from "../types";
import { createCircuitTopology, circuitTopologyToText } from "./circuitSerialize";

const COMPONENT_PREFIX_KIND_MAP: Record<string, CircuitComponentKind> = {
  R: "resistor",
  C: "capacitor",
  L: "inductor",
  V: "voltage_source",
  I: "current_source",
  G: "vccs",
  E: "vcvs",
  F: "cccs",
  H: "ccvs",
  D: "diode",
  Q: "bjt",
  M: "mosfet",
  U: "opamp",
  T: "transformer",
  S: "switch",
  W: "wire",
  P: "probe",
};

const GROUND_LABELS = new Set(["0", "gnd", "ground", "地"]);

type NormalizedJsonDocument = {
  isCircuit: boolean;
  extractedText: string;
  nodes: CircuitNode[];
  components: CircuitComponent[];
  connections: CircuitConnection[];
  controls: CircuitControlRelation[];
};

export type KimiParseResult = {
  isCircuit: boolean;
  extractedText: string;
  topology?: CircuitTopology;
};

export function parseKimiResponse(description: string): KimiParseResult {
  // Try to find the JSON block first for isCircuit flag
  const jsonCandidates = extractJsonCandidates(description);
  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate.trim());
      if (parsed.isCircuit === false && parsed.extractedText) {
        return {
          isCircuit: false,
          extractedText: parsed.extractedText,
        };
      }
      if (parsed.isCircuit === true || parsed.components || parsed.nodes || parsed.connections) {
        const topology = tryParseJsonCircuitFromData(description, parsed);
        if (topology) {
          const text = typeof parsed.extractedText === "string" ? parsed.extractedText.trim() : "";
          return { isCircuit: true, extractedText: text, topology };
        }
      }
    } catch {
      continue;
    }
  }

  // Fallback to heuristic circuit detection
  const topology = parseCircuitDescription(description);
  const hasComponents = topology.components.length > 0;
  const mentionsCircuit = isCircuitContent(description);
  if (hasComponents || mentionsCircuit) {
    return { isCircuit: true, extractedText: "", topology };
  }

  // No circuit detected — treat as text content
  return {
    isCircuit: false,
    extractedText: extractTextFromDescription(description),
  };
}

function tryParseJsonCircuitFromData(description: string, data: unknown): CircuitTopology | null {
  try {
    const normalized = normalizeJsonDocument(data);
    if (normalized.components.length > 0 || normalized.connections.length > 0) {
      return createCircuitTopology({
        rawDescription: description,
        components: normalized.components,
        connections: normalized.connections,
        nodes: normalized.nodes,
        controls: normalized.controls,
      });
    }
  } catch {
    return null;
  }
  return null;
}

function extractTextFromDescription(description: string): string {
  // Remove any JSON blocks, keep the natural language part
  const cleaned = description.replace(/```[\s\S]*?```/g, "").trim();
  return cleaned || description;
}

export function parseCircuitDescription(description: string): CircuitTopology {
  const jsonResult = tryParseJsonCircuit(description);
  if (jsonResult) {
    return jsonResult;
  }

  const fallback = parseByRegex(description);
  return createCircuitTopology({
    rawDescription: description,
    components: fallback.components,
    connections: fallback.connections,
    nodes: fallback.nodes,
  });
}

export function isCircuitContent(text: string): boolean {
  const circuitPatterns = [
    /[RrLlCcVvIiDdQqMmTtEeFfGgHhUu]\d+/,
    /(node|节点|端点|net|terminal|pin)/i,
    /(Ω|ohm|欧|电阻|电容|电感|电源|二极管|三极管|mos|运放|受控源|变压器|电路)/i,
    /(voltage|current|resistor|capacitor|inductor|diode|transistor|opamp|mosfet|circuit)/i,
    /(元件|连接|节点|拓扑|控制源|受控源)/,
  ];
  return circuitPatterns.some((pattern) => pattern.test(text));
}

function tryParseJsonCircuit(text: string): CircuitTopology | null {
  const candidates = extractJsonCandidates(text);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim());
      const normalized = normalizeJsonDocument(parsed);
      if (normalized.components.length > 0 || normalized.connections.length > 0) {
        return createCircuitTopology({
          rawDescription: text,
          components: normalized.components,
          connections: normalized.connections,
          nodes: normalized.nodes,
          controls: normalized.controls,
        });
      }
    } catch {
      continue;
    }
  }

  return null;
}

function extractJsonCandidates(text: string): string[] {
  const candidates = new Set<string>();
  const fencedMatches = text.matchAll(/```json\s*([\s\S]*?)```/gi);
  for (const match of fencedMatches) {
    if (match[1]?.trim()) {
      candidates.add(match[1]);
    }
  }

  const genericFencedMatches = text.matchAll(/```\s*([\s\S]*?)```/g);
  for (const match of genericFencedMatches) {
    if (match[1]?.trim()) {
      candidates.add(match[1]);
    }
  }

  if (text.trim()) {
    candidates.add(text);
  }

  return Array.from(candidates);
}

function normalizeJsonDocument(data: unknown): NormalizedJsonDocument {
  const objectData = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const nodes = normalizeNodes(data);
  const controls = normalizeControls(data);
  const components = normalizeComponents(data);
  const connections = normalizeConnections(data, components);
  const isCircuit = objectData.isCircuit === true;
  const extractedText = typeof objectData.extractedText === "string" ? objectData.extractedText : "";

  return {
    isCircuit,
    extractedText,
    nodes,
    components,
    connections,
    controls,
  };
}

function normalizeNodes(data: unknown): CircuitNode[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const objectData = data as Record<string, unknown>;
  const rawNodes =
    (Array.isArray(objectData.nodes) ? objectData.nodes : null) ||
    (Array.isArray(objectData.nets) ? objectData.nets : null) ||
    [];

  return rawNodes
    .map((rawNode, index) => normalizeNode(rawNode, index))
    .filter(Boolean) as CircuitNode[];
}

function normalizeNode(rawNode: unknown, index: number): CircuitNode | null {
  if (typeof rawNode === "string") {
    const id = rawNode.trim();
    if (!id) {
      return null;
    }
    return {
      id,
      label: id,
      kind: inferNodeKind(id),
    };
  }

  if (!rawNode || typeof rawNode !== "object") {
    return null;
  }

  const node = rawNode as Record<string, unknown>;
  const id = String(node.id || node.name || node.label || `N${index + 1}`).trim();
  if (!id) {
    return null;
  }

  return {
    id,
    label: String(node.label || node.name || id).trim(),
    kind: inferNodeKind(String(node.kind || id)),
  };
}

function normalizeControls(data: unknown): CircuitControlRelation[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const objectData = data as Record<string, unknown>;
  const rawControls =
    (Array.isArray(objectData.controls) ? objectData.controls : null) ||
    (Array.isArray(objectData.dependencies) ? objectData.dependencies : null) ||
    [];

  return rawControls
    .map((rawControl, index) => normalizeControl(rawControl, index))
    .filter(Boolean) as CircuitControlRelation[];
}

function normalizeControl(rawControl: unknown, index: number): CircuitControlRelation | null {
  if (!rawControl || typeof rawControl !== "object") {
    return null;
  }

  const control = rawControl as Record<string, unknown>;
  const sourceComponentId = String(
    control.sourceComponentId || control.source || control.componentId || ""
  ).trim();
  if (!sourceComponentId) {
    return null;
  }

  const controlTypeRaw = String(control.controlType || control.type || "voltage").trim();
  const controlType = controlTypeRaw.toLowerCase().includes("current")
    ? "current"
    : "voltage";

  return {
    id: String(control.id || `ctrl-${index + 1}`),
    sourceComponentId,
    controlType,
    positiveNodeId: stringOrUndefined(control.positiveNodeId || control.nodePositive || control.nodeA),
    negativeNodeId: stringOrUndefined(control.negativeNodeId || control.nodeNegative || control.nodeB),
    controllingComponentId: stringOrUndefined(
      control.controllingComponentId || control.controlComponent || control.branch
    ),
  };
}

function normalizeComponents(data: unknown): CircuitComponent[] {
  const rawComponents = extractRawComponents(data);
  return rawComponents
    .map((rawComponent, index) => normalizeComponent(rawComponent, index))
    .filter(Boolean) as CircuitComponent[];
}

function extractRawComponents(data: unknown): unknown[] {
  if (!data) {
    return [];
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (typeof data !== "object") {
    return [];
  }

  const objectData = data as Record<string, unknown>;
  if (Array.isArray(objectData.components)) {
    return objectData.components;
  }
  if (Array.isArray(objectData.elements)) {
    return objectData.elements;
  }
  if (Array.isArray(objectData.devices)) {
    return objectData.devices;
  }

  return [];
}

function normalizeComponent(rawComponent: unknown, index: number): CircuitComponent | null {
  if (!rawComponent || typeof rawComponent !== "object") {
    return null;
  }

  const component = rawComponent as Record<string, unknown>;
  const fallbackName = `X${index + 1}`;
  const name = String(component.name || component.id || component.label || fallbackName).trim().toUpperCase();
  if (!name) {
    return null;
  }

  const kind = normalizeType(
    String(component.kind || component.type || component.category || guessComponentType(name))
  );
  const catalog = getCircuitCatalogItem(kind);
  const baseComponent = createComponentFromKind(kind, index);
  const value = String(component.value || component.labelValue || catalog.defaultValue || "").trim();
  const parameters = normalizeParameters(component, kind, value);
  const terminals = normalizeTerminals(component, kind);
  const orientation = normalizeOrientation(
    String(component.orientation || "auto")
  );

  return {
    ...baseComponent,
    id: String(component.id || baseComponent.id),
    kind,
    name,
    value,
    terminals,
    parameters,
    orientation,
  };
}

function normalizeParameters(
  component: Record<string, unknown>,
  kind: CircuitComponentKind,
  value: string
) {
  const predefined = createParametersForKind(kind);
  const entries = predefined.map((parameter) => {
    const rawValue = component[parameter.key];
    return {
      ...parameter,
      value: rawValue ? String(rawValue).trim() : parameter.value,
    };
  });

  if (value && entries.length > 0 && !entries[0].value) {
    entries[0] = { ...entries[0], value };
  }

  return entries;
}

function normalizeTerminals(
  component: Record<string, unknown>,
  kind: CircuitComponentKind
): CircuitComponent["terminals"] {
  const explicitTerminals =
    (Array.isArray(component.terminals) ? component.terminals : null) ||
    (Array.isArray(component.pins) ? component.pins : null);

  if (explicitTerminals && explicitTerminals.length > 0) {
    return explicitTerminals
      .map((rawTerminal, index) => normalizeTerminal(rawTerminal, kind, index))
      .filter((terminal): terminal is CircuitComponent["terminals"][number] => terminal !== null);
  }

  const catalog = getCircuitCatalogItem(kind);
  return catalog.terminals.map((terminal) => ({ ...terminal }));
}

function normalizeTerminal(
  rawTerminal: unknown,
  kind: CircuitComponentKind,
  index: number
) {
  const catalog = getCircuitCatalogItem(kind);
  const fallback = catalog.terminals[index] || catalog.terminals[0];

  if (typeof rawTerminal === "string") {
    const id = rawTerminal.trim();
    return {
      id: id || fallback.id,
      label: id || fallback.label,
      side: fallback.side,
    };
  }

  if (!rawTerminal || typeof rawTerminal !== "object") {
    return fallback ? { ...fallback } : null;
  }

  const terminal = rawTerminal as Record<string, unknown>;
  return {
    id: String(terminal.id || terminal.name || fallback?.id || `t${index + 1}`).trim(),
    label: String(terminal.label || terminal.name || fallback?.label || `T${index + 1}`).trim(),
    side: normalizeTerminalSide(String(terminal.side || fallback?.side || "left")),
  };
}

function normalizeConnections(
  data: unknown,
  components: CircuitComponent[]
): CircuitConnection[] {
  const explicitConnections = normalizeExplicitConnections(data);
  if (explicitConnections.length > 0) {
    return explicitConnections;
  }

  return components.flatMap((component) => createConnectionsFromLegacyComponent(data, component));
}

function normalizeExplicitConnections(data: unknown): CircuitConnection[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const objectData = data as Record<string, unknown>;
  const rawConnections =
    (Array.isArray(objectData.connections) ? objectData.connections : null) ||
    (Array.isArray(objectData.wires) ? objectData.wires : null) ||
    [];

  return rawConnections
    .map((rawConnection, index) => normalizeConnection(rawConnection, index))
    .filter(Boolean) as CircuitConnection[];
}

function normalizeConnection(rawConnection: unknown, index: number): CircuitConnection | null {
  if (!rawConnection || typeof rawConnection !== "object") {
    return null;
  }

  const connection = rawConnection as Record<string, unknown>;
  const componentId = String(connection.componentId || connection.component || connection.fromComponent || "").trim();
  const terminalId = String(connection.terminalId || connection.terminal || connection.pin || "").trim();
  const nodeId = String(connection.nodeId || connection.node || connection.net || connection.toNode || "").trim();

  if (!componentId || !terminalId || !nodeId) {
    return null;
  }

  return {
    id: String(connection.id || `conn-${index + 1}`),
    componentId,
    terminalId,
    nodeId,
  };
}

function createConnectionsFromLegacyComponent(
  data: unknown,
  component: CircuitComponent
): CircuitConnection[] {
  const rawComponent = findRawComponentByName(data, component.name);
  if (!rawComponent) {
    return [];
  }

  const terminalNodes = extractLegacyTerminalNodes(rawComponent);
  return component.terminals.flatMap((terminal, index) => {
    const nodeId = terminalNodes[terminal.id] || terminalNodes[`terminal${index + 1}`] || terminalNodes[index];
    if (!nodeId) {
      return [];
    }
    return [
      {
        id: `${component.id}-${terminal.id}`,
        componentId: component.id,
        terminalId: terminal.id,
        nodeId,
      },
    ];
  });
}

function findRawComponentByName(data: unknown, name: string): Record<string, unknown> | null {
  const rawComponents = extractRawComponents(data);
  const matched = rawComponents.find((rawComponent) => {
    if (!rawComponent || typeof rawComponent !== "object") {
      return false;
    }
    const component = rawComponent as Record<string, unknown>;
    const candidate = String(component.name || component.id || component.label || "").trim().toUpperCase();
    return candidate === name;
  });

  return matched && typeof matched === "object" ? (matched as Record<string, unknown>) : null;
}

function extractLegacyTerminalNodes(rawComponent: Record<string, unknown>) {
  const pairs: Record<string | number, string> = {};
  const aliases: Array<[string | number, unknown]> = [
    [0, rawComponent.nodeA || rawComponent.node1 || rawComponent.from || rawComponent.pinA || rawComponent.terminalA],
    [1, rawComponent.nodeB || rawComponent.node2 || rawComponent.to || rawComponent.pinB || rawComponent.terminalB],
    ["positive", rawComponent.positive || rawComponent.plus || rawComponent.nodePositive],
    ["negative", rawComponent.negative || rawComponent.minus || rawComponent.nodeNegative],
    ["collector", rawComponent.collector],
    ["base", rawComponent.base],
    ["emitter", rawComponent.emitter],
    ["drain", rawComponent.drain],
    ["gate", rawComponent.gate],
    ["source", rawComponent.source],
    ["in_positive", rawComponent.inputPositive || rawComponent.nonInverting],
    ["in_negative", rawComponent.inputNegative || rawComponent.inverting],
    ["output", rawComponent.output],
    ["v_positive", rawComponent.supplyPositive],
    ["v_negative", rawComponent.supplyNegative],
    ["primary_positive", rawComponent.primaryPositive],
    ["primary_negative", rawComponent.primaryNegative],
    ["secondary_positive", rawComponent.secondaryPositive],
    ["secondary_negative", rawComponent.secondaryNegative],
    ["sense", rawComponent.sense || rawComponent.node],
    ["g", rawComponent.g || rawComponent.ground],
  ];

  aliases.forEach(([key, value]) => {
    const normalized = stringOrUndefined(value);
    if (normalized) {
      pairs[key] = normalized;
    }
  });

  return pairs;
}

function parseByRegex(description: string): {
  nodes: CircuitNode[];
  components: CircuitComponent[];
  connections: CircuitConnection[];
} {
  const lines = description.split("\n");
  const components: CircuitComponent[] = [];
  const connections: CircuitConnection[] = [];
  const nodeIds = new Set<string>();

  const patterns = [
    /([A-Za-z]\d+)\s*[:=：]?\s*([^,，\s]+)?\s*[,，]?\s*(?:between\s+)?([\w\d]+)\s*[-—–↔<>]\s*([\w\d]+)/i,
    /([A-Za-z]\d+)\s*\(([^)]+)\)\s*(?:connects|连接|between)\s+([\w\d]+)\s*(?:and|to|-|—|–)\s*([\w\d]+)/i,
    /([A-Za-z]\d+)\s*(?:连接|在|位于|接)\s*(?:于)?\s*([\w\d]+)\s*(?:和|与|、)\s*([\w\d]+)/i,
  ];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      return;
    }

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (!match) {
        continue;
      }

      const name = match[1].trim().toUpperCase();
      const kind = guessComponentType(name);
      const component = createComponentFromKind(kind, index);
      const value = match.length > 4 ? (match[2] || "").trim() : "";
      const nodeA = match.length > 4 ? match[3] : match[2];
      const nodeB = match.length > 4 ? match[4] : match[3];

      component.id = `${name.toLowerCase()}-${index + 1}`;
      component.name = name;
      component.value = value;
      component.parameters = component.parameters.map((parameter, parameterIndex) =>
        parameterIndex === 0 && value ? { ...parameter, value } : parameter
      );
      components.push(component);

      const firstTerminal = component.terminals[0];
      const secondTerminal = component.terminals[1] || component.terminals[0];
      if (nodeA) {
        nodeIds.add(nodeA);
        connections.push({
          id: `${component.id}-${firstTerminal.id}`,
          componentId: component.id,
          terminalId: firstTerminal.id,
          nodeId: nodeA,
        });
      }
      if (nodeB) {
        nodeIds.add(nodeB);
        connections.push({
          id: `${component.id}-${secondTerminal.id}`,
          componentId: component.id,
          terminalId: secondTerminal.id,
          nodeId: nodeB,
        });
      }
      break;
    }
  });

  return {
    nodes: Array.from(nodeIds).map((nodeId) => ({
      id: nodeId,
      label: nodeId,
      kind: inferNodeKind(nodeId),
    })),
    components,
    connections,
  };
}

function normalizeType(type: string): CircuitComponentKind {
  const normalized = type.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (normalized.includes("ground") || normalized === "gnd" || normalized === "0") return "ground";
  if (normalized.includes("resistor") || normalized === "r") return "resistor";
  if (normalized.includes("capacitor") || normalized === "c") return "capacitor";
  if (normalized.includes("inductor") || normalized === "l") return "inductor";
  if (normalized.includes("voltage controlled voltage") || normalized === "vcvs") return "vcvs";
  if (normalized.includes("voltage controlled current") || normalized === "vccs") return "vccs";
  if (normalized.includes("current controlled voltage") || normalized === "ccvs") return "ccvs";
  if (normalized.includes("current controlled current") || normalized === "cccs") return "cccs";
  if (normalized.includes("voltage") || normalized === "vs") return "voltage_source";
  if (normalized.includes("current") || normalized === "is") return "current_source";
  if (normalized.includes("diode") || normalized === "d") return "diode";
  if (normalized.includes("mos") || normalized === "m") return "mosfet";
  if (normalized.includes("bjt") || normalized.includes("transistor") || normalized === "q") return "bjt";
  if (normalized.includes("opamp") || normalized.includes("op-amp") || normalized.includes("运放") || normalized === "u") return "opamp";
  if (normalized.includes("transformer") || normalized === "t") return "transformer";
  if (normalized.includes("switch") || normalized === "sw" || normalized === "s") return "switch";
  if (normalized.includes("probe") || normalized.includes("test point") || normalized === "tp") return "probe";
  if (normalized.includes("wire") || normalized.includes("line") || normalized === "w") return "wire";
  return "unknown";
}

function guessComponentType(name: string): CircuitComponentKind {
  const normalized = name.trim().toUpperCase();
  if (!normalized) {
    return "unknown";
  }
  const prefix = normalized.charAt(0);
  if (prefix === "G" && normalized.startsWith("GND")) {
    return "ground";
  }
  return COMPONENT_PREFIX_KIND_MAP[prefix] || "unknown";
}

function inferNodeKind(value: string): CircuitNode["kind"] {
  const normalized = value.trim().toLowerCase();
  if (GROUND_LABELS.has(normalized)) {
    return "ground";
  }
  if (normalized.startsWith("ref")) {
    return "reference";
  }
  if (normalized.startsWith("int")) {
    return "internal";
  }
  return "signal";
}

function normalizeTerminalSide(side: string) {
  if (side === "right" || side === "top" || side === "bottom") {
    return side;
  }
  return "left";
}

function normalizeOrientation(value: string): ComponentOrientation {
  const normalized = value.trim().toLowerCase();
  if (normalized === "vertical") return "vertical";
  if (normalized === "horizontal") return "horizontal";
  return "auto";
}

function stringOrUndefined(value: unknown): string | undefined {
  const normalized = String(value || "").trim();
  return normalized ? normalized : undefined;
}

export { circuitTopologyToText };

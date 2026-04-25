import { getCircuitCatalogItem } from "../constants/circuitCatalog";
import {
  CircuitComponent,
  CircuitConnection,
  CircuitControlRelation,
  CircuitElement,
  CircuitLayout,
  CircuitNode,
  CircuitTopology,
} from "../types";

type CreateCircuitTopologyInput = {
  rawDescription: string;
  components: CircuitComponent[];
  connections: CircuitConnection[];
  nodes?: CircuitNode[];
  controls?: CircuitControlRelation[];
  layout?: CircuitLayout;
};

function normalizeNodeKind(nodeId: string): CircuitNode["kind"] {
  const normalized = nodeId.trim().toLowerCase();
  if (["0", "gnd", "ground", "地"].includes(normalized)) {
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

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  items.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function uniqueConnections(connections: CircuitConnection[]): CircuitConnection[] {
  const seen = new Set<string>();
  return connections.filter((connection) => {
    const key = `${connection.componentId}:${connection.terminalId}:${connection.nodeId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueControls(controls: CircuitControlRelation[]): CircuitControlRelation[] {
  const seen = new Set<string>();
  return controls.filter((control) => {
    const key = `${control.sourceComponentId}:${control.controlType}:${control.positiveNodeId || ""}:${control.negativeNodeId || ""}:${control.controllingComponentId || ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildNodes(nodes: CircuitNode[], connections: CircuitConnection[]): CircuitNode[] {
  const map = new Map<string, CircuitNode>();
  nodes.forEach((node) => {
    const id = node.id.trim();
    if (!id) {
      return;
    }
    map.set(id, {
      id,
      label: node.label?.trim() || id,
      kind: node.kind || normalizeNodeKind(id),
    });
  });

  connections.forEach((connection) => {
    const id = connection.nodeId.trim();
    if (!id) {
      return;
    }
    if (!map.has(id)) {
      map.set(id, {
        id,
        label: id,
        kind: normalizeNodeKind(id),
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
}

function ensureComponentShape(component: CircuitComponent): CircuitComponent {
  const catalog = getCircuitCatalogItem(component.kind);
  return {
    ...component,
    orientation: component.orientation || "auto",
    terminals:
      component.terminals.length > 0
        ? component.terminals.map((terminal) => ({ ...terminal }))
        : catalog.terminals.map((terminal) => ({ ...terminal })),
    parameters: component.parameters.map((parameter) => ({ ...parameter })),
  };
}

function getPrimaryNodeIds(component: CircuitComponent, connections: CircuitConnection[]): string[] {
  const componentConnections = connections.filter(
    (connection) => connection.componentId === component.id
  );
  const nodeIds = component.terminals
    .map((terminal) =>
      componentConnections.find((connection) => connection.terminalId === terminal.id)?.nodeId || ""
    )
    .filter(Boolean);

  if (nodeIds.length === 0) {
    return ["", ""];
  }

  if (nodeIds.length === 1) {
    return [nodeIds[0], nodeIds[0]];
  }

  return [nodeIds[0], nodeIds[1]];
}

function toLegacyElements(
  components: CircuitComponent[],
  connections: CircuitConnection[]
): CircuitElement[] {
  return components.map((component) => {
    const [nodeA, nodeB] = getPrimaryNodeIds(component, connections);
    return {
      id: component.id,
      type: component.kind,
      name: component.name,
      value: component.value,
      nodeA,
      nodeB,
    };
  });
}

export function createCircuitTopology({
  rawDescription,
  components,
  connections,
  nodes = [],
  controls = [],
  layout,
}: CreateCircuitTopologyInput): CircuitTopology {
  const normalizedComponents = uniqueById(components.map(ensureComponentShape));
  const normalizedConnections = uniqueConnections(
    connections
      .map((connection) => ({
        ...connection,
        componentId: connection.componentId.trim(),
        terminalId: connection.terminalId.trim(),
        nodeId: connection.nodeId.trim(),
      }))
      .filter(
        (connection) => connection.componentId && connection.terminalId && connection.nodeId
      )
  );
  const normalizedNodes = buildNodes(nodes, normalizedConnections);
  const normalizedControls = uniqueControls(
    controls
      .map((control) => ({
        ...control,
        positiveNodeId: control.positiveNodeId?.trim(),
        negativeNodeId: control.negativeNodeId?.trim(),
        controllingComponentId: control.controllingComponentId?.trim(),
      }))
      .filter((control) => control.sourceComponentId.trim())
  );

  return {
    schemaVersion: "2",
    rawDescription,
    nodes: normalizedNodes,
    components: normalizedComponents,
    connections: normalizedConnections,
    controls: normalizedControls,
    layout,
    elements: toLegacyElements(normalizedComponents, normalizedConnections),
  };
}

export function getComponentNodeMap(
  topology: CircuitTopology,
  componentId: string
): Record<string, string> {
  return topology.connections
    .filter((connection) => connection.componentId === componentId)
    .reduce<Record<string, string>>((accumulator, connection) => {
      accumulator[connection.terminalId] = connection.nodeId;
      return accumulator;
    }, {});
}

export function getControlRelation(
  topology: CircuitTopology,
  componentId: string
): CircuitControlRelation | undefined {
  return topology.controls.find((control) => control.sourceComponentId === componentId);
}

export function getStructuredCircuitData(topology: CircuitTopology) {
  return {
    schemaVersion: topology.schemaVersion,
    nodes: topology.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
    })),
    components: topology.components.map((component) => {
      const nodeMap = getComponentNodeMap(topology, component.id);
      return {
        id: component.id,
        kind: component.kind,
        name: component.name,
        value: component.value,
        parameters: Object.fromEntries(
          component.parameters
            .filter((parameter) => parameter.value.trim())
            .map((parameter) => [parameter.key, parameter.value])
        ),
        terminals: component.terminals.map((terminal) => ({
          id: terminal.id,
          label: terminal.label,
          nodeId: nodeMap[terminal.id] || null,
        })),
      };
    }),
    controls: topology.controls.map((control) => ({
      id: control.id,
      sourceComponentId: control.sourceComponentId,
      controlType: control.controlType,
      positiveNodeId: control.positiveNodeId || null,
      negativeNodeId: control.negativeNodeId || null,
      controllingComponentId: control.controllingComponentId || null,
    })),
  };
}

export function circuitTopologyToText(topology: CircuitTopology): string {
  if (topology.components.length === 0) {
    return topology.rawDescription;
  }

  const nodeLabels = topology.nodes.map((node) => node.label);
  const componentLines = topology.components.map((component) => {
    const nodeMap = getComponentNodeMap(topology, component.id);
    const terminals = component.terminals
      .map((terminal) => `${terminal.label}:${nodeMap[terminal.id] || "?"}`)
      .join(" · ");
    const parameterText = component.parameters
      .filter((parameter) => parameter.value.trim())
      .map((parameter) => `${parameter.label}=${parameter.value}`)
      .join("，");
    const valueText = component.value ? ` (${component.value})` : "";
    const suffix = [terminals, parameterText].filter(Boolean).join("；");
    return `- ${component.name}${valueText} [${component.kind}]${suffix ? `：${suffix}` : ""}`;
  });
  const controlLines = topology.controls.map((control) => {
    const controlTarget = control.controllingComponentId
      ? `控制支路 ${control.controllingComponentId}`
      : `控制节点 ${control.positiveNodeId || "?"} / ${control.negativeNodeId || "?"}`;
    return `- ${control.sourceComponentId} 由${control.controlType === "voltage" ? "电压" : "电流"}${controlTarget}`;
  });

  return [
    "## 电路结构摘要",
    nodeLabels.length > 0 ? `节点：${nodeLabels.join("，")}` : "节点：未识别",
    "",
    "### 元件",
    ...componentLines,
    controlLines.length > 0 ? "" : null,
    controlLines.length > 0 ? "### 受控关系" : null,
    ...controlLines,
    topology.rawDescription ? "" : null,
    topology.rawDescription ? "## 原始识别描述" : null,
    topology.rawDescription || null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function circuitTopologyToStructuredBlock(topology: CircuitTopology): string {
  return [
    "```json",
    JSON.stringify(getStructuredCircuitData(topology), null, 2),
    "```",
  ].join("\n");
}

export function buildDeepSeekCircuitPrompt(
  topology: CircuitTopology,
  userQuestion: string,
  notes: string
): string {
  return [
    "请优先依据下面的结构化电路数据进行分析，并在必要时参考摘要和原始识别描述。",
    "",
    "## 结构化电路数据",
    circuitTopologyToStructuredBlock(topology),
    "",
    circuitTopologyToText(topology),
    userQuestion ? `\n## 用户问题\n\n${userQuestion}` : "",
    notes ? `\n## 用户补充\n\n${notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- 设置 / API 类型 ----

export type ModelTier = "fast" | "pro";

export interface ModelOption {
  id: string;
  label: string;
  tier: ModelTier;
  tierHint: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  apiUrl: string | null;
  apiKeyField: "required" | "unlocked";
  modelField: "locked" | "unlocked";
  models: ModelOption[];
}

export interface ProviderSelection {
  providerId: string;
  modelId: string;
  apiKey: string;
  customApiUrl: string;
  customModelName: string;
}

export interface AppSettings {
  visual: ProviderSelection;
  reasoning: ProviderSelection;
}

export type MessageStatus = "sending" | "sent" | "error";

export type CircuitComponentKind =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "voltage_source"
  | "current_source"
  | "ground"
  | "wire"
  | "diode"
  | "bjt"
  | "mosfet"
  | "opamp"
  | "transformer"
  | "switch"
  | "probe"
  | "vcvs"
  | "vccs"
  | "ccvs"
  | "cccs"
  | "unknown";

export type ComponentOrientation = "horizontal" | "vertical" | "auto";

export type CircuitTerminalSide = "left" | "right" | "top" | "bottom";

export type CircuitNodeKind = "ground" | "reference" | "signal" | "internal";

export type CircuitNode = {
  id: string;
  label: string;
  kind: CircuitNodeKind;
};

export type CircuitTerminal = {
  id: string;
  label: string;
  side: CircuitTerminalSide;
};

export type CircuitComponentParameter = {
  key: string;
  label: string;
  value: string;
};

export type CircuitComponent = {
  id: string;
  kind: CircuitComponentKind;
  name: string;
  value: string;
  terminals: CircuitTerminal[];
  parameters: CircuitComponentParameter[];
  orientation: ComponentOrientation;
};

export type CircuitConnection = {
  id: string;
  componentId: string;
  terminalId: string;
  nodeId: string;
};

export type CircuitControlRelation = {
  id: string;
  sourceComponentId: string;
  controlType: "voltage" | "current";
  positiveNodeId?: string;
  negativeNodeId?: string;
  controllingComponentId?: string;
};

export type CircuitQuantity = {
  id: string;
  symbol: string;
  type: "current" | "voltage" | "power" | "other";
  description: string;
  startNodeId?: string;
  endNodeId?: string;
  componentId?: string;
  isControlQuantity?: boolean;
  controllingComponentId?: string;
  expression?: string;
};

export type CircuitPoint = {
  x: number;
  y: number;
};

export type CircuitNodePlacement = {
  nodeId: string;
  x: number;
  y: number;
  label?: string;
  role?: "junction" | "terminal" | "hidden";
};

export type CircuitComponentPlacement = {
  componentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  orientation?: ComponentOrientation;
};

export type CircuitTerminalPlacement = {
  componentId: string;
  terminalId: string;
  x: number;
  y: number;
};

export type CircuitWirePlacement = {
  id: string;
  connectionId: string;
  componentId?: string;
  terminalId?: string;
  nodeId?: string;
  points: CircuitPoint[];
};

export type CircuitLayout = {
  width: number;
  height: number;
  nodePlacements: CircuitNodePlacement[];
  componentPlacements: CircuitComponentPlacement[];
  terminalPlacements: CircuitTerminalPlacement[];
  wirePlacements: CircuitWirePlacement[];
};

export type CircuitElement = {
  id: string;
  type: CircuitComponentKind;
  name: string;
  value: string;
  nodeA: string;
  nodeB: string;
};

export type CircuitTopology = {
  schemaVersion: "2";
  rawDescription: string;
  nodes: CircuitNode[];
  components: CircuitComponent[];
  connections: CircuitConnection[];
  controls: CircuitControlRelation[];
  layout?: CircuitLayout;
  elements: CircuitElement[];
  quantities?: CircuitQuantity[];
  quantitiesText?: string;
};

export type CircuitDocument = CircuitTopology;

export type Message = {
  id: string;
  role: "user" | "assistant" | "kimi" | "circuit";
  content: string;
  image?: string;
  reasoning?: string;
  circuit?: CircuitTopology;
  timestamp: number;
  status: MessageStatus;
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

export type ConversationSummary = {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
};

export type ActiveConversationState = {
  conversations: Conversation[];
  activeConversationId: string;
};

export type TabParamList = {
  Home: undefined;
  Settings: undefined;
};

export type CircuitValidationIssue = {
  id: string;
  level: "warning" | "error";
  message: string;
};
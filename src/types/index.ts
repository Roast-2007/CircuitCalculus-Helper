export type ApiKeys = {
  deepseekKey: string;
  siliconflowKey: string;
  deepseekModel: string;
  siliconflowModel: string;
};

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

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";
export const DEFAULT_SILICONFLOW_MODEL = "Pro/moonshotai/Kimi-K2.6";

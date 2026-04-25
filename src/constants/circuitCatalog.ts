import {
  CircuitComponent,
  CircuitComponentKind,
  CircuitComponentParameter,
  CircuitTerminal,
  ComponentOrientation,
} from "../types";

export type CircuitSymbolKind =
  | "passive"
  | "source"
  | "dependent-source"
  | "semiconductor"
  | "opamp"
  | "transformer"
  | "switch"
  | "ground"
  | "probe"
  | "generic";

export type CircuitCatalogItem = {
  kind: CircuitComponentKind;
  label: string;
  shortLabel: string;
  symbol: CircuitSymbolKind;
  accentColor: string;
  terminals: CircuitTerminal[];
  parameterLabels: Array<{ key: string; label: string }>;
  defaultValue: string;
};

function makeTerminals(
  entries: Array<[id: string, label: string, side: CircuitTerminal["side"]]>
): CircuitTerminal[] {
  return entries.map(([id, label, side]) => ({ id, label, side }));
}

export const CIRCUIT_COMPONENT_CATALOG: Record<CircuitComponentKind, CircuitCatalogItem> = {
  resistor: {
    kind: "resistor",
    label: "电阻",
    shortLabel: "R",
    symbol: "passive",
    accentColor: "#4A90D9",
    terminals: makeTerminals([
      ["a", "A", "left"],
      ["b", "B", "right"],
    ]),
    parameterLabels: [{ key: "resistance", label: "电阻值" }],
    defaultValue: "100Ω",
  },
  capacitor: {
    kind: "capacitor",
    label: "电容",
    shortLabel: "C",
    symbol: "passive",
    accentColor: "#00ACC1",
    terminals: makeTerminals([
      ["a", "A", "left"],
      ["b", "B", "right"],
    ]),
    parameterLabels: [{ key: "capacitance", label: "电容值" }],
    defaultValue: "10μF",
  },
  inductor: {
    kind: "inductor",
    label: "电感",
    shortLabel: "L",
    symbol: "passive",
    accentColor: "#7E57C2",
    terminals: makeTerminals([
      ["a", "A", "left"],
      ["b", "B", "right"],
    ]),
    parameterLabels: [{ key: "inductance", label: "电感值" }],
    defaultValue: "10mH",
  },
  voltage_source: {
    kind: "voltage_source",
    label: "独立电压源",
    shortLabel: "V",
    symbol: "source",
    accentColor: "#EF5350",
    terminals: makeTerminals([
      ["positive", "+", "left"],
      ["negative", "-", "right"],
    ]),
    parameterLabels: [{ key: "voltage", label: "电压" }],
    defaultValue: "12V",
  },
  current_source: {
    kind: "current_source",
    label: "独立电流源",
    shortLabel: "I",
    symbol: "source",
    accentColor: "#FF7043",
    terminals: makeTerminals([
      ["positive", "+", "left"],
      ["negative", "-", "right"],
    ]),
    parameterLabels: [{ key: "current", label: "电流" }],
    defaultValue: "2A",
  },
  ground: {
    kind: "ground",
    label: "地",
    shortLabel: "GND",
    symbol: "ground",
    accentColor: "#546E7A",
    terminals: makeTerminals([["g", "GND", "bottom"]]),
    parameterLabels: [],
    defaultValue: "",
  },
  wire: {
    kind: "wire",
    label: "导线",
    shortLabel: "W",
    symbol: "generic",
    accentColor: "#8D6E63",
    terminals: makeTerminals([
      ["a", "A", "left"],
      ["b", "B", "right"],
    ]),
    parameterLabels: [],
    defaultValue: "",
  },
  diode: {
    kind: "diode",
    label: "二极管",
    shortLabel: "D",
    symbol: "semiconductor",
    accentColor: "#F06292",
    terminals: makeTerminals([
      ["anode", "A", "left"],
      ["cathode", "K", "right"],
    ]),
    parameterLabels: [{ key: "model", label: "型号" }],
    defaultValue: "",
  },
  bjt: {
    kind: "bjt",
    label: "三极管",
    shortLabel: "Q",
    symbol: "semiconductor",
    accentColor: "#AB47BC",
    terminals: makeTerminals([
      ["collector", "C", "top"],
      ["base", "B", "left"],
      ["emitter", "E", "bottom"],
    ]),
    parameterLabels: [{ key: "model", label: "型号" }],
    defaultValue: "",
  },
  mosfet: {
    kind: "mosfet",
    label: "MOSFET",
    shortLabel: "M",
    symbol: "semiconductor",
    accentColor: "#8E24AA",
    terminals: makeTerminals([
      ["drain", "D", "top"],
      ["gate", "G", "left"],
      ["source", "S", "bottom"],
    ]),
    parameterLabels: [{ key: "model", label: "型号" }],
    defaultValue: "",
  },
  opamp: {
    kind: "opamp",
    label: "运算放大器",
    shortLabel: "OP",
    symbol: "opamp",
    accentColor: "#5C6BC0",
    terminals: makeTerminals([
      ["in_positive", "+", "left"],
      ["in_negative", "-", "left"],
      ["output", "OUT", "right"],
      ["v_positive", "V+", "top"],
      ["v_negative", "V-", "bottom"],
    ]),
    parameterLabels: [{ key: "gain", label: "开环增益" }],
    defaultValue: "",
  },
  transformer: {
    kind: "transformer",
    label: "变压器",
    shortLabel: "T",
    symbol: "transformer",
    accentColor: "#26A69A",
    terminals: makeTerminals([
      ["primary_positive", "P+", "left"],
      ["primary_negative", "P-", "left"],
      ["secondary_positive", "S+", "right"],
      ["secondary_negative", "S-", "right"],
    ]),
    parameterLabels: [{ key: "ratio", label: "变比" }],
    defaultValue: "1:1",
  },
  switch: {
    kind: "switch",
    label: "开关",
    shortLabel: "SW",
    symbol: "switch",
    accentColor: "#FFB300",
    terminals: makeTerminals([
      ["a", "A", "left"],
      ["b", "B", "right"],
    ]),
    parameterLabels: [{ key: "state", label: "状态" }],
    defaultValue: "open",
  },
  probe: {
    kind: "probe",
    label: "测试点",
    shortLabel: "TP",
    symbol: "probe",
    accentColor: "#78909C",
    terminals: makeTerminals([["sense", "TP", "bottom"]]),
    parameterLabels: [],
    defaultValue: "",
  },
  vcvs: {
    kind: "vcvs",
    label: "电压控制电压源",
    shortLabel: "E",
    symbol: "dependent-source",
    accentColor: "#EC407A",
    terminals: makeTerminals([
      ["positive", "+", "left"],
      ["negative", "-", "right"],
    ]),
    parameterLabels: [{ key: "gain", label: "电压增益" }],
    defaultValue: "Av",
  },
  vccs: {
    kind: "vccs",
    label: "电压控制电流源",
    shortLabel: "G",
    symbol: "dependent-source",
    accentColor: "#D81B60",
    terminals: makeTerminals([
      ["positive", "+", "left"],
      ["negative", "-", "right"],
    ]),
    parameterLabels: [{ key: "transconductance", label: "跨导" }],
    defaultValue: "gm",
  },
  ccvs: {
    kind: "ccvs",
    label: "电流控制电压源",
    shortLabel: "H",
    symbol: "dependent-source",
    accentColor: "#C2185B",
    terminals: makeTerminals([
      ["positive", "+", "left"],
      ["negative", "-", "right"],
    ]),
    parameterLabels: [{ key: "transresistance", label: "跨阻" }],
    defaultValue: "rm",
  },
  cccs: {
    kind: "cccs",
    label: "电流控制电流源",
    shortLabel: "F",
    symbol: "dependent-source",
    accentColor: "#AD1457",
    terminals: makeTerminals([
      ["positive", "+", "left"],
      ["negative", "-", "right"],
    ]),
    parameterLabels: [{ key: "gain", label: "电流增益" }],
    defaultValue: "Ai",
  },
  unknown: {
    kind: "unknown",
    label: "未知元件",
    shortLabel: "?",
    symbol: "generic",
    accentColor: "#90A4AE",
    terminals: makeTerminals([
      ["a", "A", "left"],
      ["b", "B", "right"],
    ]),
    parameterLabels: [{ key: "note", label: "备注" }],
    defaultValue: "",
  },
};

export const CIRCUIT_COMPONENT_KIND_OPTIONS = Object.keys(
  CIRCUIT_COMPONENT_CATALOG
) as CircuitComponentKind[];

export const CIRCUIT_COMPONENT_LABELS = Object.fromEntries(
  CIRCUIT_COMPONENT_KIND_OPTIONS.map((kind) => [kind, CIRCUIT_COMPONENT_CATALOG[kind].label])
) as Record<CircuitComponentKind, string>;

export function getCircuitCatalogItem(kind: CircuitComponentKind): CircuitCatalogItem {
  return CIRCUIT_COMPONENT_CATALOG[kind] || CIRCUIT_COMPONENT_CATALOG.unknown;
}

export function createParametersForKind(kind: CircuitComponentKind): CircuitComponentParameter[] {
  const item = getCircuitCatalogItem(kind);
  return item.parameterLabels.map((entry) => ({
    key: entry.key,
    label: entry.label,
    value: "",
  }));
}

export function createComponentFromKind(kind: CircuitComponentKind, index: number): CircuitComponent {
  const item = getCircuitCatalogItem(kind);
  return {
    id: `${kind}-${Date.now().toString(36)}-${index}`,
    kind,
    name: `${item.shortLabel}${index + 1}`,
    value: item.defaultValue,
    terminals: item.terminals.map((terminal) => ({ ...terminal })),
    parameters: createParametersForKind(kind),
    orientation: "auto" as ComponentOrientation,
  };
}

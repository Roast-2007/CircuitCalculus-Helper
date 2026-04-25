import React from "react";
import { Circle, G, Line, Path, Rect } from "react-native-svg";
import { CircuitComponent, ComponentOrientation } from "../../../types";

type Props = {
  component: CircuitComponent;
  color: string;
};

const CENTER = 60;
const LEAD_START = 10;
const LEAD_END = 110;
const BODY_LEFT = 28;
const BODY_RIGHT = 92;
const BODY_TOP = 34;
const BODY_BOTTOM = 86;

function leadLines() {
  return (
    <>
      <Line x1={LEAD_START} y1={CENTER} x2={BODY_LEFT} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={BODY_RIGHT} y1={CENTER} x2={LEAD_END} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
    </>
  );
}

function passiveResistor() {
  return (
    <>
      {leadLines()}
      <Path
        d="M 28 60 L 36 48 L 44 72 L 52 48 L 60 72 L 68 48 L 76 72 L 84 48 L 92 60"
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </>
  );
}

function passiveCapacitor() {
  return (
    <>
      <Line x1={LEAD_START} y1={CENTER} x2={44} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={76} y1={CENTER} x2={LEAD_END} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={48} y1={BODY_TOP} x2={48} y2={BODY_BOTTOM} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={72} y1={BODY_TOP} x2={72} y2={BODY_BOTTOM} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
    </>
  );
}

function passiveInductor() {
  return (
    <>
      <Line x1={LEAD_START} y1={CENTER} x2={34} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Path d="M 34 60 a 8 12 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth={4} />
      <Path d="M 50 60 a 8 12 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth={4} />
      <Path d="M 66 60 a 8 12 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth={4} />
      <Path d="M 82 60 a 8 12 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth={4} />
      <Line x1={98} y1={CENTER} x2={LEAD_END} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
    </>
  );
}

function sourceVoltage() {
  return (
    <>
      <Line x1={LEAD_START} y1={CENTER} x2={32} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={88} y1={CENTER} x2={LEAD_END} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Circle cx={CENTER} cy={CENTER} r={28} fill="#fff" stroke="currentColor" strokeWidth={4} />
      <Line x1={44} y1={CENTER} x2={60} y2={CENTER} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
      <Line x1={52} y1={CENTER - 8} x2={52} y2={CENTER + 8} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
      <Line x1={68} y1={CENTER} x2={84} y2={CENTER} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
    </>
  );
}

function sourceCurrent() {
  return (
    <>
      <Line x1={LEAD_START} y1={CENTER} x2={32} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={88} y1={CENTER} x2={LEAD_END} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Circle cx={CENTER} cy={CENTER} r={28} fill="#fff" stroke="currentColor" strokeWidth={4} />
      <Line x1={46} y1={CENTER} x2={74} y2={CENTER} stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M 78 60 L 66 52 L 66 68 Z" fill="currentColor" />
    </>
  );
}

function dependentSource(kind: CircuitComponent["kind"]) {
  const isCurrent = kind === "vccs" || kind === "cccs";
  return (
    <>
      <Line x1={LEAD_START} y1={CENTER} x2={30} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={90} y1={CENTER} x2={LEAD_END} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Path d="M 30 60 L 60 24 L 90 60 L 60 96 Z" fill="#fff" stroke="currentColor" strokeWidth={4} strokeLinejoin="round" />
      {isCurrent ? (
        <>
          <Line x1={46} y1={CENTER} x2={72} y2={CENTER} stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
          <Path d="M 76 60 L 64 52 L 64 68 Z" fill="currentColor" />
        </>
      ) : (
        <>
          <Line x1={44} y1={CENTER} x2={60} y2={CENTER} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <Line x1={52} y1={CENTER - 8} x2={52} y2={CENTER + 8} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <Line x1={68} y1={CENTER} x2={84} y2={CENTER} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
        </>
      )}
    </>
  );
}

function switchSymbol() {
  return (
    <>
      <Line x1={LEAD_START} y1={CENTER} x2={40} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={80} y1={CENTER} x2={LEAD_END} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Circle cx={40} cy={CENTER} r={4.5} fill="currentColor" />
      <Circle cx={80} cy={CENTER} r={4.5} fill="currentColor" />
      <Line x1={40} y1={CENTER} x2={78} y2={42} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
    </>
  );
}

function diodeSymbol() {
  return (
    <>
      <Line x1={LEAD_START} y1={CENTER} x2={34} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={86} y1={CENTER} x2={LEAD_END} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Path d="M 34 32 L 34 88 L 74 60 Z" fill="#fff" stroke="currentColor" strokeWidth={4} strokeLinejoin="round" />
      <Line x1={80} y1={32} x2={80} y2={88} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
    </>
  );
}

function groundSymbol() {
  return (
    <>
      <Line x1={CENTER} y1={LEAD_START} x2={CENTER} y2={42} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={34} y1={50} x2={86} y2={50} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={42} y1={62} x2={78} y2={62} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={50} y1={74} x2={70} y2={74} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
    </>
  );
}

function probeSymbol() {
  return (
    <>
      <Line x1={CENTER} y1={LEAD_END} x2={CENTER} y2={84} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Circle cx={CENTER} cy={52} r={18} fill="#fff" stroke="currentColor" strokeWidth={4} />
      <Circle cx={CENTER} cy={52} r={4} fill="currentColor" />
    </>
  );
}

function opampSymbol() {
  return (
    <>
      <Line x1={LEAD_START} y1={44} x2={36} y2={44} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={LEAD_START} y1={76} x2={36} y2={76} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={92} y1={60} x2={LEAD_END} y2={60} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Path d="M 36 24 L 36 96 L 92 60 Z" fill="#fff" stroke="currentColor" strokeWidth={4} strokeLinejoin="round" />
      <Line x1={46} y1={44} x2={58} y2={44} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
      <Line x1={52} y1={38} x2={52} y2={50} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
      <Line x1={46} y1={76} x2={58} y2={76} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
    </>
  );
}

function transformerSymbol() {
  return (
    <>
      <Line x1={LEAD_START} y1={42} x2={32} y2={42} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={LEAD_START} y1={78} x2={32} y2={78} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={88} y1={42} x2={LEAD_END} y2={42} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={88} y1={78} x2={LEAD_END} y2={78} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Path d="M 32 42 a 8 10 0 0 1 16 0 a 8 10 0 0 1 -16 0 M 32 78 a 8 10 0 0 1 16 0 a 8 10 0 0 1 -16 0" fill="none" stroke="currentColor" strokeWidth={4} />
      <Path d="M 72 42 a 8 10 0 0 1 16 0 a 8 10 0 0 1 -16 0 M 72 78 a 8 10 0 0 1 16 0 a 8 10 0 0 1 -16 0" fill="none" stroke="currentColor" strokeWidth={4} />
      <Line x1={58} y1={28} x2={58} y2={92} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={62} y1={28} x2={62} y2={92} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </>
  );
}

function transistorBjt() {
  return (
    <>
      <Circle cx={60} cy={60} r={28} fill="#fff" stroke="currentColor" strokeWidth={4} />
      <Line x1={LEAD_START} y1={60} x2={40} y2={60} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={60} y1={32} x2={60} y2={14} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={60} y1={88} x2={60} y2={106} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={48} y1={60} x2={64} y2={44} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={48} y1={60} x2={64} y2={76} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Path d="M 68 72 L 78 80 L 66 84 Z" fill="currentColor" />
    </>
  );
}

function transistorMosfet() {
  return (
    <>
      <Line x1={LEAD_START} y1={60} x2={34} y2={60} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={78} y1={24} x2={78} y2={10} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={78} y1={96} x2={78} y2={110} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Rect x={38} y={24} width={36} height={72} rx={10} fill="#fff" stroke="currentColor" strokeWidth={4} />
      <Line x1={52} y1={34} x2={52} y2={86} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={34} y1={60} x2={52} y2={60} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={62} y1={42} x2={78} y2={42} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <Line x1={62} y1={78} x2={78} y2={78} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
    </>
  );
}

function wireSymbol() {
  return <Line x1={LEAD_START} y1={CENTER} x2={LEAD_END} y2={CENTER} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />;
}

function genericBox() {
  return (
    <>
      {leadLines()}
      <Rect x={32} y={36} width={56} height={48} rx={8} fill="#fff" stroke="currentColor" strokeWidth={4} />
    </>
  );
}

function rotationForOrientation(orientation: ComponentOrientation, kind: CircuitComponent["kind"]): number {
  if (kind === "ground" || kind === "probe") {
    return 0;
  }
  return orientation === "vertical" ? 90 : 0;
}

function renderBody(kind: CircuitComponent["kind"]) {
  switch (kind) {
    case "resistor":
      return passiveResistor();
    case "capacitor":
      return passiveCapacitor();
    case "inductor":
      return passiveInductor();
    case "voltage_source":
      return sourceVoltage();
    case "current_source":
      return sourceCurrent();
    case "diode":
      return diodeSymbol();
    case "ground":
      return groundSymbol();
    case "switch":
      return switchSymbol();
    case "probe":
      return probeSymbol();
    case "opamp":
      return opampSymbol();
    case "transformer":
      return transformerSymbol();
    case "bjt":
      return transistorBjt();
    case "mosfet":
      return transistorMosfet();
    case "vcvs":
    case "vccs":
    case "ccvs":
    case "cccs":
      return dependentSource(kind);
    case "wire":
      return wireSymbol();
    default:
      return genericBox();
  }
}

export default function StandardCircuitGraphic({ component, color }: Props) {
  const rotation = rotationForOrientation(component.orientation, component.kind);

  return (
    <G color={color}>
      <G transform={`rotate(${rotation} ${CENTER} ${CENTER})`}>
        {renderBody(component.kind)}
      </G>
    </G>
  );
}

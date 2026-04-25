import React from "react";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { getCircuitCatalogItem } from "../../constants/circuitCatalog";
import { CircuitComponent } from "../../types";
import StandardCircuitGraphic from "./symbols/StandardCircuitGraphic";

type Props = {
  component: CircuitComponent;
  x: number;
  y: number;
  width: number;
  height: number;
  selected?: boolean;
  compact?: boolean;
};

function truncateName(name: string, compact: boolean) {
  const maxLength = compact ? 6 : 10;
  return name.length > maxLength ? `${name.slice(0, maxLength)}…` : name;
}

function truncateValue(value: string, compact: boolean) {
  if (!value.trim()) {
    return "";
  }
  const maxLength = compact ? 8 : 12;
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

export default function CircuitSymbol({ component, width, height, selected = false, compact = false }: Props) {
  const item = getCircuitCatalogItem(component.kind);
  const nameFontSize = compact ? 9 : 11;
  const valueFontSize = compact ? 13 : 16;
  const label = truncateName(component.name, compact);
  const value = truncateValue(component.value, compact);

  return (
    <Svg width={width} height={height} viewBox="0 0 120 120">
      <Rect
        x={selected ? 2 : 6}
        y={selected ? 2 : 6}
        width={selected ? 116 : 108}
        height={selected ? 116 : 108}
        rx={18}
        fill={selected ? "#F5F9FF" : "transparent"}
        stroke={selected ? item.accentColor : "transparent"}
        strokeWidth={selected ? 3 : 0}
      />
      <StandardCircuitGraphic component={component} color={item.accentColor} />
      <SvgText
        x={60}
        y={selected ? 104 : 102}
        fontSize={nameFontSize}
        fill={item.accentColor}
        fontWeight="700"
        textAnchor="middle"
      >
        {label}
      </SvgText>
      {value ? (
        <SvgText
          x={60}
          y={selected ? 22 : 24}
          fontSize={valueFontSize}
          fill="#1C1C1E"
          fontWeight="800"
          textAnchor="middle"
        >
          {value}
        </SvgText>
      ) : null}
    </Svg>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";
import { CircuitTopology } from "../../types";
import {
  ensureCircuitLayout,
  getConnectedNodeSummary,
} from "../../services/circuitLayout";
import CircuitSymbol from "./CircuitSymbol";

type Props = {
  topology: CircuitTopology;
  selectedComponentId?: string;
  onSelectComponent?: (componentId: string) => void;
  compact?: boolean;
};

const COMPACT_SCALE = 0.62;
const DEFAULT_SCALE = 1;
const MIN_SCALE = 0.55;
const MAX_SCALE = 1.8;
const SCALE_STEP = 0.2;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function fitScale(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (!width || !height || !maxWidth || !maxHeight) {
    return DEFAULT_SCALE;
  }

  return clampScale(Math.min(maxWidth / width, maxHeight / height, 1));
}

function truncateLabel(value: string, compact: boolean) {
  const maxLength = compact ? 6 : 10;
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

export default function CircuitCanvas({
  topology,
  selectedComponentId,
  onSelectComponent,
  compact = false,
}: Props) {
  const layout = useMemo(() => ensureCircuitLayout(topology), [topology]);
  const { width: windowWidth } = useWindowDimensions();
  const horizontalScrollRef = useRef<ScrollView>(null);
  const verticalScrollRef = useRef<ScrollView>(null);
  const viewportWidth = Math.max(220, windowWidth - (compact ? 112 : 40));
  const viewportHeight = compact ? 190 : 320;
  const initialScale = compact
    ? COMPACT_SCALE
    : fitScale(layout.width, layout.height, viewportWidth - 24, viewportHeight - 24);
  const [scale, setScale] = useState(initialScale);

  useEffect(() => {
    setScale(initialScale);
  }, [initialScale]);

  const contentWidth = layout.width * scale;
  const contentHeight = layout.height * scale;
  const summaryLines = topology.components.slice(0, compact ? 0 : 4);

  return (
    <View style={[styles.container, compact ? styles.compactContainer : null]}>
      {!compact ? (
        <View style={styles.toolbar}>
          <Text style={styles.toolbarHint}>拖动画布查看全貌</Text>
          <View style={styles.toolbarActions}>
            <Pressable
              onPress={() => setScale((current) => clampScale(current - SCALE_STEP))}
              style={styles.iconButton}
            >
              <Ionicons name="remove" size={16} color={theme.colors.foreground} />
            </Pressable>
            <Pressable
              onPress={() => {
                setScale(fitScale(layout.width, layout.height, viewportWidth - 24, viewportHeight - 24));
                horizontalScrollRef.current?.scrollTo({ x: 0, animated: true });
                verticalScrollRef.current?.scrollTo({ y: 0, animated: true });
              }}
              style={styles.fitButton}
            >
              <Text style={styles.fitButtonText}>适配</Text>
            </Pressable>
            <Pressable
              onPress={() => setScale((current) => clampScale(current + SCALE_STEP))}
              style={styles.iconButton}
            >
              <Ionicons name="add" size={16} color={theme.colors.foreground} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.compactHeader}>
          <Text style={styles.compactTitle}>拓扑预览</Text>
          <Text style={styles.compactSubtitle}>到编辑页可拖动查看完整图</Text>
        </View>
      )}

      <View
        style={[
          styles.viewport,
          compact ? styles.compactViewport : { height: viewportHeight },
        ]}
      >
        <ScrollView
          ref={verticalScrollRef}
          style={styles.scrollFill}
          contentContainerStyle={styles.scrollContent}
          maximumZoomScale={1}
          minimumZoomScale={1}
        >
          <ScrollView
            ref={horizontalScrollRef}
            horizontal
            style={styles.scrollFill}
            contentContainerStyle={styles.scrollContent}
            showsHorizontalScrollIndicator={!compact}
            showsVerticalScrollIndicator={!compact}
            nestedScrollEnabled
          >
            <View style={{ width: contentWidth, height: contentHeight }}>
              <Svg width={contentWidth} height={contentHeight} viewBox={`0 0 ${layout.width} ${layout.height}`}>
                {layout.wirePlacements.map((wire) => {
                  const d = wire.points
                    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
                    .join(" ");
                  return (
                    <Path
                      key={wire.id}
                      d={d}
                      stroke="#5E6C84"
                      strokeWidth={compact ? 2 : 2.4}
                      fill="none"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  );
                })}

                {layout.nodePlacements
                  .filter((placement) => placement.role !== "hidden")
                  .map((placement) => {
                    const node = topology.nodes.find((candidate) => candidate.id === placement.nodeId);
                    const isGround = node?.kind === "ground";
                    const isTerminal = placement.role === "terminal";
                    const label = placement.label || node?.label;
                    return (
                      <React.Fragment key={`${placement.nodeId}:${placement.x}:${placement.y}`}>
                        <Circle
                          cx={placement.x}
                          cy={placement.y}
                          r={isTerminal ? (compact ? 5 : 6) : isGround ? 5 : 4}
                          fill={isGround ? "#546E7A" : isTerminal ? "#111111" : "#111111"}
                        />
                        {label ? (
                          <SvgText
                            x={placement.x + (isTerminal ? 14 : 8)}
                            y={placement.y + (isTerminal ? 4 : -8)}
                            fontSize={compact ? 10 : isTerminal ? 15 : 11}
                            fill={isTerminal ? "#111111" : "#536070"}
                            fontWeight={isTerminal ? "700" : "600"}
                          >
                            {truncateLabel(label, compact)}
                          </SvgText>
                        ) : null}
                      </React.Fragment>
                    );
                  })}


                {layout.terminalPlacements
                  .filter((placement) => !layout.nodePlacements.some(
                    (nodePlacement) =>
                      nodePlacement.role !== "hidden" &&
                      Math.abs(nodePlacement.x - placement.x) < 1 &&
                      Math.abs(nodePlacement.y - placement.y) < 1
                  ))
                  .map((placement) => (
                  <Circle
                    key={`${placement.componentId}:${placement.terminalId}`}
                    cx={placement.x}
                    cy={placement.y}
                    r={compact ? 2.5 : 3}
                    fill="#8894A7"
                  />
                ))}
              </Svg>

              <View pointerEvents="box-none" style={styles.overlay}>
                {layout.componentPlacements.map((placement) => {
                  const component = topology.components.find(
                    (candidate) => candidate.id === placement.componentId
                  );
                  if (!component) {
                    return null;
                  }

                  const displayComponent = {
                    ...component,
                    orientation: placement.orientation || component.orientation,
                  };

                  return (
                    <Pressable
                      key={component.id}
                      onPress={() => onSelectComponent?.(component.id)}
                      style={[
                        styles.componentCard,
                        {
                          left: placement.x * scale,
                          top: placement.y * scale,
                          width: placement.width * scale,
                          height: placement.height * scale,
                        },
                      ]}
                    >
                      <CircuitSymbol
                        component={displayComponent}
                        x={0}
                        y={0}
                        width={placement.width * scale}
                        height={placement.height * scale}
                        selected={selectedComponentId === component.id}
                        compact={compact}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      {!compact ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>拓扑概览</Text>
          {summaryLines.map((component) => (
            <Text key={component.id} style={styles.summaryLine}>
              {component.name} · {getConnectedNodeSummary(topology, component.id) || "未连接"}
            </Text>
          ))}
          {topology.components.length > 4 ? (
            <Text style={styles.summaryMore}>+{topology.components.length - 4} 个元件</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FBFCFF",
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  compactContainer: {
    minHeight: 220,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  toolbarHint: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
    fontWeight: theme.fontWeight.medium,
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  fitButton: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  fitButtonText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.semibold,
  },
  compactHeader: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  compactTitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.semibold,
  },
  compactSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mutedForeground,
    marginTop: 2,
  },
  viewport: {
    backgroundColor: "#FBFCFF",
  },
  compactViewport: {
    height: 188,
  },
  scrollFill: {
    flexGrow: 0,
  },
  scrollContent: {
    flexGrow: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  componentCard: {
    position: "absolute",
    borderRadius: 18,
  },
  summaryCard: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: "#FFFFFF",
  },
  summaryTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
    marginBottom: theme.spacing.xs,
  },
  summaryLine: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
    lineHeight: 18,
  },
  summaryMore: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mutedForeground,
    marginTop: theme.spacing.xs,
  },
});

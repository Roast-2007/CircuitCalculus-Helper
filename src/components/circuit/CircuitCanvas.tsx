import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import * as ScreenOrientation from "expo-screen-orientation";
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
  hideChrome?: boolean;
};

const COMPACT_SCALE = 0.62;

function clampScale(value: number) {
  const MIN_SCALE = 0.55;
  const MAX_SCALE = 2.6;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function fitScale(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (!width || !height || !maxWidth || !maxHeight) {
    return 1;
  }

  return clampScale(Math.min(maxWidth / width, maxHeight / height, 1));
}

function truncateLabel(value: string, compact: boolean) {
  const maxLength = compact ? 10 : 16;
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function terminalKey(componentId: string, terminalId: string): string {
  return `${componentId}:${terminalId}`;
}

export default function CircuitCanvas({
  topology,
  selectedComponentId,
  onSelectComponent,
  compact = false,
  hideChrome = false,
}: Props) {
  const layout = useMemo(() => ensureCircuitLayout(topology), [topology]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const viewportWidth = Math.max(220, windowWidth - (compact ? 112 : 40));
  const viewportHeight = hideChrome ? Math.max(200, windowHeight - 120) : compact ? 190 : 320;
  const NODE_HEADER_HEIGHT = compact ? 0 : 56;
  const adjustedViewportHeight = compact ? viewportHeight : viewportHeight - NODE_HEADER_HEIGHT;
  const initialScale = compact
    ? COMPACT_SCALE
    : fitScale(layout.width, layout.height, viewportWidth - 24, adjustedViewportHeight - 24);

  const contentWidth = layout.width * initialScale;
  const contentHeight = layout.height * initialScale;

  const [fullscreenVisible, setFullscreenVisible] = useState(false);

  const nodeHScrollRef = useRef<ScrollView>(null);
  const horizontalScrollRef = useRef<ScrollView>(null);
  const verticalScrollRef = useRef<ScrollView>(null);
  const isSyncing = useRef(false);

  // Orientation: unlock in fullscreen, re-lock on exit
  useEffect(() => {
    if (fullscreenVisible) {
      ScreenOrientation.unlockAsync();
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      };
    }
  }, [fullscreenVisible]);

  const syncHorizontalScrolls = useCallback((source: "node" | "content", x: number) => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (source === "node") {
      horizontalScrollRef.current?.scrollTo({ x, animated: false });
    } else {
      nodeHScrollRef.current?.scrollTo({ x, animated: false });
    }
    // Release guard after a short delay to allow the other onScroll to fire
    setTimeout(() => {
      isSyncing.current = false;
    }, 16);
  }, []);

  const summaryLines = topology.components.slice(0, compact ? 0 : 4);
  const connectedTerminalKeys = useMemo(
    () => new Set(topology.connections.map((connection) => terminalKey(connection.componentId, connection.terminalId))),
    [topology.connections]
  );
  const componentMap = useMemo(
    () => new Map(topology.components.map((component) => [component.id, component])),
    [topology.components]
  );
  const nodeMap = useMemo(
    () => new Map(topology.nodes.map((node) => [node.id, node])),
    [topology.nodes]
  );
  const connectedNodeIds = useMemo(
    () => new Set(topology.connections.map((c) => c.nodeId)),
    [topology.connections]
  );
  const wirePaths = useMemo(
    () => layout.wirePlacements.map((wire) => ({
      wire,
      d: wire.points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" "),
    })),
    [layout.wirePlacements]
  );

  const scrollToOrigin = () => {
    nodeHScrollRef.current?.scrollTo({ x: 0, animated: true });
    horizontalScrollRef.current?.scrollTo({ x: 0, animated: true });
    verticalScrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const visibleNodePlacements = useMemo(
    () =>
      layout.nodePlacements.filter(
        (placement) => placement.role !== "hidden" && connectedNodeIds.has(placement.nodeId)
      ),
    [layout.nodePlacements, connectedNodeIds]
  );

  const handleNodePress = useCallback(
    (placement: (typeof visibleNodePlacements)[number]) => {
      const node = nodeMap.get(placement.nodeId);
      const label = placement.label || node?.label || node?.id || placement.nodeId;
      Alert.alert("节点名称", label, [{ text: "确定" }]);
    },
    [nodeMap]
  );

  const renderNodeHeader = () => (
    <View style={styles.nodeHeader}>
      <ScrollView
        ref={nodeHScrollRef}
        horizontal
        style={styles.nodeHeaderScroll}
        contentContainerStyle={[
          styles.nodeHeaderScrollContent,
          { minWidth: Math.max(contentWidth, viewportWidth), minHeight: NODE_HEADER_HEIGHT },
        ]}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!compact}
        nestedScrollEnabled
        onScroll={(e) => syncHorizontalScrolls("node", e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
      >
        <View style={{ width: Math.max(contentWidth, viewportWidth), height: NODE_HEADER_HEIGHT }}>
          <Svg width={contentWidth} height={NODE_HEADER_HEIGHT} viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMinYMin slice">
            {visibleNodePlacements.map((placement) => {
              const node = nodeMap.get(placement.nodeId);
              const isGround = node?.kind === "ground";
              const isTerminal = placement.role === "terminal";
              const label = placement.label || node?.label;
              return (
                <React.Fragment key={`${placement.nodeId}:${placement.x}:${placement.y}`}>
                  <Circle
                    cx={placement.x}
                    cy={placement.y}
                    r={isTerminal ? 6 : isGround ? 5 : 4}
                    fill={isGround ? theme.colors.circuitGround : isTerminal ? theme.colors.circuitNode : theme.colors.circuitNode}
                  />
                  {label ? (
                    <SvgText
                      x={placement.x + (isTerminal ? 14 : 8)}
                      y={placement.y + (isTerminal ? 4 : -8)}
                      fontSize={isTerminal ? 16 : 12}
                      fill={isTerminal ? theme.colors.circuitNode : theme.colors.circuitNodeLabel}
                      fontWeight={isTerminal ? "700" : "600"}
                    >
                      {truncateLabel(label, false)}
                    </SvgText>
                  ) : null}
                </React.Fragment>
              );
            })}
          </Svg>
          <View pointerEvents="box-none" style={styles.nodeOverlay}>
            {visibleNodePlacements.map((placement) => {
              const node = nodeMap.get(placement.nodeId);
              const label = placement.label || node?.label;
              if (!label || label.length <= 10) return null;
              return (
                <Pressable
                  key={`tap-${placement.nodeId}:${placement.x}:${placement.y}`}
                  onPress={() => handleNodePress(placement)}
                  style={({ pressed }) => [
                    styles.nodeTouchTarget,
                    {
                      left: placement.x * initialScale - 14,
                      top: placement.y * initialScale - 14,
                    },
                    pressed && { opacity: 0.6 },
                  ]}
                />
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );

  const renderScrollableContent = () => (
    <View style={{ width: Math.max(contentWidth, viewportWidth), height: Math.max(contentHeight, viewportHeight) }}>
      <Svg width={contentWidth} height={contentHeight} viewBox={`0 0 ${layout.width} ${layout.height}`}>
        {wirePaths.map(({ wire, d }) => {
          const isSelectedWire = selectedComponentId
            ? wire.componentId === selectedComponentId
            : false;
          return (
            <Path
              key={wire.id}
              d={d}
              stroke={isSelectedWire ? theme.colors.primary : theme.colors.circuitWire}
              strokeWidth={isSelectedWire ? (compact ? 3 : 3.8) : compact ? 2 : 2.4}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {layout.terminalPlacements
          .filter((placement) => !connectedTerminalKeys.has(terminalKey(placement.componentId, placement.terminalId)))
          .map((placement) => (
            <Circle
              key={`${placement.componentId}:${placement.terminalId}`}
              cx={placement.x}
              cy={placement.y}
              r={compact ? 2.5 : 3}
              fill={theme.colors.circuitUnconnectedTerminal}
            />
          ))}
      </Svg>

      <View pointerEvents="box-none" style={styles.overlay}>
        {layout.componentPlacements.map((placement) => {
          const component = componentMap.get(placement.componentId);
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
              style={({ pressed }) => [
                styles.componentCard,
                {
                  left: placement.x * initialScale,
                  top: placement.y * initialScale,
                  width: placement.width * initialScale,
                  height: placement.height * initialScale,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <CircuitSymbol
                component={displayComponent}
                x={0}
                y={0}
                width={placement.width * initialScale}
                height={placement.height * initialScale}
                selected={selectedComponentId === component.id}
                compact={compact}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, compact && !hideChrome ? styles.compactContainer : null, hideChrome ? styles.hideChromeContainer : null]}>
      {!compact && !hideChrome ? (
        <View style={styles.toolbar}>
          <Text style={styles.toolbarHint}>拖动画布查看全貌</Text>
          <View style={styles.toolbarActions}>
            <Pressable
              onPress={scrollToOrigin}
              style={({ pressed }) => [
                styles.fitButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.fitButtonText}>适配</Text>
            </Pressable>
            <Pressable
              onPress={() => setFullscreenVisible(true)}
              style={({ pressed }) => [
                styles.detailButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="expand-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.detailButtonText}>全屏</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {compact && !hideChrome ? (
        <View style={styles.compactHeader}>
          <Text style={styles.compactTitle}>拓扑预览</Text>
          <Text style={styles.compactSubtitle}>到编辑页可拖动查看完整图</Text>
        </View>
      ) : null}

      <View
        style={[
          styles.viewport,
          hideChrome
            ? styles.fullscreenViewport
            : compact
              ? styles.compactViewport
              : { height: viewportHeight },
        ]}
      >
        {!compact ? renderNodeHeader() : null}
        <ScrollView
          ref={verticalScrollRef}
          style={styles.scrollFill}
          contentContainerStyle={[
            styles.verticalScrollContent,
            { minHeight: Math.max(contentHeight, adjustedViewportHeight) },
          ]}
          showsVerticalScrollIndicator={!compact}
          nestedScrollEnabled
          maximumZoomScale={1}
          minimumZoomScale={1}
        >
          <ScrollView
            ref={horizontalScrollRef}
            horizontal
            style={[styles.horizontalScroll, { height: Math.max(contentHeight, adjustedViewportHeight) }]}
            contentContainerStyle={[
              styles.horizontalScrollContent,
              { minWidth: Math.max(contentWidth, viewportWidth), minHeight: Math.max(contentHeight, adjustedViewportHeight) },
            ]}
            showsHorizontalScrollIndicator={!compact}
            nestedScrollEnabled
            onScroll={!compact ? (e) => syncHorizontalScrolls("content", e.nativeEvent.contentOffset.x) : undefined}
            scrollEventThrottle={16}
          >
            {renderScrollableContent()}
          </ScrollView>
        </ScrollView>
      </View>

      {!compact && !hideChrome ? (
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

      {!compact ? (
        <Modal
          visible={fullscreenVisible}
          animationType="fade"
          presentationStyle="fullScreen"
          onRequestClose={() => setFullscreenVisible(false)}
        >
          <View style={styles.fullscreenContainer}>
            <View style={styles.fullscreenHeader}>
              <Text style={styles.fullscreenTitle}>电路拓扑 · 全屏</Text>
              <Pressable
                onPress={() => setFullscreenVisible(false)}
                style={({ pressed }) => [
                  styles.fullscreenCloseBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="close" size={20} color={theme.colors.foreground} />
              </Pressable>
            </View>
            <CircuitCanvas
              topology={topology}
              selectedComponentId={selectedComponentId}
              onSelectComponent={onSelectComponent}
              hideChrome
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.circuitBg,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  compactContainer: {
    minHeight: 220,
  },
  hideChromeContainer: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    backgroundColor: theme.colors.circuitCardBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  toolbarHint: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
    fontWeight: theme.fontWeight.medium,
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: theme.spacing.xs,
  },
  detailButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryMuted,
  },
  detailButtonText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.semibold,
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
    backgroundColor: theme.colors.circuitBg,
    overflow: "hidden",
  },
  compactViewport: {
    height: 188,
  },
  fullscreenViewport: {
    flex: 1,
  },
  scrollFill: {
    flexGrow: 0,
  },
  horizontalScroll: {
    flexGrow: 0,
  },
  verticalScrollContent: {
    flexGrow: 0,
  },
  horizontalScrollContent: {
    flexGrow: 0,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  nodeHeader: {
    backgroundColor: theme.colors.circuitCardBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  nodeHeaderScroll: {
    flexGrow: 0,
  },
  nodeHeaderScrollContent: {
    flexGrow: 0,
  },
  nodeOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  nodeTouchTarget: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
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
    backgroundColor: theme.colors.circuitCardBg,
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
  fullscreenContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  fullscreenHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 48,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  fullscreenTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  fullscreenCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
});

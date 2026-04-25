import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CIRCUIT_COMPONENT_KIND_OPTIONS,
  CIRCUIT_COMPONENT_LABELS,
  createComponentFromKind,
} from "../constants/circuitCatalog";
import {
  createCircuitTopology,
  getComponentNodeMap,
  getControlRelation,
} from "../services/circuitSerialize";
import { CircuitTopology, CircuitValidationIssue, CircuitNode, ComponentOrientation } from "../types";
import { theme } from "../theme";
import CircuitCanvas from "./circuit/CircuitCanvas";

type Props = {
  topology: CircuitTopology;
  onConfirm: (topology: CircuitTopology, userNotes: string) => void;
  onCancel: () => void;
};

function buildValidationIssues(topology: CircuitTopology): CircuitValidationIssue[] {
  const issues: CircuitValidationIssue[] = [];
  const nodeIds = new Set(topology.nodes.map((node) => node.id));
  const componentMap = new Map(topology.components.map((component) => [component.id, component]));

  topology.components.forEach((component) => {
    const nodeMap = getComponentNodeMap(topology, component.id);
    component.terminals.forEach((terminal) => {
      const nodeId = nodeMap[terminal.id];
      if (!nodeId) {
        issues.push({
          id: `${component.id}:${terminal.id}:missing`,
          level: "warning",
          message: `${component.name} 的 ${terminal.label} 端子尚未连接节点`,
        });
      } else if (!nodeIds.has(nodeId)) {
        issues.push({
          id: `${component.id}:${terminal.id}:unknown-node`,
          level: "error",
          message: `${component.name} 的 ${terminal.label} 端子连接到未声明节点 ${nodeId}`,
        });
      }
    });

    if (["vcvs", "vccs", "ccvs", "cccs"].includes(component.kind)) {
      const control = getControlRelation(topology, component.id);
      if (!control) {
        issues.push({
          id: `${component.id}:control`,
          level: "warning",
          message: `${component.name} 是受控源，但尚未配置控制关系`,
        });
      }
    }
  });

  topology.connections.forEach((connection) => {
    const component = componentMap.get(connection.componentId);
    if (!component) {
      issues.push({
        id: `${connection.id}:component`,
        level: "error",
        message: `存在连接引用了不存在的元件 ${connection.componentId}`,
      });
      return;
    }

    if (!component.terminals.find((terminal) => terminal.id === connection.terminalId)) {
      issues.push({
        id: `${connection.id}:terminal`,
        level: "error",
        message: `${component.name} 存在无效端子连接 ${connection.terminalId}`,
      });
    }
  });

  return issues;
}

function rebuildTopology(
  current: CircuitTopology,
  overrides: Partial<Pick<CircuitTopology, "nodes" | "components" | "connections" | "controls" | "layout">>
) {
  return createCircuitTopology({
    rawDescription: current.rawDescription,
    nodes: overrides.nodes ?? current.nodes,
    components: overrides.components ?? current.components,
    connections: overrides.connections ?? current.connections,
    controls: overrides.controls ?? current.controls,
    layout: Object.prototype.hasOwnProperty.call(overrides, "layout")
      ? overrides.layout
      : current.layout,
  });
}

export default function CircuitEditor({ topology, onConfirm, onCancel }: Props) {
  const [draft, setDraft] = useState<CircuitTopology>(topology);
  const [notes, setNotes] = useState("");
  const [selectedComponentId, setSelectedComponentId] = useState<string>(
    topology.components[0]?.id || ""
  );

  const selectedComponent = useMemo(
    () => draft.components.find((component) => component.id === selectedComponentId) || draft.components[0],
    [draft.components, selectedComponentId]
  );

  const selectedNodeMap = selectedComponent
    ? getComponentNodeMap(draft, selectedComponent.id)
    : {};
  const selectedControl = selectedComponent
    ? getControlRelation(draft, selectedComponent.id)
    : undefined;
  const validationIssues = useMemo(() => buildValidationIssues(draft), [draft]);

  const updateTopology = useCallback((updater: (current: CircuitTopology) => CircuitTopology) => {
    setDraft((current) => updater(current));
  }, []);

  const updateComponent = useCallback(
    (
      componentId: string,
      updater: (component: CircuitTopology["components"][number]) => CircuitTopology["components"][number]
    ) => {
      updateTopology((current) =>
        rebuildTopology(current, {
          components: current.components.map((component) =>
            component.id === componentId ? updater(component) : component
          ),
        })
      );
    },
    [updateTopology]
  );

  const updateNodeConnection = useCallback(
    (componentId: string, terminalId: string, nodeId: string) => {
      updateTopology((current) => {
        const normalizedNodeId = nodeId.trim();
        const nextNodes: CircuitNode[] =
          normalizedNodeId && !current.nodes.find((node) => node.id === normalizedNodeId)
            ? [
                ...current.nodes,
                {
                  id: normalizedNodeId,
                  label: normalizedNodeId,
                  kind: ["0", "gnd", "ground", "地"].includes(normalizedNodeId.toLowerCase())
                    ? "ground"
                    : "signal",
                },
              ]
            : current.nodes;

        const filteredConnections = current.connections.filter(
          (connection) =>
            !(connection.componentId === componentId && connection.terminalId === terminalId)
        );

        const nextConnections = normalizedNodeId
          ? [
              ...filteredConnections,
              {
                id: `${componentId}:${terminalId}`,
                componentId,
                terminalId,
                nodeId: normalizedNodeId,
              },
            ]
          : filteredConnections;

        return rebuildTopology(current, {
          nodes: nextNodes,
          connections: nextConnections,
          layout: undefined,
        });
      });
    },
    [updateTopology]
  );

  const updateControl = useCallback(
    (
      field: "controlType" | "positiveNodeId" | "negativeNodeId" | "controllingComponentId",
      value: string
    ) => {
      if (!selectedComponent) {
        return;
      }

      updateTopology((current) => {
        const nextControls = current.controls.filter(
          (control) => control.sourceComponentId !== selectedComponent.id
        );
        const shouldCreate =
          selectedComponent.kind === "vcvs" ||
          selectedComponent.kind === "vccs" ||
          selectedComponent.kind === "ccvs" ||
          selectedComponent.kind === "cccs";

        if (shouldCreate) {
          nextControls.push({
            id: selectedControl?.id || `ctrl-${selectedComponent.id}`,
            sourceComponentId: selectedComponent.id,
            controlType:
              field === "controlType"
                ? (value as "voltage" | "current")
                : selectedControl?.controlType || "voltage",
            positiveNodeId:
              field === "positiveNodeId" ? value.trim() || undefined : selectedControl?.positiveNodeId,
            negativeNodeId:
              field === "negativeNodeId" ? value.trim() || undefined : selectedControl?.negativeNodeId,
            controllingComponentId:
              field === "controllingComponentId"
                ? value.trim() || undefined
                : selectedControl?.controllingComponentId,
          });
        }

        return rebuildTopology(current, {
          controls: nextControls,
        });
      });
    },
    [selectedComponent, selectedControl, updateTopology]
  );

  const addComponent = useCallback(
    (kind: (typeof CIRCUIT_COMPONENT_KIND_OPTIONS)[number]) => {
      updateTopology((current) => {
        const nextComponent = createComponentFromKind(kind, current.components.length);
        return rebuildTopology(current, {
          components: [...current.components, nextComponent],
          layout: undefined,
        });
      });
    },
    [updateTopology]
  );

  const removeSelectedComponent = useCallback(() => {
    if (!selectedComponent) {
      return;
    }

    updateTopology((current) =>
      rebuildTopology(current, {
        components: current.components.filter((component) => component.id !== selectedComponent.id),
        connections: current.connections.filter(
          (connection) => connection.componentId !== selectedComponent.id
        ),
        controls: current.controls.filter(
          (control) => control.sourceComponentId !== selectedComponent.id
        ),
        layout: undefined,
      })
    );
    setSelectedComponentId("");
  }, [selectedComponent, updateTopology]);

  const relayoutDiagram = useCallback(() => {
    updateTopology((current) => rebuildTopology(current, { layout: undefined }));
  }, [updateTopology]);

  const handleConfirm = useCallback(() => {
    onConfirm(draft, notes);
  }, [draft, notes, onConfirm]);

  const isControlledSource =
    selectedComponent && ["vcvs", "vccs", "ccvs", "cccs"].includes(selectedComponent.kind);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>编辑电路拓扑</Text>
        <Pressable onPress={onCancel}>
          <Text style={styles.cancelHeaderBtn}>取消</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>电路连接可视化</Text>
          <Pressable onPress={relayoutDiagram} style={styles.relayoutButton}>
            <Ionicons name="refresh-outline" size={14} color={theme.colors.primary} />
            <Text style={styles.relayoutButtonText}> 重新布局</Text>
          </Pressable>
        </View>
        <CircuitCanvas
          topology={draft}
          selectedComponentId={selectedComponent?.id}
          onSelectComponent={setSelectedComponentId}
        />

        {validationIssues.length > 0 ? (
          <View style={styles.issueCard}>
            <Text style={styles.issueTitle}>拓扑检查</Text>
            {validationIssues.map((issue) => (
              <Text
                key={issue.id}
                style={[
                  styles.issueLine,
                  issue.level === "error" ? styles.issueError : styles.issueWarning,
                ]}
              >
                {issue.level === "error" ? "错误" : "提示"} · {issue.message}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>添加元件</Text>
        <View style={styles.paletteGrid}>
          {CIRCUIT_COMPONENT_KIND_OPTIONS.filter((kind) => kind !== "unknown").map((kind) => (
            <Pressable key={kind} onPress={() => addComponent(kind)} style={styles.paletteItem}>
              <Text style={styles.paletteItemText}>{CIRCUIT_COMPONENT_LABELS[kind]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>元件列表</Text>
        <View style={styles.componentList}>
          {draft.components.map((component) => (
            <Pressable
              key={component.id}
              onPress={() => setSelectedComponentId(component.id)}
              style={[
                styles.componentListItem,
                selectedComponent?.id === component.id ? styles.componentListItemActive : null,
              ]}
            >
              <Text style={styles.componentListName}>{component.name}</Text>
              <Text style={styles.componentListMeta}>{CIRCUIT_COMPONENT_LABELS[component.kind]}</Text>
            </Pressable>
          ))}
        </View>

        {selectedComponent ? (
          <View style={styles.inspectorCard}>
            <View style={styles.inspectorHeader}>
              <Text style={styles.inspectorTitle}>Inspector · {selectedComponent.name}</Text>
              <Pressable onPress={removeSelectedComponent} style={styles.removeBtn}>
                <Ionicons name="trash-outline" size={14} color={theme.colors.destructive} />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>元件类型</Text>
            <View style={styles.typeTag}>
              <Text style={styles.typeTagText}>{CIRCUIT_COMPONENT_LABELS[selectedComponent.kind]}</Text>
            </View>

            <Text style={styles.fieldLabel}>名称</Text>
            <TextInput
              style={styles.fieldInput}
              value={selectedComponent.name}
              onChangeText={(value) =>
                updateComponent(selectedComponent.id, (component) => ({ ...component, name: value }))
              }
              placeholder="如 R1"
              placeholderTextColor={theme.colors.mutedForeground}
            />

            <Text style={styles.fieldLabel}>显示值</Text>
            <TextInput
              style={styles.fieldInput}
              value={selectedComponent.value}
              onChangeText={(value) =>
                updateComponent(selectedComponent.id, (component) => ({ ...component, value }))
              }
              placeholder="如 10kΩ"
              placeholderTextColor={theme.colors.mutedForeground}
            />

            <Text style={styles.fieldLabel}>元件朝向</Text>
            <View style={styles.toggleRow}>
              {(["auto", "horizontal", "vertical"] as const).map((o) => (
                <Pressable
                  key={o}
                  onPress={() =>
                    updateComponent(selectedComponent.id, (component) => ({
                      ...component,
                      orientation: o,
                    }))
                  }
                  style={[
                    styles.toggleBtn,
                    (selectedComponent.orientation || "auto") === o ? styles.toggleBtnActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      (selectedComponent.orientation || "auto") === o
                        ? styles.toggleBtnTextActive
                        : null,
                    ]}
                  >
                    {o === "auto" ? "自动" : o === "horizontal" ? "水平" : "垂直"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {selectedComponent.parameters.map((parameter) => (
              <View key={`${selectedComponent.id}:${parameter.key}`}>
                <Text style={styles.fieldLabel}>{parameter.label}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={parameter.value}
                  onChangeText={(value) =>
                    updateComponent(selectedComponent.id, (component) => ({
                      ...component,
                      parameters: component.parameters.map((current) =>
                        current.key === parameter.key ? { ...current, value } : current
                      ),
                    }))
                  }
                  placeholder={parameter.label}
                  placeholderTextColor={theme.colors.mutedForeground}
                />
              </View>
            ))}

            <Text style={styles.fieldLabel}>端子连接</Text>
            {selectedComponent.terminals.map((terminal) => (
              <View key={`${selectedComponent.id}:${terminal.id}`} style={styles.fieldRow}>
                <Text style={styles.terminalLabel}>{terminal.label}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={selectedNodeMap[terminal.id] || ""}
                  onChangeText={(value) => updateNodeConnection(selectedComponent.id, terminal.id, value)}
                  placeholder="节点名"
                  placeholderTextColor={theme.colors.mutedForeground}
                />
              </View>
            ))}

            {isControlledSource ? (
              <>
                <Text style={styles.fieldLabel}>控制类型</Text>
                <View style={styles.toggleRow}>
                  {(["voltage", "current"] as const).map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => updateControl("controlType", type)}
                      style={[
                        styles.toggleBtn,
                        (selectedControl?.controlType || "voltage") === type ? styles.toggleBtnActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.toggleBtnText,
                          (selectedControl?.controlType || "voltage") === type
                            ? styles.toggleBtnTextActive
                            : null,
                        ]}
                      >
                        {type === "voltage" ? "电压控制" : "电流控制"}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>控制节点正端</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={selectedControl?.positiveNodeId || ""}
                  onChangeText={(value) => updateControl("positiveNodeId", value)}
                  placeholder="如 Node+"
                  placeholderTextColor={theme.colors.mutedForeground}
                />
                <Text style={styles.fieldLabel}>控制节点负端</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={selectedControl?.negativeNodeId || ""}
                  onChangeText={(value) => updateControl("negativeNodeId", value)}
                  placeholder="如 Node-"
                  placeholderTextColor={theme.colors.mutedForeground}
                />
                <Text style={styles.fieldLabel}>控制支路（可选）</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={selectedControl?.controllingComponentId || ""}
                  onChangeText={(value) => updateControl("controllingComponentId", value)}
                  placeholder="如 Vx 或 R3"
                  placeholderTextColor={theme.colors.mutedForeground}
                />
              </>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>补充信息（可选）</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="可以补充题目条件、求解目标等..."
          placeholderTextColor={theme.colors.mutedForeground}
          multiline
          maxLength={1000}
        />

        <View style={styles.actionRow}>
          <Pressable onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>取消</Text>
          </Pressable>
          <Pressable onPress={handleConfirm} style={styles.confirmBtn}>
            <Text style={styles.confirmBtnText}>确认并提交解答</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 48,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.headerText,
  },
  cancelHeaderBtn: {
    fontSize: theme.fontSize.base,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.medium,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: 40,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  relayoutButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  relayoutButtonText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.semibold,
  },
  issueCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  issueTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
    marginBottom: theme.spacing.sm,
  },
  issueLine: {
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    marginBottom: 4,
  },
  issueWarning: {
    color: "#B26A00",
  },
  issueError: {
    color: theme.colors.destructive,
  },
  paletteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  paletteItem: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  paletteItemText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  componentList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  componentListItem: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minWidth: 88,
  },
  componentListItemActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryMuted,
  },
  componentListName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.semibold,
  },
  componentListMeta: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mutedForeground,
    marginTop: 2,
  },
  inspectorCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: theme.spacing.md,
  },
  inspectorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  inspectorTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.destructiveMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  typeTag: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.primaryMuted,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    marginBottom: theme.spacing.md,
  },
  typeTagText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.semibold,
  },
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
    fontWeight: theme.fontWeight.medium,
    marginBottom: 6,
    marginTop: 4,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  terminalLabel: {
    width: 56,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  fieldInput: {
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
    flex: 1,
  },
  toggleRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  toggleBtn: {
    flex: 1,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.muted,
    paddingVertical: 10,
    alignItems: "center",
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.primaryMuted,
    borderColor: theme.colors.primary,
  },
  toggleBtnText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
    fontWeight: theme.fontWeight.medium,
  },
  toggleBtnTextActive: {
    color: theme.colors.primary,
  },
  notesInput: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
  },
  actionRow: { flexDirection: "row", gap: theme.spacing.md },
  cancelBtn: {
    flex: 1,
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.xl,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.mutedForeground,
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.xl,
    paddingVertical: 14,
    alignItems: "center",
    ...theme.shadow.md,
  },
  confirmBtnText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.primaryForeground,
  },
});

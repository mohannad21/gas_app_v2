import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useSystemHealthCheck } from "@/hooks/useSystemHealthCheck";
import { formatDateTimeMedium } from "@/lib/date";

export default function SystemHealthScreen() {
  const healthQuery = useSystemHealthCheck();
  const data = healthQuery.data;

  const checkedAt = useMemo(() => {
    if (!data?.checked_at) return "";
    return formatDateTimeMedium(data.checked_at, undefined, "?");
  }, [data?.checked_at]);

  const issues = data?.issues ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>System Health</Text>
      <Text style={styles.meta}>Ledger double-entry audit.</Text>

      <View style={[styles.statusCard, data?.ok ? styles.statusOk : styles.statusWarn]}>
        <Text style={styles.statusTitle}>{data?.ok ? "All checks passed" : "Issues detected"}</Text>
        <Text style={styles.statusMeta}>Checked at: {checkedAt || "?"}</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Mismatches</Text>
          <Text style={styles.statValue}>{data?.mismatches ?? 0}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Orphans</Text>
          <Text style={styles.statValue}>{data?.orphans ?? 0}</Text>
        </View>
      </View>

      <Pressable
        onPress={() => healthQuery.refetch()}
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
      >
        <Text style={styles.primaryText}>{healthQuery.isFetching ? "Checking..." : "Run health check"}</Text>
      </Pressable>

      {healthQuery.isLoading && <Text style={styles.meta}>Loading health check...</Text>}

      {issues.length === 0 && !healthQuery.isLoading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No issues found.</Text>
        </View>
      ) : (
        <View style={styles.issueSection}>
          {issues.map((issue, index) => (
            <View key={`${issue.source_type}-${issue.source_id}-${index}`} style={styles.issueCard}>
              <View style={styles.issueHeader}>
                <Text style={styles.issueType}>{issue.issue_type.toUpperCase()}</Text>
                <Text style={styles.issueSource}>{issue.source_type}</Text>
              </View>
              <Text style={styles.issueMeta}>Source ID: {issue.source_id}</Text>
              <Text style={styles.issueMessage}>{issue.message}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f7f8",
  },
  content: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  meta: {
    color: "#64748b",
    fontSize: 12,
  },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  statusOk: {
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
  },
  statusWarn: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
  },
  statusMeta: {
    fontSize: 12,
    color: "#475569",
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  statValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  primary: {
    backgroundColor: "#0a7ea4",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.9,
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  emptyText: {
    color: "#475569",
    fontWeight: "600",
  },
  issueSection: {
    gap: 10,
  },
  issueCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#f5c6cb",
    gap: 6,
  },
  issueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  issueType: {
    fontSize: 11,
    fontWeight: "800",
    color: "#b00020",
  },
  issueSource: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  issueMeta: {
    fontSize: 11,
    color: "#6b7280",
  },
  issueMessage: {
    fontSize: 12,
    color: "#1f2937",
  },
});

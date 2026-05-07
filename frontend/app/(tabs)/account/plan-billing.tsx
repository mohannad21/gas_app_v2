import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { usePlanBillingStatus } from "@/hooks/usePlanBilling";
import { formatDateMedium, formatDateTimeMedium } from "@/lib/date";
import { formatDisplayMoney, getCurrencySymbol } from "@/lib/money";

function statusColors(status: string) {
  if (status === "active" || status === "trial") {
    return { backgroundColor: "#dcfce7", color: "#166534" };
  }
  if (status === "grace_period") {
    return { backgroundColor: "#fef3c7", color: "#92400e" };
  }
  return { backgroundColor: "#fee2e2", color: "#991b1b" };
}

function formatMoney(value: number) {
  return `${formatDisplayMoney(value)} ${getCurrencySymbol()}`;
}

function formatEventKind(kind: string) {
  return kind
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export default function PlanBillingScreen() {
  const router = useRouter();
  const billingQuery = usePlanBillingStatus();
  const data = billingQuery.data;
  const badge = statusColors(data?.subscription_status ?? "suspended");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>{"<"}</Text>
        </Pressable>
        <Text style={styles.title}>Plan & Billing</Text>
        <View style={styles.backButtonSpacer} />
      </View>

      {billingQuery.isLoading ? (
        <View style={styles.centerCard}>
          <ActivityIndicator size="small" color="#0a7ea4" />
          <Text style={styles.meta}>Loading billing details...</Text>
        </View>
      ) : null}

      {billingQuery.isError ? (
        <View style={styles.centerCard}>
          <Text style={styles.errorText}>Could not load billing details.</Text>
        </View>
      ) : null}

      {data ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Plan</Text>
            <View style={styles.row}>
              <Text style={styles.rowText}>Plan</Text>
              <Text style={styles.valueText}>{data.plan_name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowText}>Status</Text>
              <View style={[styles.badge, { backgroundColor: badge.backgroundColor }]}>
                <Text style={[styles.badgeText, { color: badge.color }]}>{formatEventKind(data.subscription_status)}</Text>
              </View>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowText}>Next payment due</Text>
              <Text style={styles.valueText}>
                {data.current_period_end ? formatDateMedium(data.current_period_end, undefined, "-") : "-"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowText}>Grace period ends</Text>
              <Text style={styles.valueText}>
                {data.grace_period_end ? formatDateMedium(data.grace_period_end, undefined, "-") : "-"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowText}>Outstanding balance</Text>
              <Text style={styles.valueText}>{formatMoney(data.outstanding_balance)}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Events</Text>
            {data.recent_events.length === 0 ? (
              <Text style={styles.emptyText}>No billing events yet.</Text>
            ) : (
              data.recent_events.map((event, index) => (
                <View key={`${event.kind}-${event.effective_at}-${index}`} style={styles.eventRow}>
                  <View style={styles.eventTextBlock}>
                    <Text style={styles.eventKind}>{formatEventKind(event.kind)}</Text>
                    <Text style={styles.eventMeta}>{formatDateTimeMedium(event.effective_at, undefined, "-")}</Text>
                    {event.note ? <Text style={styles.eventNote}>{event.note}</Text> : null}
                  </View>
                  <Text style={[styles.eventAmount, event.amount < 0 ? styles.negativeAmount : styles.positiveAmount]}>
                    {event.amount < 0 ? "-" : "+"}
                    {formatMoney(Math.abs(event.amount))}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
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
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  backButtonText: {
    fontSize: 20,
    color: "#111",
  },
  backButtonSpacer: {
    width: 36,
    height: 36,
  },
  title: {
    fontSize: 26,
    fontFamily: "NunitoSans-Bold",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "NunitoSans-SemiBold",
    color: "#888",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  rowText: {
    fontSize: 16,
    color: "#111",
    fontFamily: "NunitoSans-Regular",
  },
  valueText: {
    fontSize: 15,
    color: "#111",
    fontFamily: "NunitoSans-SemiBold",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "NunitoSans-Bold",
  },
  centerCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 10,
  },
  meta: {
    color: "#64748b",
    fontSize: 13,
    fontFamily: "NunitoSans-Regular",
  },
  errorText: {
    color: "#b00020",
    fontSize: 14,
    fontFamily: "NunitoSans-SemiBold",
  },
  emptyText: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#64748b",
    fontSize: 14,
    fontFamily: "NunitoSans-Regular",
  },
  eventRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  eventTextBlock: {
    flex: 1,
    gap: 4,
  },
  eventKind: {
    fontSize: 15,
    color: "#111",
    fontFamily: "NunitoSans-SemiBold",
  },
  eventMeta: {
    fontSize: 12,
    color: "#64748b",
    fontFamily: "NunitoSans-Regular",
  },
  eventNote: {
    fontSize: 13,
    color: "#475569",
    fontFamily: "NunitoSans-Regular",
  },
  eventAmount: {
    fontSize: 14,
    fontFamily: "NunitoSans-Bold",
  },
  positiveAmount: {
    color: "#166534",
  },
  negativeAmount: {
    color: "#991b1b",
  },
});

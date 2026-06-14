import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CompanyAdjustInlineForm from "@/components/entry/CompanyAdjustInlineForm";
import { useCompanyBalanceAdjustments } from "@/hooks/useCompanyBalances";

export default function CompanyBalanceAdjustScreen() {
  const params = useLocalSearchParams<{ adjustmentId?: string | string[] }>();
  const adjustmentId = Array.isArray(params.adjustmentId) ? params.adjustmentId[0] : params.adjustmentId;
  const adjustmentsQuery = useCompanyBalanceAdjustments({ enabled: !!adjustmentId });
  const adjustment = (adjustmentsQuery.data ?? []).find((entry) => entry.id === adjustmentId) ?? null;
  const isEditing = Boolean(adjustmentId);

  if (isEditing && !adjustmentsQuery.isLoading && !adjustment) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <View style={styles.center}>
          <Text style={styles.missingTitle}>Adjustment not found.</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isEditing && adjustmentsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <View style={styles.center}>
          <Text style={styles.missingTitle}>Loading adjustment...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <View style={styles.screenInner}>
        <CompanyAdjustInlineForm
          date=""
          adjustment={adjustment}
          showHeader
          onClose={() => router.back()}
          onSaveSuccess={({ highlightId }) => {
            router.replace({ pathname: "/(tabs)/add", params: { highlightId } });
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f3f5f7",
  },
  screenInner: {
    flex: 1,
    backgroundColor: "#f3f5f7",
    padding: 14,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 20,
  },
  missingTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  backButton: {
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
  },
  backButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
});

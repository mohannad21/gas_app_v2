import { ScrollView, StyleSheet, Text, View } from "react-native";

import SlimActivityRow from "@/components/reports/SlimActivityRow";
import { level3Fixtures } from "@/dev/level3-fixtures";

export default function Level3PreviewScreen() {
  if (!__DEV__) {
    return (
      <View style={styles.container}>
        <Text style={styles.notice}>Level 3 preview is available only in dev builds.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {level3Fixtures.map((event) => (
        <SlimActivityRow key={event.source_id ?? `${event.event_type}-${event.effective_at}`} event={event} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    paddingVertical: 8,
  },
  notice: {
    marginTop: 24,
    textAlign: "center",
    color: "#64748b",
  },
});


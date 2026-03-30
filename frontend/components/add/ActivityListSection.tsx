import { FlatList, Text, View, Pressable, StyleSheet } from "react-native";
import { ReactNode } from "react";

interface ActivityListSectionProps {
  data: any[];
  isLoading: boolean;
  error: any;
  emptyMessage: string;
  onRetry: () => void;
  renderItem: (item: any) => ReactNode;
  keyExtractor?: (item: any) => string;
}

export default function ActivityListSection({
  data,
  isLoading,
  error,
  emptyMessage,
  onRetry,
  renderItem,
  keyExtractor = (item) => item.id,
}: ActivityListSectionProps) {
  return (
    <>
      {isLoading && <Text style={styles.meta}>Loading...</Text>}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>Failed to load activities.</Text>
          <Pressable style={styles.retryBtn} onPress={onRetry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ gap: 0 }}
        ListEmptyComponent={!isLoading && !error ? <Text style={styles.meta}>{emptyMessage}</Text> : null}
        renderItem={({ item }) => renderItem(item)}
        scrollEnabled={false}
      />
    </>
  );
}

const styles = StyleSheet.create({
  meta: {
    textAlign: "center",
    paddingVertical: 16,
    color: "#666",
    fontSize: 14,
  },
  errorBox: {
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fee",
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#f00",
  },
  error: {
    color: "#c00",
    fontSize: 14,
    marginBottom: 8,
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f00",
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  retryText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
});

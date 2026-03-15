import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

type CollapsibleSectionCardProps = {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
};

export default function CollapsibleSectionCard({
  title,
  collapsed,
  onToggle,
  children,
  containerStyle,
  contentStyle,
  titleStyle,
}: CollapsibleSectionCardProps) {
  return (
    <View style={[styles.card, containerStyle]}>
      <Pressable onPress={onToggle} style={styles.header}>
        <Text style={[styles.title, titleStyle]}>{title}</Text>
        <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={18} color="#0a7ea4" />
      </Pressable>
      {collapsed ? null : <View style={[styles.content, contentStyle]}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  content: {
    marginTop: 12,
  },
});

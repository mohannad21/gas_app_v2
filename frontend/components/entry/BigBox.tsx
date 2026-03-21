import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type BigBoxProps = {
  title: string;
  statusLine?: string | null;
  statusIsAlert?: boolean;
  defaultExpanded?: boolean;
  children: ReactNode;
};

export default function BigBox({
  title,
  statusLine,
  statusIsAlert = false,
  defaultExpanded = false,
  children,
}: BigBoxProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isSettled = statusLine === "Settled";
  const statusColorStyle = statusIsAlert ? styles.bigBoxStatusAlert : styles.bigBoxStatusOk;

  return (
    <View style={styles.bigBox}>
      <Pressable style={styles.bigBoxHeader} onPress={() => setExpanded((value) => !value)}>
        <Text style={styles.bigBoxTitle}>{title}</Text>
        <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={18} color="#0f172a" />
      </Pressable>
      {statusLine ? (
        <View style={styles.bigBoxStatusRow}>
          {isSettled ? (
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={statusIsAlert ? "#b00020" : "#15803d"}
              style={styles.bigBoxStatusIcon}
            />
          ) : null}
          <Text style={[styles.bigBoxStatus, statusColorStyle]}>{statusLine}</Text>
        </View>
      ) : null}
      {expanded ? (
        <>
          <View style={styles.bigBoxDivider} />
          <View style={styles.bigBoxContent}>{children}</View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bigBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  bigBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    paddingBottom: 10,
  },
  bigBoxTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
  },
  bigBoxStatus: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
    paddingBottom: 8,
  },
  bigBoxStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 14,
  },
  bigBoxStatusIcon: {
    marginBottom: 8,
  },
  bigBoxStatusAlert: {
    color: "#b00020",
  },
  bigBoxStatusOk: {
    color: "#15803d",
  },
  bigBoxDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 0,
  },
  bigBoxContent: {
    padding: 14,
  },
});

import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type FormActionRowAlign = "full" | "left" | "right";

type FormActionRowProps = {
  align?: FormActionRowAlign;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function FormActionRow({ align = "full", children, style }: FormActionRowProps) {
  if (align === "full") {
    return <View style={[styles.full, style]}>{children}</View>;
  }

  return (
    <View style={[styles.split, style]}>
      <View style={styles.cell}>{align === "left" ? children : null}</View>
      <View style={styles.cell}>{align === "right" ? children : null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    marginTop: 12,
    width: "100%",
    alignSelf: "stretch",
  },
  split: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
});

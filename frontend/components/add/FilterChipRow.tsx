import { FontFamilies } from "@/constants/typography";
import { ScrollView, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

export type FilterOption<T extends string> = {
  id: T;
  label: string;
};

type FilterChipRowProps<T extends string> = {
  options: FilterOption<T>[];
  value: T | null;
  onChange: (next: T | null) => void;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function FilterChipRow<T extends string>({
  options,
  value,
  onChange,
  style,
  contentContainerStyle,
  testID,
}: FilterChipRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.scroll, style]}
      contentContainerStyle={[styles.row, contentContainerStyle]}
      testID={testID}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(active ? null : option.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
      <View style={styles.rowEndSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: {
    paddingVertical: 4,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  chipActive: {
    backgroundColor: "#0a7ea4",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: FontFamilies.bold,
  },
  chipTextActive: {
    color: "white",
  },
  rowEndSpacer: {
    width: 12,
  },
});

import { ScrollView, Pressable, StyleSheet, Text, View } from "react-native";

type FilterOption<T extends string> = {
  id: T;
  label: string;
};

type FilterChipRowProps<T extends string> = {
  options: FilterOption<T>[];
  value: T;
  onChange: (next: T) => void;
  contentContainerStyle?: object;
};

export default function FilterChipRow<T extends string>({
  options,
  value,
  onChange,
  contentContainerStyle,
}: FilterChipRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={[styles.row, contentContainerStyle]}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
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
  scroll: {
    marginHorizontal: -20,
  },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 4,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#e8eef1",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  chipActive: {
    borderColor: "#0a7ea4",
    backgroundColor: "#f8fdff",
  },
  chipText: {
    color: "#1f2937",
    fontWeight: "700",
    fontSize: 13,
  },
  chipTextActive: {
    color: "#0a7ea4",
  },
  rowEndSpacer: {
    width: 12,
  },
});

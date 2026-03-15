import { StyleSheet, TextInput, View } from "react-native";

type NewSectionSearchProps = {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
};

export default function NewSectionSearch({
  value,
  onChangeText,
  placeholder,
}: NewSectionSearchProps) {
  return (
    <View style={styles.wrapper}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
  },
  input: {
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d8dee6",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "500",
  },
});

import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

type PriceConfigButtonProps = {
  label?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export default function PriceConfigButton({
  label = "Update price",
  style,
  textStyle,
  testID,
}: PriceConfigButtonProps) {
  const router = useRouter();

  return (
    <Pressable testID={testID} style={[styles.button, style]} onPress={() => router.push("/add?prices=1")}>
      <Text style={[styles.text, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    backgroundColor: "#0a7ea4",
    alignSelf: "flex-start",
  },
  text: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
});

import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { AppColors } from "@/constants/colors";

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
    <Pressable
      testID={testID}
      style={[styles.button, style]}
      onPress={() => router.push("/(tabs)/account/configuration/prices")}
    >
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
    backgroundColor: AppColors.brand.primary,
    alignSelf: "flex-start",
  },
  text: {
    color: AppColors.brand.onPrimary,
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
});

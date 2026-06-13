import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { AppColors } from "@/constants/colors";
import type { ActivityToggleState, ActivityToggleVariant } from "@/lib/activityToggle";
import { CUSTOMER_WORDING } from "@/lib/wording";

type ActivityToggleButtonProps = {
  variant: ActivityToggleVariant;
  state: ActivityToggleState;
  onPress: () => void;
  testID?: string;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

const LABELS: Record<ActivityToggleVariant, Record<ActivityToggleState, string>> = {
  payment: {
    target: CUSTOMER_WORDING.didntPay,
    zero: CUSTOMER_WORDING.payAll,
  },
  receive: {
    target: CUSTOMER_WORDING.didntReceive,
    zero: CUSTOMER_WORDING.receiveAll,
  },
  return: {
    target: CUSTOMER_WORDING.didntReturn,
    zero: CUSTOMER_WORDING.returnAll,
  },
};

export default function ActivityToggleButton({
  variant,
  state,
  onPress,
  testID,
  fullWidth = false,
  style,
}: ActivityToggleButtonProps) {
  return (
    <Pressable
      testID={testID}
      style={[
        styles.button,
        fullWidth && styles.fullWidth,
        state === "zero" ? styles.success : styles.danger,
        style,
      ]}
      onPress={onPress}
    >
      <Text style={styles.text}>{LABELS[variant][state]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: "center",
    minWidth: 110,
    alignSelf: "center",
  },
  fullWidth: {
    alignSelf: "stretch",
    minWidth: 0,
  },
  success: {
    backgroundColor: AppColors.intent.success,
  },
  danger: {
    backgroundColor: AppColors.intent.danger,
  },
  text: {
    color: AppColors.brand.onPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
});

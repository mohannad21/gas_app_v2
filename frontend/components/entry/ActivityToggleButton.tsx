import { Pressable, StyleSheet, Text } from "react-native";

import type { ActivityToggleState, ActivityToggleVariant } from "@/lib/activityToggle";
import { CUSTOMER_WORDING } from "@/lib/wording";

type ActivityToggleButtonProps = {
  variant: ActivityToggleVariant;
  state: ActivityToggleState;
  onPress: () => void;
  testID?: string;
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

export default function ActivityToggleButton({ variant, state, onPress, testID }: ActivityToggleButtonProps) {
  return (
    <Pressable
      testID={testID}
      style={[styles.button, state === "zero" ? styles.success : styles.danger]}
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
  success: {
    backgroundColor: "#16a34a",
  },
  danger: {
    backgroundColor: "#dc2626",
  },
  text: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
});

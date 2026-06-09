import type { ReactNode } from "react";
import { Keyboard, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

type KeyboardDismissViewProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  testID?: string;
  contentTestID?: string;
};

export default function KeyboardDismissView({
  children,
  style,
  contentStyle,
  disabled = false,
  testID,
  contentTestID,
}: KeyboardDismissViewProps) {
  return (
    <Pressable
      testID={testID}
      accessible={false}
      style={[styles.container, style]}
      onPress={() => {
        if (!disabled) Keyboard.dismiss();
      }}
    >
      <Pressable
        testID={contentTestID}
        accessible={false}
        style={contentStyle}
        onPress={(event) => {
          event?.stopPropagation?.();
        }}
      >
        {children}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type KeyboardAvoidingViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import KeyboardDismissView from "@/components/entry/KeyboardDismissView";

type KeyboardAwareFormProps = {
  children: ReactNode;
  scrollable?: boolean;
  dismissOnTapOutside?: boolean;
  verticalOffset?: number;
  behavior?: KeyboardAvoidingViewProps["behavior"];
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  contentTestID?: string;
};

export default function KeyboardAwareForm({
  children,
  scrollable = false,
  dismissOnTapOutside = true,
  verticalOffset = 80,
  behavior,
  style,
  contentContainerStyle,
  testID,
  contentTestID,
}: KeyboardAwareFormProps) {
  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <KeyboardAvoidingView
      testID={testID}
      behavior={behavior ?? (Platform.OS === "ios" ? "padding" : undefined)}
      keyboardVerticalOffset={Platform.OS === "ios" ? verticalOffset : 0}
      style={style}
    >
      {dismissOnTapOutside ? (
        <KeyboardDismissView contentTestID={contentTestID}>{content}</KeyboardDismissView>
      ) : (
        content
      )}
    </KeyboardAvoidingView>
  );
}

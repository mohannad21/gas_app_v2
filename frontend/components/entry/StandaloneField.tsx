import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

type StandaloneFieldProps = ViewProps & {
  children: ReactNode;
};

export default function StandaloneField({ children, style, ...props }: StandaloneFieldProps) {
  return (
    <View {...props} style={[styles.wrap, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignSelf: "stretch",
    justifyContent: "center",
  },
});

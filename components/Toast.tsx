import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, Platform } from "react-native";
import { subscribeToast } from "@/lib/toast";

export function Toast() {
  const [message, setMessage] = useState<string | null>(null);
  const [opacity] = useState(new Animated.Value(0));
  const useNativeDriver = Platform.OS !== "web";

  useEffect(() => {
    const unsub = subscribeToast((msg) => {
      setMessage(msg);
      if (msg) {
        Animated.timing(opacity, {
          toValue: 1,
          duration: 150,
          easing: Easing.out(Easing.ease),
          useNativeDriver,
        }).start();
      } else {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.ease),
          useNativeDriver,
        }).start();
      }
    });
    return () => unsub();
  }, [opacity, useNativeDriver]);

  if (!message) return null;

  return (
    <View style={styles.host}>
      <Animated.View style={[styles.toast, { opacity }]}>
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 20,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
    pointerEvents: "none",
  },
  toast: {
    backgroundColor: "#1b8c5f",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    ...Platform.select({
      web: {
        boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.12)",
      },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      },
    }),
  },
  text: {
    color: "#fff",
    fontWeight: "700",
  },
});

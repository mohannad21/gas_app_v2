import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Path } from "react-native-svg";

import { subscribeSuccessPulse } from "@/lib/successPulse";

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function SuccessPulse() {
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;
  const strokeProgress = useRef(new Animated.Value(1)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const useNativeDriver = Platform.OS !== "web";

  useEffect(() => {
    const unsubscribe = subscribeSuccessPulse(() => {
      animationRef.current?.stop();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      setVisible(true);
      opacity.setValue(1);
      scale.setValue(0.6);
      strokeProgress.setValue(1);

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
        // Ignore devices/environments that do not support haptics.
      });

      const checkDraw = Animated.timing(strokeProgress, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
      const pulse = Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.05,
          duration: 220,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 120,
          easing: Easing.out(Easing.ease),
          useNativeDriver,
        }),
      ]);

      animationRef.current = Animated.parallel([checkDraw, pulse]);
      animationRef.current.start();

      hideTimerRef.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.ease),
          useNativeDriver,
        }).start(({ finished }) => {
          if (!finished) return;
          setVisible(false);
        });
      }, 600);
    });

    return () => {
      animationRef.current?.stop();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      unsubscribe();
    };
  }, [opacity, scale, strokeProgress, useNativeDriver]);

  if (!visible) return null;

  const strokeDashoffset = strokeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 28],
  });

  return (
    <View style={styles.host} pointerEvents="none">
      <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
        <View style={styles.iconShell}>
          <Svg width={42} height={42} viewBox="0 0 24 24" fill="none">
            <AnimatedPath
              d="M5 13L9.25 17L19 7.5"
              stroke="#15803d"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="28"
              strokeDashoffset={strokeDashoffset}
            />
          </Svg>
        </View>
        <Text style={styles.title}>Saved</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  card: {
    minWidth: 164,
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    gap: 10,
    ...Platform.select({
      web: {
        boxShadow: "0px 12px 30px rgba(15, 23, 42, 0.18)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOpacity: 0.18,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 12,
      },
    }),
  },
  iconShell: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
  },
});

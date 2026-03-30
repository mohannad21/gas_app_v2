import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

export type RevealShelfKey = "ledger" | "customers" | "company" | null;

export function useRevealShelf() {
  const [revealVisible, setRevealVisible] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [activeShelf, setActiveShelf] = useState<RevealShelfKey>(null);
  const [revealHeight, setRevealHeight] = useState(0);

  // Animated values
  const revealAnim = useRef(new Animated.Value(0)).current;
  const actionsAnim = useRef(new Animated.Value(0)).current;
  const spacerAnim = useRef(new Animated.Value(0)).current;
  const shelfAnim = useRef(new Animated.Value(1)).current;

  // Timers and scroll tracking
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTracker = useRef<{
    lastY: number;
    lastTime: number;
    direction: "up" | "down" | null;
    travel: number;
  }>({
    lastY: 0,
    lastTime: 0,
    direction: null,
    travel: 0,
  });

  // Animate revealAnim when revealVisible changes
  useEffect(() => {
    Animated.timing(revealAnim, {
      toValue: revealVisible ? 1 : 0,
      duration: revealVisible ? 220 : 180,
      useNativeDriver: true,
    }).start();
  }, [revealAnim, revealVisible]);

  // Debounce actionsVisible toggle
  useEffect(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (!revealVisible) {
      setActionsVisible(false);
      return;
    }
    revealTimerRef.current = setTimeout(() => {
      setActionsVisible(true);
    }, 180);
    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [revealVisible]);

  // Animate actionsAnim when actionsVisible changes
  useEffect(() => {
    Animated.timing(actionsAnim, {
      toValue: actionsVisible ? 1 : 0,
      duration: actionsVisible ? 180 : 120,
      useNativeDriver: true,
    }).start();
  }, [actionsAnim, actionsVisible]);

  // Animate spacerAnim when revealHeight or revealVisible changes
  useEffect(() => {
    Animated.timing(spacerAnim, {
      toValue: revealVisible ? revealHeight : 0,
      duration: revealVisible ? 220 : 180,
      useNativeDriver: false,
    }).start();
  }, [revealHeight, revealVisible, spacerAnim]);

  const animateShelfIn = useCallback(() => {
    shelfAnim.setValue(0);
    Animated.timing(shelfAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [shelfAnim]);

  return {
    revealVisible,
    setRevealVisible,
    actionsVisible,
    setActionsVisible,
    activeShelf,
    setActiveShelf,
    revealHeight,
    setRevealHeight,
    // Return animated values and refs needed in JSX
    revealAnim,
    actionsAnim,
    spacerAnim,
    shelfAnim,
    revealTimerRef,
    scrollTracker,
    // Helper
    animateShelfIn,
  };
}

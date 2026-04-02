import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

export function useOrderKeyboardLayout() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [avoidKeyboard, setAvoidKeyboard] = useState(false);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [focusTarget, setFocusTarget] = useState<"amounts" | "payments" | null>(null);
  const [amountsLayoutY, setAmountsLayoutY] = useState<number | null>(null);
  const [totalsLayout, setTotalsLayout] = useState<{ y: number; height: number } | null>(null);

  const effectiveKeyboardHeight = avoidKeyboard ? keyboardHeight : 0;
  const contentBottomPadding = 24;

  // Listen for keyboard show/hide and update keyboardHeight
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return {
    keyboardHeight,
    avoidKeyboard,
    setAvoidKeyboard,
    scrollViewHeight,
    setScrollViewHeight,
    focusTarget,
    setFocusTarget,
    amountsLayoutY,
    setAmountsLayoutY,
    totalsLayout,
    setTotalsLayout,
    effectiveKeyboardHeight,
    contentBottomPadding,
  };
}

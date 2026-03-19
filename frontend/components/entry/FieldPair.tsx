import type { RefObject } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export type FieldStepper = {
  delta: number;
  label: string;
  position?: "left" | "right" | "top" | "bottom";
};

export type RepeatHandlers = {
  onPressIn: () => void;
  onPressOut: () => void;
};

export type FieldCellProps = {
  title: string;
  comment?: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onChangeText?: (text: string) => void;
  editable?: boolean;
  steppers?: FieldStepper[];
  error?: boolean;
  inputRef?: ((node: TextInput | null) => void) | RefObject<TextInput | null>;
  onFocus?: () => void;
  onBlur?: () => void;
  // Optional repeat-press handlers for long-press support.
  // If provided, the button uses onPressIn/onPressOut instead of onPress.
  leftHandlers?: RepeatHandlers;
  rightHandlers?: RepeatHandlers;
  topHandlers?: RepeatHandlers;
  bottomHandlers?: RepeatHandlers;
};

type FieldPairProps = {
  left: FieldCellProps;
  right: FieldCellProps;
};

// ─── FieldCell ────────────────────────────────────────────────────────────
// Internal layout (same for all 4 fields):
//
//   Layer 1 — TITLE (centered text)
//   Layer 2 — DISPLAY (full-width numeric input, fixed height 60px)
//   Layer 3 — HIGH-VALUE row: [−20] [+20]  ← only rendered if top+bottom steppers exist
//   Layer 4 — LOW-VALUE row:  [−5]  [+5]   ← only rendered if left+right steppers have labels
//             OR for cylinders: single row [−] [+]
//
// All buttons in every row are equal squares (50×50).
// flex:1 on each button means they share row width regardless of how many there are.
// The display field never has buttons beside it — thumb never covers the number.

export function FieldCell({
  title,
  comment,
  value,
  onIncrement,
  onDecrement,
  onChangeText,
  editable = true,
  steppers,
  error = false,
  inputRef,
  onFocus,
  onBlur,
  leftHandlers,
  rightHandlers,
  topHandlers,
  bottomHandlers,
}: FieldCellProps) {
  const top    = steppers?.find((s) => s.position === "top")    ?? null;
  const bottom = steppers?.find((s) => s.position === "bottom") ?? null;
  const left   = steppers?.find((s) => s.position === "left")   ?? { delta: -1, label: "−" };
  const right  = steppers?.find((s) => s.position === "right")  ?? { delta:  1, label: "+" };

  const handleLeft   = () => left.delta  === -1 ? onDecrement() : onChangeText?.(String(Math.max(0, value + left.delta)));
  const handleRight  = () => right.delta ===  1 ? onIncrement() : onChangeText?.(String(Math.max(0, value + right.delta)));
  const handleTop    = () => onChangeText?.(String(Math.max(0, value + (top?.delta    ?? 0))));
  const handleBottom = () => onChangeText?.(String(Math.max(0, value + (bottom?.delta ?? 0))));

  // Whether to show the high-value row (−20 / +20).
  // Only shown when both top and bottom steppers are provided (i.e. money fields).
  const showHighValueRow = top !== null && bottom !== null;

  return (
    <View style={styles.fieldCell}>

      {/* Layer 1 — Title */}
      <Text style={styles.fieldCellTitle}>{title}</Text>
      {comment ? <Text style={styles.fieldCellComment}>{comment}</Text> : null}

      {/* Layer 2 — Display field */}
      <TextInput
        style={[styles.fieldCellValue, error ? styles.fieldCellValueError : null, !editable ? styles.fieldCellValueReadOnly : null]}
        value={String(value)}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType="numeric"
        inputMode="numeric"
        ref={inputRef}
        onFocus={onFocus}
        onBlur={onBlur}
      />

      {/* Layer 3 — High-value row: [−20] [+20] — only for money fields with editable=true */}
      {editable && showHighValueRow ? (
        <View style={styles.btnRow}>
          {/* −20 button (bottom stepper = decrease large) */}
          {bottomHandlers ? (
            <Pressable style={styles.btn} onPressIn={bottomHandlers.onPressIn} onPressOut={bottomHandlers.onPressOut}>
              <Text style={styles.btnText}>{bottom!.label}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.btn} onPress={handleBottom}>
              <Text style={styles.btnText}>{bottom!.label}</Text>
            </Pressable>
          )}
          {/* +20 button (top stepper = increase large) */}
          {topHandlers ? (
            <Pressable style={styles.btn} onPressIn={topHandlers.onPressIn} onPressOut={topHandlers.onPressOut}>
              <Text style={styles.btnText}>{top!.label}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.btn} onPress={handleTop}>
              <Text style={styles.btnText}>{top!.label}</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Layer 4 — Low-value row: only shown when editable */}
      {editable ? <View style={styles.btnRow}>
        {leftHandlers ? (
          <Pressable style={styles.btn} onPressIn={leftHandlers.onPressIn} onPressOut={leftHandlers.onPressOut}>
            <Text style={styles.btnText}>{left.label}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.btn} onPress={handleLeft}>
            <Text style={styles.btnText}>{left.label}</Text>
          </Pressable>
        )}
        {rightHandlers ? (
          <Pressable style={styles.btn} onPressIn={rightHandlers.onPressIn} onPressOut={rightHandlers.onPressOut}>
            <Text style={styles.btnText}>{right.label}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.btn} onPress={handleRight}>
            <Text style={styles.btnText}>{right.label}</Text>
          </Pressable>
        )}
      </View> : null}

    </View>
  );
}

export default function FieldPair({ left, right }: FieldPairProps) {
  return (
    <View style={styles.fieldPairRow}>
      <FieldCell {...left} />
      <FieldCell {...right} />
    </View>
  );
}

const styles = StyleSheet.create({
  // The pair row — two equal columns, aligned from the top
  fieldPairRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },

  // Each field card — matches fieldBox in new.tsx exactly
  fieldCell: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    alignItems: "stretch",  // children fill the card width
    gap: 8,                 // uniform vertical spacing between all layers
  },

  // Title — matches fieldName in new.tsx exactly
  fieldCellTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    textAlign: "center",
  },

  // Optional comment below title
  fieldCellComment: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "center",
  },

  // Display field — full card width, fixed height 60px, same across all 4 fields
  fieldCellValue: {
    width: "100%",
    height: 48,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
    color: "#0f172a",
  },
  fieldCellValueError: {
    borderColor: "#b00020",
  },
  fieldCellValueReadOnly: {
    backgroundColor: "#f0f4f8",
    color: "#94a3b8",
  },

  // Button row — children share width equally
  btnRow: {
    flexDirection: "row",
    gap: 8,
  },

  // Every button — 50px tall, flex:1 so they share row width equally
  // 2 buttons → each is ~50% width; 4 buttons → each is ~25% width — all same height
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 10,
    backgroundColor: "#e8eef1",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 15,
    color: "#0a7ea4",
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.4,
  },
});

import type { RefObject } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export type FieldStepper = {
  delta: number;
  label: string;
  position?: "left" | "right" | "top" | "bottom";
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
};

type FieldPairProps = {
  left: FieldCellProps;
  right: FieldCellProps;
};

function StepButton({
  label,
  onPress,
  disabled = false,
  large = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  large?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.stepBtn, large ? styles.stepBtnLarge : null, disabled ? styles.stepBtnDisabled : null]}
    >
      <Text style={[styles.stepBtnText, large ? styles.stepBtnLargeText : null]}>{label}</Text>
    </Pressable>
  );
}

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
}: FieldCellProps) {
  const top = steppers?.find((step) => step.position === "top") ?? null;
  const bottom = steppers?.find((step) => step.position === "bottom") ?? null;
  const left = steppers?.find((step) => step.position === "left") ?? { delta: -1, label: "-1" };
  const right = steppers?.find((step) => step.position === "right") ?? { delta: 1, label: "+1" };

  return (
    <View style={styles.fieldCell}>
      <Text style={styles.fieldCellTitle}>{title}</Text>
      {comment ? <Text style={styles.fieldCellComment}>{comment}</Text> : <View style={styles.commentSpacer} />}
      {top ? <StepButton label={top.label} onPress={() => onChangeText?.(String(Math.max(0, value + top.delta)))} large /> : null}
      <View style={styles.fieldCellStepperRow}>
        <StepButton
          label={left.label}
          onPress={left.delta === -1 ? onDecrement : () => onChangeText?.(String(Math.max(0, value + left.delta)))}
          large={left.position !== undefined}
        />
        <TextInput
          style={[styles.fieldCellValue, error ? styles.fieldCellValueError : null]}
          value={String(value)}
          onChangeText={onChangeText}
          editable={editable}
          keyboardType="numeric"
          inputMode="numeric"
          ref={inputRef}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <StepButton
          label={right.label}
          onPress={right.delta === 1 ? onIncrement : () => onChangeText?.(String(Math.max(0, value + right.delta)))}
          large={right.position !== undefined}
        />
      </View>
      {bottom ? (
        <StepButton label={bottom.label} onPress={() => onChangeText?.(String(Math.max(0, value + bottom.delta)))} large />
      ) : null}
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
  fieldPairRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  fieldCell: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  fieldCellTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 2,
    textAlign: "center",
  },
  fieldCellComment: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 8,
    minHeight: 28,
  },
  commentSpacer: {
    minHeight: 28,
  },
  fieldCellStepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fieldCellValue: {
    width: 64,
    height: 44,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: "#0f172a",
  },
  fieldCellValueError: {
    borderColor: "#b00020",
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnLarge: {
    width: 48,
    paddingHorizontal: 4,
  },
  stepBtnText: {
    fontSize: 16,
    color: "#0a7ea4",
    fontWeight: "700",
  },
  stepBtnLargeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  stepBtnDisabled: {
    opacity: 0.45,
  },
});

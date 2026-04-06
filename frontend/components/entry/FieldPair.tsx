import { useEffect, useRef, type RefObject } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export type FieldStepper = {
  delta: number;
  label: string;
  position?:
    | "extra-top-left"
    | "extra-top-right"
    | "left"
    | "right"
    | "top"
    | "bottom"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";
};

export type FieldCellProps = {
  title: string;
  comment?: string;
  value: number;
  valueMode?: "integer" | "decimal";
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

const REPEAT_INTERVAL_MS = 75;
const DECIMAL_SCALE = 100;

function normalizeValue(value: number, valueMode: "integer" | "decimal") {
  const clamped = Math.max(0, value);
  if (valueMode === "decimal") {
    return Math.round(clamped * DECIMAL_SCALE) / DECIMAL_SCALE;
  }
  return Math.round(clamped);
}

function formatValue(value: number, valueMode: "integer" | "decimal") {
  const normalized = normalizeValue(value, valueMode);
  if (valueMode === "integer") {
    return String(normalized);
  }
  if (Number.isInteger(normalized)) {
    return String(normalized);
  }
  return normalized.toFixed(2).replace(/\.?0+$/, "");
}

function useRepeatablePress(action: () => void) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const actionRef = useRef(action);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  useEffect(
    () => () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    },
    []
  );

  const stopRepeat = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  return {
    delayLongPress: 250,
    onPressIn: () => {
      longPressTriggeredRef.current = false;
    },
    onPress: () => {
      if (longPressTriggeredRef.current) return;
      actionRef.current();
    },
    onLongPress: () => {
      if (longPressTriggeredRef.current) return;
      longPressTriggeredRef.current = true;
      actionRef.current();
      stopRepeat();
      intervalRef.current = setInterval(() => {
        actionRef.current();
      }, REPEAT_INTERVAL_MS);
    },
    onPressOut: stopRepeat,
  };
}

function StepperButton({ label, onPress }: { label: string; onPress: () => void }) {
  const repeatHandlers = useRepeatablePress(onPress);

  return (
    <Pressable style={styles.btn} {...repeatHandlers}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export function FieldCell({
  title,
  comment,
  value,
  valueMode = "integer",
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
  const extraTopLeft = steppers?.find((stepper) => stepper.position === "extra-top-left") ?? null;
  const extraTopRight = steppers?.find((stepper) => stepper.position === "extra-top-right") ?? null;
  const topLeft = steppers?.find((stepper) => stepper.position === "top-left") ?? null;
  const topRight =
    steppers?.find((stepper) => stepper.position === "top-right") ??
    steppers?.find((stepper) => stepper.position === "top") ??
    null;
  const bottomLeft = steppers?.find((stepper) => stepper.position === "bottom-left") ?? null;
  const bottomRight =
    steppers?.find((stepper) => stepper.position === "bottom-right") ??
    steppers?.find((stepper) => stepper.position === "bottom") ??
    null;
  const left = steppers?.find((stepper) => stepper.position === "left") ?? { delta: -1, label: "-" };
  const right = steppers?.find((stepper) => stepper.position === "right") ?? { delta: 1, label: "+" };
  const displayValue = formatValue(value, valueMode);

  const handleLeft = () =>
    left.delta === -1 ? onDecrement() : onChangeText?.(formatValue(value + left.delta, valueMode));
  const handleRight = () =>
    right.delta === 1 ? onIncrement() : onChangeText?.(formatValue(value + right.delta, valueMode));
  const handleTopLeft = () => onChangeText?.(formatValue(value + (topLeft?.delta ?? 0), valueMode));
  const handleTopRight = () => onChangeText?.(formatValue(value + (topRight?.delta ?? 0), valueMode));
  const handleExtraTopLeft = () =>
    onChangeText?.(formatValue(value + (extraTopLeft?.delta ?? 0), valueMode));
  const handleExtraTopRight = () =>
    onChangeText?.(formatValue(value + (extraTopRight?.delta ?? 0), valueMode));
  const handleBottomLeft = () =>
    onChangeText?.(formatValue(value + (bottomLeft?.delta ?? 0), valueMode));
  const handleBottomRight = () =>
    onChangeText?.(formatValue(value + (bottomRight?.delta ?? 0), valueMode));
  const showExtraTopRow = extraTopLeft !== null || extraTopRight !== null;
  const showTopRow = topLeft !== null || topRight !== null;
  const showBottomRow = bottomLeft !== null || bottomRight !== null;

  return (
    <View style={styles.fieldCell}>
      <Text style={styles.fieldCellTitle}>{title}</Text>
      {comment ? <Text style={styles.fieldCellComment}>{comment}</Text> : null}

      <TextInput
        style={[
          styles.fieldCellValue,
          error ? styles.fieldCellValueError : null,
          !editable ? styles.fieldCellValueReadOnly : null,
        ]}
        value={displayValue}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={valueMode === "decimal" ? "decimal-pad" : "number-pad"}
        inputMode={valueMode === "decimal" ? "decimal" : "numeric"}
        returnKeyType="done"
        blurOnSubmit
        ref={inputRef}
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={() => Keyboard.dismiss()}
      />

      {editable && showExtraTopRow ? (
        <View style={styles.btnRow}>
          {extraTopLeft ? (
            <StepperButton label={extraTopLeft.label} onPress={handleExtraTopLeft} />
          ) : (
            <View style={styles.btnSpacer} />
          )}
          {extraTopRight ? (
            <StepperButton label={extraTopRight.label} onPress={handleExtraTopRight} />
          ) : (
            <View style={styles.btnSpacer} />
          )}
        </View>
      ) : null}

      {editable && showTopRow ? (
        <View style={styles.btnRow}>
          {topLeft ? <StepperButton label={topLeft.label} onPress={handleTopLeft} /> : <View style={styles.btnSpacer} />}
          {topRight ? <StepperButton label={topRight.label} onPress={handleTopRight} /> : <View style={styles.btnSpacer} />}
        </View>
      ) : null}

      {editable ? (
        <View style={styles.btnRow}>
          <StepperButton label={left.label} onPress={handleLeft} />
          <StepperButton label={right.label} onPress={handleRight} />
        </View>
      ) : null}

      {editable && showBottomRow ? (
        <View style={styles.btnRow}>
          {bottomLeft ? (
            <StepperButton label={bottomLeft.label} onPress={handleBottomLeft} />
          ) : (
            <View style={styles.btnSpacer} />
          )}
          {bottomRight ? (
            <StepperButton label={bottomRight.label} onPress={handleBottomRight} />
          ) : (
            <View style={styles.btnSpacer} />
          )}
        </View>
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
    alignItems: "flex-start",
    gap: 12,
  },
  fieldCell: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    alignItems: "stretch",
    gap: 8,
  },
  fieldCellTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    textAlign: "center",
  },
  fieldCellComment: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "center",
  },
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
  btnRow: {
    flexDirection: "row",
    gap: 8,
  },
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
  btnSpacer: {
    flex: 1,
  },
});

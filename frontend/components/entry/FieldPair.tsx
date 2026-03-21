import { useEffect, useRef, type RefObject } from "react";
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

const REPEAT_INTERVAL_MS = 75;

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
  const top = steppers?.find((stepper) => stepper.position === "top") ?? null;
  const bottom = steppers?.find((stepper) => stepper.position === "bottom") ?? null;
  const left = steppers?.find((stepper) => stepper.position === "left") ?? { delta: -1, label: "-" };
  const right = steppers?.find((stepper) => stepper.position === "right") ?? { delta: 1, label: "+" };

  const handleLeft = () =>
    left.delta === -1 ? onDecrement() : onChangeText?.(String(Math.max(0, value + left.delta)));
  const handleRight = () =>
    right.delta === 1 ? onIncrement() : onChangeText?.(String(Math.max(0, value + right.delta)));
  const handleTop = () => onChangeText?.(String(Math.max(0, value + (top?.delta ?? 0))));
  const handleBottom = () => onChangeText?.(String(Math.max(0, value + (bottom?.delta ?? 0))));
  const showHighValueRow = top !== null && bottom !== null;

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
        value={String(value)}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType="numeric"
        inputMode="numeric"
        ref={inputRef}
        onFocus={onFocus}
        onBlur={onBlur}
      />

      {editable && showHighValueRow ? (
        <View style={styles.btnRow}>
          <StepperButton label={bottom!.label} onPress={handleBottom} />
          <StepperButton label={top!.label} onPress={handleTop} />
        </View>
      ) : null}

      {editable ? (
        <View style={styles.btnRow}>
          <StepperButton label={left.label} onPress={handleLeft} />
          <StepperButton label={right.label} onPress={handleRight} />
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
});

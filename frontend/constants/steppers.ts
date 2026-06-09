export type FieldStepperPosition =
  | "extra-top-left"
  | "extra-top-right"
  | "extra-bottom-left"
  | "extra-bottom-right"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type FieldStepper = {
  delta: number;
  label: string;
  position?: FieldStepperPosition;
};

export const MONEY_20_5_STEPPERS: FieldStepper[] = [
  { delta: -20, label: "-20", position: "top-left" },
  { delta: 20, label: "+20", position: "top-right" },
  { delta: -5, label: "-5", position: "left" },
  { delta: 5, label: "+5", position: "right" },
];

export const MONEY_100_20_5_STEPPERS: FieldStepper[] = [
  { delta: -100, label: "-100", position: "extra-top-left" },
  { delta: 100, label: "+100", position: "extra-top-right" },
  { delta: -20, label: "-20", position: "top-left" },
  { delta: 20, label: "+20", position: "top-right" },
  { delta: -5, label: "-5", position: "left" },
  { delta: 5, label: "+5", position: "right" },
];

export const MONEY_FINE_DECIMAL_STEPPERS: FieldStepper[] = [
  { delta: -20, label: "-20", position: "extra-top-left" },
  { delta: 20, label: "+20", position: "extra-top-right" },
  { delta: -5, label: "-5", position: "top-left" },
  { delta: 5, label: "+5", position: "top-right" },
  { delta: -1, label: "-1", position: "left" },
  { delta: 1, label: "+1", position: "right" },
  { delta: -0.1, label: "-0.1", position: "bottom-left" },
  { delta: 0.1, label: "+0.1", position: "bottom-right" },
  { delta: -0.01, label: "-0.01", position: "extra-bottom-left" },
  { delta: 0.01, label: "+0.01", position: "extra-bottom-right" },
];

export const PAYMENT_STEPPERS: FieldStepper[] = [
  { delta: -100, label: "-100", position: "extra-top-left" },
  { delta: 100, label: "+100", position: "extra-top-right" },
  { delta: -50, label: "-50", position: "top-left" },
  { delta: 50, label: "+50", position: "top-right" },
  { delta: -10, label: "-10", position: "left" },
  { delta: 10, label: "+10", position: "right" },
  { delta: -5, label: "-5", position: "bottom-left" },
  { delta: 5, label: "+5", position: "bottom-right" },
];

export const COUNT_1_STEPPERS: FieldStepper[] = [
  { delta: -1, label: "-1", position: "left" },
  { delta: 1, label: "+1", position: "right" },
];

export const COMPACT_COUNT_1_STEPPERS: FieldStepper[] = [
  { delta: -1, label: "-", position: "left" },
  { delta: 1, label: "+", position: "right" },
];

export const QTY_5_1_STEPPERS: FieldStepper[] = [
  { delta: -5, label: "-5", position: "top-left" },
  { delta: 5, label: "+5", position: "top-right" },
  { delta: -1, label: "-1", position: "left" },
  { delta: 1, label: "+1", position: "right" },
];

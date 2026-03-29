import React from "react";
import Svg, { Circle, Line, Path, Polygon, Rect } from "react-native-svg";

export type ActivityIconType =
  | "customer_to_dist"
  | "dist_to_customer"
  | "dist_customer_both"
  | "company_to_dist"
  | "dist_to_company"
  | "dist_company_both"
  | "internal_wallet"
  | "internal_bank"
  | "internal_inventory";

type Props = {
  type: ActivityIconType;
  color: string;
  size?: number;
};

export default function ActivityIcon({ type, color, size = 20 }: Props) {
  const w = Math.round(size * 2.2);
  const h = size;
  const cy = h / 2;
  const actorW = h;
  const arrowStart = actorW + 2;
  const arrowEnd = w - actorW - 2;
  const stroke = color;
  const accent = color;
  const sw = 1.8;

  const customerPath = (ox: number, oy: number, s: number) => {
    const r = s * 0.22;
    const hcy = oy + s * 0.33;
    const bx1 = ox + s * 0.18;
    const bx2 = ox + s * 0.82;
    const bcx = ox + s * 0.5;
    const by = oy + s * 0.58;
    const bot = oy + s;
    return (
      <>
        <Circle cx={ox + s / 2} cy={hcy} r={r} stroke={stroke} strokeWidth={sw} fill="none" />
        <Path
          d={`M${bx1},${bot} Q${bx1},${by} ${bcx},${by} Q${bx2},${by} ${bx2},${bot}`}
          stroke={stroke}
          strokeWidth={sw}
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  };

  const distributorPath = (ox: number, oy: number, s: number) => {
    const torsoTop = oy + s * 0.35;
    const torsoBottom = oy + s * 0.92;
    return (
      <>
        <Circle cx={ox + s / 2} cy={oy + s * 0.24} r={s * 0.16} stroke={stroke} strokeWidth={sw} fill="none" />
        <Rect
          x={ox + s * 0.26}
          y={torsoTop}
          width={s * 0.48}
          height={s * 0.34}
          rx={s * 0.08}
          stroke={stroke}
          strokeWidth={sw}
          fill="none"
        />
        <Line x1={ox + s * 0.5} y1={torsoTop + s * 0.34} x2={ox + s * 0.5} y2={torsoBottom} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        <Line x1={ox + s * 0.32} y1={oy + s * 0.5} x2={ox + s * 0.68} y2={oy + s * 0.5} stroke={accent} strokeWidth={sw} strokeLinecap="round" />
      </>
    );
  };

  const factoryPath = (ox: number, oy: number, s: number) => {
    const baseY = oy + s * 0.5;
    return (
      <>
        <Rect x={ox + s * 0.08} y={baseY} width={s * 0.84} height={s * 0.5} stroke={stroke} strokeWidth={sw} fill="none" />
        <Rect x={ox + s * 0.2} y={oy + s * 0.15} width={s * 0.18} height={s * 0.35} stroke={stroke} strokeWidth={sw} fill="none" />
        <Rect x={ox + s * 0.55} y={oy + s * 0.25} width={s * 0.18} height={s * 0.25} stroke={stroke} strokeWidth={sw} fill="none" />
        <Line x1={ox} y1={baseY} x2={ox + s} y2={baseY} stroke={stroke} strokeWidth={sw} />
      </>
    );
  };

  const walletPath = (ox: number, oy: number, s: number) => (
    <>
      <Rect
        x={ox + s * 0.08}
        y={oy + s * 0.25}
        width={s * 0.84}
        height={s * 0.6}
        rx={s * 0.15}
        stroke={stroke}
        strokeWidth={sw}
        fill="none"
      />
      <Rect
        x={ox + s * 0.58}
        y={oy + s * 0.42}
        width={s * 0.22}
        height={s * 0.26}
        rx={s * 0.08}
        stroke={stroke}
        strokeWidth={sw}
        fill={stroke}
      />
    </>
  );

  const bankPath = (ox: number, oy: number, s: number) => (
    <>
      <Polygon
        points={`${ox + s * 0.12},${oy + s * 0.34} ${ox + s * 0.5},${oy + s * 0.08} ${ox + s * 0.88},${oy + s * 0.34}`}
        stroke={stroke}
        strokeWidth={sw}
        fill="none"
      />
      <Line x1={ox + s * 0.2} y1={oy + s * 0.34} x2={ox + s * 0.2} y2={oy + s * 0.82} stroke={stroke} strokeWidth={sw} />
      <Line x1={ox + s * 0.4} y1={oy + s * 0.34} x2={ox + s * 0.4} y2={oy + s * 0.82} stroke={stroke} strokeWidth={sw} />
      <Line x1={ox + s * 0.6} y1={oy + s * 0.34} x2={ox + s * 0.6} y2={oy + s * 0.82} stroke={stroke} strokeWidth={sw} />
      <Line x1={ox + s * 0.8} y1={oy + s * 0.34} x2={ox + s * 0.8} y2={oy + s * 0.82} stroke={stroke} strokeWidth={sw} />
      <Line x1={ox + s * 0.12} y1={oy + s * 0.82} x2={ox + s * 0.88} y2={oy + s * 0.82} stroke={accent} strokeWidth={sw} />
    </>
  );

  const cylinderPath = (ox: number, oy: number, s: number) => (
    <>
      <Path
        d={`M${ox + s * 0.15},${oy + s * 0.35} Q${ox + s * 0.5},${oy + s * 0.2} ${ox + s * 0.85},${oy + s * 0.35}`}
        stroke={stroke}
        strokeWidth={sw}
        fill="none"
      />
      <Rect x={ox + s * 0.15} y={oy + s * 0.35} width={s * 0.7} height={s * 0.45} stroke={stroke} strokeWidth={sw} fill="none" />
      <Path
        d={`M${ox + s * 0.15},${oy + s * 0.8} Q${ox + s * 0.5},${oy + s * 0.95} ${ox + s * 0.85},${oy + s * 0.8}`}
        stroke={stroke}
        strokeWidth={sw}
        fill="none"
      />
    </>
  );

  const arrowTipSize = 5;

  const arrowRight = (y: number, x1: number, x2: number, thick = true) => (
    <>
      <Line
        x1={x1}
        y1={y}
        x2={x2 - arrowTipSize}
        y2={y}
        stroke={stroke}
        strokeWidth={thick ? sw * 1.2 : sw * 0.8}
        strokeLinecap="round"
      />
      <Polygon
        points={`${x2 - arrowTipSize},${y - arrowTipSize * 0.7} ${x2},${y} ${x2 - arrowTipSize},${y + arrowTipSize * 0.7}`}
        fill={stroke}
      />
    </>
  );

  const arrowLeft = (y: number, x1: number, x2: number, thick = true) => (
    <>
      <Line
        x1={x1 + arrowTipSize}
        y1={y}
        x2={x2}
        y2={y}
        stroke={stroke}
        strokeWidth={thick ? sw * 1.2 : sw * 0.8}
        strokeLinecap="round"
      />
      <Polygon
        points={`${x1 + arrowTipSize},${y - arrowTipSize * 0.7} ${x1},${y} ${x1 + arrowTipSize},${y + arrowTipSize * 0.7}`}
        fill={stroke}
      />
    </>
  );

  let leftActor: React.ReactNode;
  let rightActor: React.ReactNode;
  let arrow: React.ReactNode;

  const rax = arrowStart;
  const rbx = arrowEnd;
  const primaryY = cy - 2;
  const secondaryY = cy + 3;

  switch (type) {
    case "customer_to_dist":
      leftActor = customerPath(0, 0, actorW);
      rightActor = distributorPath(w - actorW, 0, actorW);
      arrow = arrowRight(cy, rax, rbx);
      break;

    case "dist_to_customer":
      leftActor = distributorPath(0, 0, actorW);
      rightActor = customerPath(w - actorW, 0, actorW);
      arrow = arrowLeft(cy, rax, rbx);
      break;

    case "dist_customer_both":
      leftActor = distributorPath(0, 0, actorW);
      rightActor = customerPath(w - actorW, 0, actorW);
      arrow = (
        <>
          {arrowLeft(primaryY, rax, rbx, true)}
          {arrowRight(secondaryY, rax, rbx, false)}
        </>
      );
      break;

    case "company_to_dist":
      leftActor = factoryPath(0, 0, actorW);
      rightActor = distributorPath(w - actorW, 0, actorW);
      arrow = arrowRight(cy, rax, rbx);
      break;

    case "dist_to_company":
      leftActor = distributorPath(0, 0, actorW);
      rightActor = factoryPath(w - actorW, 0, actorW);
      arrow = arrowRight(cy, rax, rbx);
      break;

    case "dist_company_both":
      leftActor = factoryPath(0, 0, actorW);
      rightActor = distributorPath(w - actorW, 0, actorW);
      arrow = (
        <>
          {arrowRight(primaryY, rax, rbx, true)}
          {arrowLeft(secondaryY, rax, rbx, false)}
        </>
      );
      break;

    case "internal_wallet":
      leftActor = walletPath(0, 0, actorW);
      rightActor = walletPath(w - actorW, 0, actorW);
      arrow = arrowRight(cy, rax, rbx);
      break;

    case "internal_bank":
      leftActor = bankPath(0, 0, actorW);
      rightActor = walletPath(w - actorW, 0, actorW);
      arrow = arrowRight(cy, rax, rbx);
      break;

    case "internal_inventory":
    default:
      leftActor = cylinderPath(0, 0, actorW);
      rightActor = cylinderPath(w - actorW, 0, actorW);
      arrow = arrowRight(cy, rax, rbx);
      break;
  }

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {leftActor}
      {arrow}
      {rightActor}
    </Svg>
  );
}

export type IoniconName = React.ComponentProps<typeof import("@expo/vector-icons").Ionicons>["name"];

export function getActivityIcon(
  eventType: string,
  orderMode: string | null | undefined,
  moneyDirection: string | null | undefined
): IoniconName {
  if (eventType === "order") {
    if (orderMode === "replacement") return "swap-horizontal-outline";
    if (orderMode === "sell_iron") return "arrow-up-circle-outline";
    if (orderMode === "buy_iron") return "arrow-down-circle-outline";
    return "swap-horizontal-outline";
  }
  if (eventType === "collection_money") return "cash-outline";
  if (eventType === "collection_payout") return "cash-outline";
  if (eventType === "collection_empty") return "refresh-outline";
  if (eventType === "customer_adjust") return "build-outline";
  if (eventType === "refill") return "reload-outline";
  if (eventType === "company_buy_iron") return "download-outline";
  if (eventType === "company_payment") {
    if (moneyDirection === "in" || moneyDirection === "received") return "arrow-down-circle-outline";
    return "arrow-up-circle-outline";
  }
  if (eventType === "company_adjustment") return "build-outline";
  if (eventType === "expense") return "receipt-outline";
  if (eventType === "bank_deposit") return "card-outline";
  if (eventType === "cash_adjust") return "wallet-outline";
  if (eventType === "adjust") return "cube-outline";
  if (eventType === "init") return "flag-outline";
  return "ellipse-outline";
}

export function iconTypeForEvent(eventType: string, orderMode?: string | null): ActivityIconType {
  if (eventType === "order") {
    if (orderMode === "buy_iron") return "customer_to_dist";
    return "dist_customer_both";
  }
  if (eventType === "collection_money") return "customer_to_dist";
  if (eventType === "collection_payout") return "dist_to_customer";
  if (eventType === "collection_empty") return "customer_to_dist";
  if (eventType === "customer_adjust") return "dist_to_customer";

  if (eventType === "refill") return "dist_company_both";
  if (eventType === "company_buy_iron") return "company_to_dist";
  if (eventType === "company_payment") return "dist_to_company";
  if (eventType === "company_adjustment") return "dist_to_company";

  if (eventType === "expense") return "internal_wallet";
  if (eventType === "bank_deposit") return "internal_bank";
  if (eventType === "cash_adjust") return "internal_wallet";
  if (eventType === "adjust") return "internal_inventory";
  if (eventType === "init") return "internal_inventory";

  return "internal_wallet";
}

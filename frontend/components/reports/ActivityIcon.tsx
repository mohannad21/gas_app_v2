import React from "react";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { ActivityKindMeta, IconSpec } from "@/lib/activityKindMeta";
import { ACTIVITY_KIND_META, normalizeEventType } from "@/lib/activityKindMeta";

type Props = {
  eventType: string;
  orderMode?: string | null;
  moneyDirection?: string | null;
  color: string;
  size?: number;
};

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type IconPalette = {
  foreground: string;
};

const VIEWBOX_SIZE = 22;
const STROKE_WIDTH = 1.15;
const THIN_STROKE_WIDTH = 1.15;
const SYMBOL: Box = { x: 3, y: 3, width: 16, height: 16 };

const vectorProps = {
  strokeWidth: STROKE_WIDTH,
  fill: "none",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const arrowProps = {
  strokeWidth: THIN_STROKE_WIDTH,
  fill: "none",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const cylinderProps = {
  strokeWidth: THIN_STROKE_WIDTH,
  fill: "none",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export default function ActivityIcon({
  eventType,
  orderMode,
  moneyDirection,
  color,
  size = 22,
}: Props) {
  const kind = normalizeEventType(eventType, {
    order_mode: orderMode ?? undefined,
    money_direction: moneyDirection ?? undefined,
  });
  const meta = kind ? ACTIVITY_KIND_META[kind] : null;
  const spec: IconSpec = meta ? meta.icon : { arrow: "none", symbol: null };

  return renderIconSpec(spec, getIconPalette(meta, color), size);
}

function getIconPalette(meta: ActivityKindMeta | null, fallbackColor: string): IconPalette {
  if (!meta) return { foreground: fallbackColor };
  if (meta.filterGroup === "customer") return { foreground: "#0369a1" };
  if (meta.filterGroup === "company") return { foreground: "#c2410c" };
  return { foreground: "#0f766e" };
}

function renderIconSpec(spec: IconSpec, palette: IconPalette, size: number) {
  return (
    <Svg testID="activity-icon" width={size} height={size} viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}>
      {renderSymbol(spec.symbol, SYMBOL, palette.foreground, spec.arrow)}
      {renderContainedArrow(spec.arrow, palette.foreground, spec.symbol === null)}
    </Svg>
  );
}

function renderContainedArrow(arrow: IconSpec["arrow"], color: string, isPrimary: boolean) {
  if (arrow === "none") return null;

  const center = isPrimary ? 11 : 16.4;
  const side = isPrimary ? 11 : 6.4;
  const start = 5.2;
  const end = 16.8;
  const horizontalStart = isPrimary ? 5.2 : 6.5;
  const horizontalEnd = isPrimary ? 16.8 : 15.5;
  const verticalStart = isPrimary ? 5.2 : 4.4;
  const verticalEnd = isPrimary ? 16.8 : 17.8;

  switch (arrow) {
    case "in-h":
      return <Path d={`M${horizontalStart},${center} H${horizontalEnd} M${horizontalEnd - 2},${center - 2} L${horizontalEnd},${center} L${horizontalEnd - 2},${center + 2}`} stroke={color} {...arrowProps} />;
    case "out-h":
      return <Path d={`M${horizontalEnd},${center} H${horizontalStart} M${horizontalStart + 2},${center - 2} L${horizontalStart},${center} L${horizontalStart + 2},${center + 2}`} stroke={color} {...arrowProps} />;
    case "swap-h":
      return (
        <Path
          d={`M${start + 1.6},${center} H${end - 1.6} M${start + 2},${center - 2} L${start},${center} L${start + 2},${center + 2} M${end - 2},${center - 2} L${end},${center} L${end - 2},${center + 2}`}
          stroke={color}
          {...arrowProps}
        />
      );
    case "in-v":
      return <Path d={`M${side},${verticalStart} V${verticalEnd} M${side - 2},${verticalEnd - 2} L${side},${verticalEnd} L${side + 2},${verticalEnd - 2}`} stroke={color} {...arrowProps} />;
    case "out-v":
      return <Path d={`M${side},${verticalEnd} V${verticalStart} M${side - 2},${verticalStart + 2} L${side},${verticalStart} L${side + 2},${verticalStart + 2}`} stroke={color} {...arrowProps} />;
    case "swap-v":
      return (
        <Path
          d={`M${center},${start + 1.6} V${end - 1.6} M${center - 2},${start + 2} L${center},${start} L${center + 2},${start + 2} M${center - 2},${end - 2} L${center},${end} L${center + 2},${end - 2}`}
          stroke={color}
          {...arrowProps}
        />
      );
    default:
      return null;
  }
}

function renderSymbol(symbol: IconSpec["symbol"], box: Box, color: string, arrow: IconSpec["arrow"]) {
  if (!symbol) return null;

  const symbolBox =
    arrow === "none" || arrow === "swap-h" || arrow === "swap-v"
      ? box
      : arrow === "in-v" || arrow === "out-v"
        ? { x: 10.2, y: 3, width: 10.2, height: 16 }
        : { x: 4.5, y: 1.1, width: 13, height: 12.2 };
  const cylinderBox =
    arrow === "none" || arrow === "swap-h" || arrow === "swap-v"
      ? { x: 6.6, y: 1.6, width: 8.8, height: 18 }
      : arrow === "in-v" || arrow === "out-v"
        ? { x: 12, y: 2.6, width: 7.8, height: 16.2 }
        : { x: 7.1, y: 0.9, width: 7.8, height: 13.5 };

  switch (symbol) {
    case "money":
      return renderMoney(symbolBox, color);
    case "full-cyl":
      return renderCylinder(cylinderBox, color, true);
    case "empty-cyl":
      return renderCylinder(cylinderBox, color, false);
    case "receipt":
      return renderReceipt(symbolBox, color);
    case "wallet":
      return renderWallet(symbolBox, color);
    case "cube":
      return renderCube(symbolBox, color);
    case "edit":
      return renderEdit(symbolBox, color);
    case "bank-to-wallet":
      return renderBankWallet(symbolBox, color, "bank-to-wallet");
    case "wallet-to-bank":
      return renderBankWallet(symbolBox, color, "wallet-to-bank");
    default:
      return null;
  }
}

function renderMoney(box: Box, color: string) {
  const x = box.x + 0.8;
  const y = box.y + 1.8;
  const w = box.width - 1.6;
  const h = box.height - 3.6;

  return (
    <>
      <Rect x={x} y={y} width={w} height={h} rx={1.8} stroke={color} {...vectorProps} />
      <SvgText
        x={x + w / 2}
        y={y + h / 2}
        fill={color}
        fontSize={Math.min(w, h) * 0.72}
        fontWeight="700"
        alignmentBaseline="middle"
        textAnchor="middle"
      >
        $
      </SvgText>
    </>
  );
}

function renderCylinder(box: Box, color: string, isFull: boolean) {
  const x = box.x;
  const y = box.y;
  const w = box.width;
  const h = box.height;
  const sx = (value: number) => x + (value / 100) * w;
  const sy = (value: number) => y + (value / 200) * h;
  const sw = (value: number) => (value / 100) * w;
  const sh = (value: number) => (value / 200) * h;

  return (
    <>
      {isFull ? (
        <Rect x={sx(15)} y={sy(50)} width={sw(70)} height={sh(130)} rx={sw(10)} fill={color} fillOpacity={0.24} />
      ) : null}
      <Rect x={sx(15)} y={sy(50)} width={sw(70)} height={sh(130)} rx={sw(10)} stroke={color} {...cylinderProps} />
      <Line x1={sx(15)} y1={sy(115)} x2={sx(85)} y2={sy(115)} stroke={color} {...cylinderProps} />
      <Path
        d={`M${sx(30)},${sy(50)} V${sy(35)} C${sx(30)},${sy(30)} ${sx(35)},${sy(25)} ${sx(40)},${sy(25)} H${sx(60)} C${sx(65)},${sy(25)} ${sx(70)},${sy(30)} ${sx(70)},${sy(35)} V${sy(50)}`}
        stroke={color}
        {...cylinderProps}
      />
      <Rect x={sx(25)} y={sy(180)} width={sw(50)} height={sh(10)} rx={sw(2)} fill={color} />
    </>
  );
}

function renderReceipt(box: Box, color: string) {
  const x = box.x + 3.2;
  const y = box.y + 1.4;
  const w = box.width - 6.4;
  const h = box.height - 2.4;
  const bottom = y + h;

  return (
    <>
      <Path
        d={[
          `M${x},${y + 1.4}`,
          `Q${x},${y} ${x + 1.4},${y}`,
          `H${x + w - 1.4}`,
          `Q${x + w},${y} ${x + w},${y + 1.4}`,
          `V${bottom - 1.8}`,
          `L${x + w - 1.2},${bottom - 0.5}`,
          `L${x + w - 2.4},${bottom - 1.8}`,
          `L${x + w - 3.6},${bottom - 0.5}`,
          `L${x + w - 4.8},${bottom - 1.8}`,
          `H${x}`,
          `V${y + 1.4}`,
        ].join(" ")}
        stroke={color}
        {...vectorProps}
      />
      <Line x1={x + 1.8} y1={y + 3.3} x2={x + w - 1.8} y2={y + 3.3} stroke={color} {...vectorProps} />
      <Line x1={x + 1.8} y1={y + 5.5} x2={x + w - 2.8} y2={y + 5.5} stroke={color} {...vectorProps} />
    </>
  );
}

function renderWallet(box: Box, color: string) {
  const x = box.x + 0.5;
  const y = box.y + 2.8;
  const w = box.width - 1;
  const h = box.height - 4.6;

  return (
    <>
      <Path d={`M${x + 1.5},${y + 1} H${x + w - 2.1} Q${x + w},${y + 1} ${x + w},${y + 3}`} stroke={color} {...vectorProps} />
      <Rect x={x} y={y + 1.5} width={w} height={h} rx={2} stroke={color} {...vectorProps} />
      <Circle cx={x + w - 2.3} cy={y + h / 2 + 1.5} r={0.7} stroke={color} {...vectorProps} />
    </>
  );
}

function renderCube(box: Box, color: string) {
  const x = box.x + 0.3;
  const y = box.y + 0.5;
  const w = box.width - 0.6;
  const h = box.height - 0.6;

  return (
    <>
      <Path
        d={`M${x + 1.2},${y + 4} L${x + w / 2},${y + 1.2} L${x + w - 1.2},${y + 4} L${x + w / 2},${y + 6.8} Z`}
        stroke={color}
        {...vectorProps}
      />
      <Path d={`M${x + 1.2},${y + 4} V${y + 7.7} L${x + w / 2},${y + h - 1} V${y + 6.8}`} stroke={color} {...vectorProps} />
      <Path d={`M${x + w - 1.2},${y + 4} V${y + 7.7} L${x + w / 2},${y + h - 1}`} stroke={color} {...vectorProps} />
    </>
  );
}

function renderEdit(box: Box, color: string) {
  const x = box.x + 1.5;
  const y = box.y + 2.4;
  const w = box.width - 3;

  return (
    <>
      <Line x1={x} y1={y + 2} x2={x + w} y2={y + 2} stroke={color} {...vectorProps} />
      <Circle cx={x + w * 0.35} cy={y + 2} r={1.15} stroke={color} {...vectorProps} />
      <Line x1={x} y1={y + 6} x2={x + w} y2={y + 6} stroke={color} {...vectorProps} />
      <Circle cx={x + w * 0.68} cy={y + 6} r={1.15} stroke={color} {...vectorProps} />
      <Line x1={x} y1={y + 10} x2={x + w} y2={y + 10} stroke={color} {...vectorProps} />
      <Circle cx={x + w * 0.48} cy={y + 10} r={1.15} stroke={color} {...vectorProps} />
    </>
  );
}

function renderBankWallet(box: Box, color: string, direction: "bank-to-wallet" | "wallet-to-bank") {
  const left = { x: box.x + 0.5, y: box.y + 3.2, width: 6.2, height: 9.8 };
  const right = { x: box.x + box.width - 6.7, y: box.y + 3.2, width: 6.2, height: 9.8 };
  const first = direction === "bank-to-wallet" ? left : right;
  const second = direction === "bank-to-wallet" ? right : left;

  return (
    <>
      {direction === "bank-to-wallet" ? renderMiniBank(first, color) : renderMiniWallet(first, color)}
      {direction === "bank-to-wallet" ? renderMiniWallet(second, color) : renderMiniBank(second, color)}
      <Path d={`M${box.x + 7.6},${box.y + 8.2} H${box.x + 8.9} M${box.x + 10.3},${box.y + 8.2} H${box.x + 11.6}`} stroke={color} {...vectorProps} />
    </>
  );
}

function renderMiniBank(box: Box, color: string) {
  const x = box.x;
  const y = box.y;
  const w = box.width;
  const h = box.height;

  return (
    <>
      <Path d={`M${x + 0.3},${y + 3} L${x + w / 2},${y + 0.8} L${x + w - 0.3},${y + 3}`} stroke={color} {...vectorProps} />
      <Line x1={x + 1.1} y1={y + 4} x2={x + 1.1} y2={y + h - 1.5} stroke={color} {...vectorProps} />
      <Line x1={x + w / 2} y1={y + 4} x2={x + w / 2} y2={y + h - 1.5} stroke={color} {...vectorProps} />
      <Line x1={x + w - 1.1} y1={y + 4} x2={x + w - 1.1} y2={y + h - 1.5} stroke={color} {...vectorProps} />
      <Line x1={x + 0.5} y1={y + h - 0.7} x2={x + w - 0.5} y2={y + h - 0.7} stroke={color} {...vectorProps} />
    </>
  );
}

function renderMiniWallet(box: Box, color: string) {
  const x = box.x;
  const y = box.y;
  const w = box.width;
  const h = box.height;

  return (
    <>
      <Rect x={x + 0.3} y={y + 3.4} width={w - 0.6} height={h - 4.2} rx={1.4} stroke={color} {...vectorProps} />
      <Line x1={x + 1.4} y1={y + 2.5} x2={x + w - 1.5} y2={y + 2.5} stroke={color} {...vectorProps} />
      <Circle cx={x + w - 1.7} cy={y + h / 2 + 1.2} r={0.55} stroke={color} {...vectorProps} />
    </>
  );
}

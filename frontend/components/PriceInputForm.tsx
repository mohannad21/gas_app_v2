import BigBox from "@/components/entry/BigBox";
import FieldPair from "@/components/entry/FieldPair";
import { type FieldStepper } from "@/components/entry/FieldPair";

export type PriceFormValues = {
  sell12: number;
  sell48: number;
  buy12: number;
  buy48: number;
  buyIron12: number;
  buyIron48: number;
  companyIron12: number;
  companyIron48: number;
  sellIron12: number;
  sellIron48: number;
};

type Props = {
  values: PriceFormValues;
  onChange: (key: keyof PriceFormValues, value: number) => void;
  disabled?: boolean;
};

const SELL_STEPPERS: FieldStepper[] = [
  { delta: -5, label: "-5", position: "bottom" },
  { delta: 5, label: "+5", position: "top" },
];

const BUY_STEPPERS: FieldStepper[] = [
  { delta: -0.01, label: "-0.01", position: "bottom" },
  { delta: 0.01, label: "+0.01", position: "top" },
];

function makeCell(
  key: keyof PriceFormValues,
  title: string,
  values: PriceFormValues,
  onChange: Props["onChange"],
  steppers: FieldStepper[],
  disabled: boolean
) {
  const value = values[key];
  return {
    title,
    value,
    onIncrement: () => onChange(key, value + 1),
    onDecrement: () => onChange(key, Math.max(0, value - 1)),
    onChangeText: (text: string) => {
      const parsed = parseFloat(text);
      onChange(key, isNaN(parsed) ? 0 : Math.max(0, parsed));
    },
    steppers,
    editable: !disabled,
  };
}

export default function PriceInputForm({ values, onChange, disabled = false }: Props) {
  return (
    <>
      <BigBox title="Gas Selling Prices" defaultExpanded>
        <FieldPair
          left={makeCell("sell12", "12kg", values, onChange, SELL_STEPPERS, disabled)}
          right={makeCell("sell48", "48kg", values, onChange, SELL_STEPPERS, disabled)}
        />
      </BigBox>

      <BigBox title="Gas Buying Prices" defaultExpanded>
        <FieldPair
          left={makeCell("buy12", "12kg", values, onChange, BUY_STEPPERS, disabled)}
          right={makeCell("buy48", "48kg", values, onChange, BUY_STEPPERS, disabled)}
        />
      </BigBox>

      <BigBox title="Iron Buy - Customer">
        <FieldPair
          left={makeCell("buyIron12", "12kg", values, onChange, SELL_STEPPERS, disabled)}
          right={makeCell("buyIron48", "48kg", values, onChange, SELL_STEPPERS, disabled)}
        />
      </BigBox>

      <BigBox title="Iron Buy - Company">
        <FieldPair
          left={makeCell("companyIron12", "12kg", values, onChange, BUY_STEPPERS, disabled)}
          right={makeCell("companyIron48", "48kg", values, onChange, BUY_STEPPERS, disabled)}
        />
      </BigBox>

      <BigBox title="Iron Sell - Customer">
        <FieldPair
          left={makeCell("sellIron12", "12kg", values, onChange, SELL_STEPPERS, disabled)}
          right={makeCell("sellIron48", "48kg", values, onChange, SELL_STEPPERS, disabled)}
        />
      </BigBox>
    </>
  );
}

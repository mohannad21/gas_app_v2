import BigBox from "@/components/entry/BigBox";
import FieldPair from "@/components/entry/FieldPair";
import { type FieldStepper } from "@/components/entry/FieldPair";
import { AppColors } from "@/constants/colors";
import { PRICE_SECTIONS, type PriceFormValues, type PriceSectionKey } from "@/constants/prices";
import { StyleSheet, View } from "react-native";

export type { PriceFormValues } from "@/constants/prices";

type Props = {
  sectionKey?: PriceSectionKey;
  accentColor?: string;
  values: PriceFormValues;
  previousValues?: PriceFormValues;
  onChange: (key: keyof PriceFormValues, value: number) => void;
  disabled?: boolean;
};

const SELL_STEPPERS: FieldStepper[] = [
  { delta: -10, label: "-10", position: "top-left" },
  { delta: 10, label: "+10", position: "top-right" },
  { delta: -1, label: "-1", position: "left" },
  { delta: 1, label: "+1", position: "right" },
];

const BUY_STEPPERS: FieldStepper[] = [
  { delta: -10, label: "-10", position: "top-left" },
  { delta: 10, label: "+10", position: "top-right" },
  { delta: -1, label: "-1", position: "left" },
  { delta: 1, label: "+1", position: "right" },
  { delta: -0.01, label: "-0.01", position: "bottom-left" },
  { delta: 0.01, label: "+0.01", position: "bottom-right" },
];

function makeCell(
  key: keyof PriceFormValues,
  title: string,
  values: PriceFormValues,
  onChange: Props["onChange"],
  steppers: FieldStepper[],
  disabled: boolean,
  previousValues?: PriceFormValues
) {
  const value = values[key];
  return {
    title,
    comment: previousValues ? `Old ${previousValues[key] > 0 ? previousValues[key] : "-"}` : undefined,
    value,
    valueMode: "decimal" as const,
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

export default function PriceInputForm({
  sectionKey,
  accentColor,
  values,
  previousValues,
  onChange,
  disabled = false,
}: Props) {
  const renderFields = (key: PriceSectionKey) => {
    const section = PRICE_SECTIONS[key];
    const steppers = section.stepperPreset === "buy" ? BUY_STEPPERS : SELL_STEPPERS;

    return (
      <FieldPair
        left={makeCell(section.leftKey, "12kg", values, onChange, steppers, disabled, previousValues)}
        right={makeCell(section.rightKey, "48kg", values, onChange, steppers, disabled, previousValues)}
      />
    );
  };

  const renderLegacySection = (key: PriceSectionKey, title: string, defaultExpanded: boolean) => (
    <BigBox title={title} defaultExpanded={defaultExpanded}>
      {renderFields(key)}
    </BigBox>
  );

  if (sectionKey) {
    return (
      <View
        style={[
          styles.selectedSection,
          accentColor ? { borderLeftColor: accentColor, borderLeftWidth: 4 } : null,
        ]}
        testID={`price-form-section-${sectionKey}`}
      >
        {renderFields(sectionKey)}
      </View>
    );
  }

  return (
    <>
      {renderLegacySection("gasSellToCustomer", PRICE_SECTIONS.gasSellToCustomer.legacyTitle, true)}
      {renderLegacySection("gasBuyFromCompany", PRICE_SECTIONS.gasBuyFromCompany.legacyTitle, true)}
      {renderLegacySection("ironBuyFromCustomer", PRICE_SECTIONS.ironBuyFromCustomer.legacyTitle, false)}
      {renderLegacySection("ironBuyFromCompany", PRICE_SECTIONS.ironBuyFromCompany.legacyTitle, false)}
      {renderLegacySection("ironSellToCustomer", PRICE_SECTIONS.ironSellToCustomer.legacyTitle, false)}
    </>
  );
}

const styles = StyleSheet.create({
  selectedSection: {
    backgroundColor: AppColors.surface.card,
    borderColor: AppColors.border.default,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
});

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { useInitializeSystem, useSystemSettings } from "@/hooks/useSystemSettings";

type CompanyBalance = {
  direction: "owes_me" | "i_owe" | "balanced";
  quantity: string;
};

type CompanyBalanceState = {
  "12kg": CompanyBalance;
  "48kg": CompanyBalance;
};

type WizardState = {
  sell12: string;
  sell48: string;
  buy12: string;
  buy48: string;
  sellIron12: string;
  sellIron48: string;
  buyIron12: string;
  buyIron48: string;
  cashStart: string;
  companyPayMoney: string;
  inventoryFull12: string;
  inventoryFull48: string;
  inventoryEmpty12: string;
  inventoryEmpty48: string;
};

type StepField = {
  key: keyof WizardState;
  label: string;
  placeholder: string;
  gas?: "12kg" | "48kg";
  unit?: "money" | "count";
};

type StepConfig = {
  id: string;
  title: string;
  question: string;
  explanation: string;
  type: "inputs" | "yesno" | "review" | "netBalance";
  arrow?: "up" | "down";
  fields?: StepField[];
  autoAdvance?: boolean;
};

const toNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
};

const initialState: WizardState = {
  sell12: "",
  sell48: "",
  buy12: "",
  buy48: "",
  sellIron12: "",
  sellIron48: "",
  buyIron12: "",
  buyIron48: "",
  cashStart: "",
  companyPayMoney: "",
  inventoryFull12: "",
  inventoryFull48: "",
  inventoryEmpty12: "",
  inventoryEmpty48: "",
};

const initialCompanyBalance: CompanyBalanceState = {
  "12kg": { direction: "balanced", quantity: "" },
  "48kg": { direction: "balanced", quantity: "" },
};

export default function WelcomeScreen() {
  const settingsQuery = useSystemSettings();
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<WizardState>(initialState);
  const [yesNo, setYesNo] = useState<Record<string, boolean | null>>({});
  const [companyBalance, setCompanyBalance] = useState<CompanyBalanceState>(initialCompanyBalance);
  const initSystem = useInitializeSystem({ showToast: true });

  useEffect(() => {
    if (settingsQuery.data?.is_setup_completed) {
      router.replace("/(tabs)/reports");
    }
  }, [settingsQuery.data?.is_setup_completed]);

  const steps: StepConfig[] = useMemo(
    () => [
      {
        id: "prices",
        title: "Prices",
        question: "What do you charge for a 12kg and 48kg cylinder?",
        explanation: "You can change these later from Settings.",
        type: "inputs",
        fields: [
          { key: "sell12", label: "12kg selling price", placeholder: "0", gas: "12kg", unit: "money" },
          { key: "sell48", label: "48kg selling price", placeholder: "0", gas: "48kg", unit: "money" },
          { key: "buy12", label: "12kg buying price", placeholder: "0", gas: "12kg", unit: "money" },
          { key: "buy48", label: "48kg buying price", placeholder: "0", gas: "48kg", unit: "money" },
          { key: "sellIron12", label: "12kg iron sell price", placeholder: "0", gas: "12kg", unit: "money" },
          { key: "sellIron48", label: "48kg iron sell price", placeholder: "0", gas: "48kg", unit: "money" },
          { key: "buyIron12", label: "12kg iron buy price", placeholder: "0", gas: "12kg", unit: "money" },
          { key: "buyIron48", label: "48kg iron buy price", placeholder: "0", gas: "48kg", unit: "money" },
        ],
      },
      {
        id: "company_pay_money",
        title: "Company",
        question: "Do you have to pay the company money?",
        explanation: "Money you collected from orders but have not handed over to the plant yet.",
        type: "yesno",
        arrow: "down",
        fields: [{ key: "companyPayMoney", label: "Amount to pay (₪)", placeholder: "0", unit: "money" }],
      },
      {
        id: "company_cylinder_balance",
        title: "Company Cylinders",
        question: "What is your current cylinder balance with the company?",
        explanation: "Record who owes who cylinders. For example, if the company owes you 5 fulls, select 'Company Owes Me' and enter 5.",
        type: "netBalance",
      },
      {
        id: "customer_owe_money",
        title: "Customers",
        question: "",
        explanation: "",
        type: "inputs",
        fields: [],
        autoAdvance: true,
      },
      {
        id: "customer_credit_money",
        title: "Customers",
        question: "",
        explanation: "",
        type: "inputs",
        fields: [],
        autoAdvance: true,
      },
      {
        id: "customer_owe_empty",
        title: "Customers",
        question: "",
        explanation: "",
        type: "inputs",
        fields: [],
        autoAdvance: true,
      },
      {
        id: "customer_return_full",
        title: "Customers",
        question: "",
        explanation: "",
        type: "inputs",
        fields: [],
        autoAdvance: true,
      },
      {
        id: "inventory_full",
        title: "Inventory",
        question: "How many full tanks do you have in total?",
        explanation: "Everything combined: what is on the truck and what is in storage.",
        type: "inputs",
        fields: [
          { key: "inventoryFull12", label: "12kg full", placeholder: "0", gas: "12kg", unit: "count" },
          { key: "inventoryFull48", label: "48kg full", placeholder: "0", gas: "48kg", unit: "count" },
        ],
      },
      {
        id: "inventory_empty",
        title: "Inventory",
        question: "How many empty tanks do you have in total?",
        explanation: "All spare empties that are not currently at a customer's house.",
        type: "inputs",
        fields: [
          { key: "inventoryEmpty12", label: "12kg empty", placeholder: "0", gas: "12kg", unit: "count" },
          { key: "inventoryEmpty48", label: "48kg empty", placeholder: "0", gas: "48kg", unit: "count" },
        ],
      },
      {
        id: "cash_start",
        title: "Cash",
        question: "How much money is in your pocket/register to start the day?",
        explanation: "This is your physical cash on hand right now.",
        type: "inputs",
        fields: [{ key: "cashStart", label: "Starting cash (₪)", placeholder: "0", unit: "money" }],
      },
      {
        id: "review",
        title: "Review",
        question: "Review your opening balances",
        explanation: "Confirm these values to start using the app.",
        type: "review",
      },
    ],
    []
  );

  const totalSteps = steps.length;
  const step = steps[stepIndex];

  const progress = (stepIndex + 1) / totalSteps;

  useEffect(() => {
    if (!step?.autoAdvance) return;
    const id = setTimeout(() => {
      setStepIndex((prev) => Math.min(totalSteps - 1, prev + 1));
    }, 0);
    return () => clearTimeout(id);
  }, [step, totalSteps]);

  const updateField = (key: keyof WizardState, value: string) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const goNext = () => setStepIndex((prev) => Math.min(totalSteps - 1, prev + 1));
  const goBack = () => setStepIndex((prev) => Math.max(0, prev - 1));

  const handleYes = () => {
    setYesNo((prev) => ({ ...prev, [step.id]: true }));
  };

  const handleNo = () => {
    setYesNo((prev) => ({ ...prev, [step.id]: false }));
    // If the user says no to owing money, clear the field.
    if (step.id === "company_pay_money") {
      setState((prev) => ({ ...prev, companyPayMoney: "" }));
    }
    goNext();
  };

  const companyBalances = useMemo(() => {
    const full12 = companyBalance["12kg"].direction === "owes_me" ? toNumber(companyBalance["12kg"].quantity) : 0;
    const empty12 = companyBalance["12kg"].direction === "i_owe" ? toNumber(companyBalance["12kg"].quantity) : 0;
    const full48 = companyBalance["48kg"].direction === "owes_me" ? toNumber(companyBalance["48kg"].quantity) : 0;
    const empty48 = companyBalance["48kg"].direction === "i_owe" ? toNumber(companyBalance["48kg"].quantity) : 0;
    return { full12, empty12, full48, empty48 };
  }, [companyBalance]);

  const summaryLines = useMemo(() => {
    const lines: string[] = [];
    const money = (value: string) => toNumber(value);
    const count = (value: string) => toNumber(value);

    if (money(state.companyPayMoney) > 0) lines.push(`Pay Company: ${money(state.companyPayMoney)}₪`);

    if (companyBalances.full12 > 0) lines.push(`Company owes you: ${companyBalances.full12}x 12kg full`);
    if (companyBalances.full48 > 0) lines.push(`Company owes you: ${companyBalances.full48}x 48kg full`);
    if (companyBalances.empty12 > 0) lines.push(`You owe company: ${companyBalances.empty12}x 12kg empty`);
    if (companyBalances.empty48 > 0) lines.push(`You owe company: ${companyBalances.empty48}x 48kg empty`);

    if (count(state.inventoryFull12) || count(state.inventoryFull48)) {
      lines.push(
        `Inventory full: ${count(state.inventoryFull12)}x 12kg, ${count(state.inventoryFull48)}x 48kg`
      );
    }
    if (count(state.inventoryEmpty12) || count(state.inventoryEmpty48)) {
      lines.push(
        `Inventory empty: ${count(state.inventoryEmpty12)}x 12kg, ${count(state.inventoryEmpty48)}x 48kg`
      );
    }
    if (money(state.cashStart) > 0) lines.push(`Cash on hand: ${money(state.cashStart)}₪`);

    return lines.length > 0 ? lines : ["No opening balances provided."];
  }, [state, companyBalances]);

  const renderNetBalance = () => {
    const updateBalance = (gas: "12kg" | "48kg", field: keyof CompanyBalance, value: any) => {
      setCompanyBalance((prev) => {
        const next = { ...prev };
        next[gas] = { ...next[gas], [field]: value };
        // Reset quantity if direction changes to balanced
        if (field === "direction" && value === "balanced") {
          next[gas].quantity = "";
        }
        return next;
      });
    };

    return (
      <View style={styles.fieldGroup}>
        {(["12kg", "48kg"] as const).map((gas) => (
          <View key={gas} style={styles.netBalanceCard}>
            <Text style={styles.netBalanceTitle}>{gas}</Text>
            <View style={styles.netBalanceRow}>
              {(["owes_me", "balanced", "i_owe"] as const).map((dir) => (
                <Pressable
                  key={dir}
                  style={[
                    styles.netBalanceButton,
                    companyBalance[gas].direction === dir && styles.netBalanceActive,
                  ]}
                  onPress={() => updateBalance(gas, "direction", dir)}
                >
                  <Text
                    style={[
                      styles.netBalanceButtonText,
                      companyBalance[gas].direction === dir && styles.netBalanceActiveText,
                    ]}
                  >
                    {
                      { owes_me: "Company Owes Me", balanced: "Balanced", i_owe: "I Owe Company" }[
                        dir
                      ]
                    }
                  </Text>
                </Pressable>
              ))}
            </View>
            {companyBalance[gas].direction !== "balanced" && (
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Quantity</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  keyboardType="numeric"
                  value={companyBalance[gas].quantity}
                  onChangeText={(text) => updateBalance(gas, "quantity", text)}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  const renderFields = (fields?: StepField[]) => {
    if (!fields || fields.length === 0) return null;
    const gasFields = fields.filter((field) => field.gas);
    const nonGasFields = fields.filter((field) => !field.gas);

    return (
      <View style={styles.fieldGroup}>
        {nonGasFields.map((field) => (
          <View key={field.key} style={styles.fieldBlock}>
            <Text style={styles.label}>{field.label}</Text>
            <TextInput
              style={styles.input}
              placeholder={field.placeholder}
              keyboardType="numeric"
              value={state[field.key]}
              onChangeText={(text) => updateField(field.key, text)}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>
        ))}
        {gasFields.length === 2 ? (
          <View style={styles.row}>
            {gasFields.map((field) => (
              <View key={field.key} style={[styles.fieldBlock, styles.half]}>
                <Text style={styles.label}>{field.label}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={field.placeholder}
                  keyboardType="numeric"
                  value={state[field.key]}
                  onChangeText={(text) => updateField(field.key, text)}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>
            ))}
          </View>
        ) : (
          gasFields.map((field) => (
            <View key={field.key} style={styles.fieldBlock}>
              <Text style={styles.label}>{field.label}</Text>
              <TextInput
                style={styles.input}
                placeholder={field.placeholder}
                keyboardType="numeric"
                value={state[field.key]}
                onChangeText={(text) => updateField(field.key, text)}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>
          ))
        )}
      </View>
    );
  };

  const handleFinish = async () => {
    if (settingsQuery.data?.is_setup_completed) {
      router.replace("/(tabs)/reports");
      return;
    }
    try {
      const payload = {
        sell_price_12: toNumber(state.sell12),
        sell_price_48: toNumber(state.sell48),
        buy_price_12: toNumber(state.buy12),
        buy_price_48: toNumber(state.buy48),
        sell_iron_price_12: toNumber(state.sellIron12),
        sell_iron_price_48: toNumber(state.sellIron48),
        buy_iron_price_12: toNumber(state.buyIron12),
        buy_iron_price_48: toNumber(state.buyIron48),
        full_12: toNumber(state.inventoryFull12),
        empty_12: toNumber(state.inventoryEmpty12),
        full_48: toNumber(state.inventoryFull48),
        empty_48: toNumber(state.inventoryEmpty48),
        cash_start: toNumber(state.cashStart),
        company_payable_money: toNumber(state.companyPayMoney),
        company_full_12kg: companyBalances.full12,
        company_empty_12kg: companyBalances.empty12,
        company_full_48kg: companyBalances.full48,
        company_empty_48kg: companyBalances.empty48,
      };
      await initSystem.mutateAsync(payload);
      router.replace("/(tabs)/reports");
    } catch (err) {
      const status = (err as any)?.response?.status;
      const detail = (err as any)?.response?.data?.detail;
      if (status === 400 && detail === "system_already_initialized") {
        router.replace("/(tabs)/reports");
        return;
      }
      Alert.alert("Error", "Failed to initialize the system.");
    }
  };

  const showInputs = step.type === "inputs" || (step.type === "yesno" && yesNo[step.id] === true);

  return (
    <View style={styles.screen}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepIndicator}>
          Step {stepIndex + 1} of {totalSteps}
        </Text>
        <Text style={styles.title}>{step.title}</Text>

        <View style={styles.questionBlock}>
          <Text style={styles.question}>{step.question}</Text>
          <Text style={styles.explanation}>{step.explanation}</Text>
        </View>

        {step.type === "yesno" ? (
          <>
            {(() => {
              const yesIsDown = step.arrow === "down";
              const yesStyle = yesIsDown ? styles.choiceNo : styles.choiceYes;
              const yesIcon = yesIsDown ? "arrow-down" : "arrow-up";
              return (
                <View style={styles.choiceRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.choiceButton,
                      yesStyle,
                      yesNo[step.id] === true && styles.choiceActive,
                      pressed && styles.choicePressed,
                    ]}
                    onPress={handleYes}
                  >
                    <Ionicons name={yesIcon} size={22} color="#fff" />
                    <Text style={styles.choiceText}>Yes</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.choiceButton,
                      styles.choiceNeutral,
                      yesNo[step.id] === false && styles.choiceActive,
                      pressed && styles.choicePressed,
                    ]}
                    onPress={handleNo}
                  >
                    <Ionicons name="close" size={22} color="#fff" />
                    <Text style={styles.choiceText}>No</Text>
                  </Pressable>
                </View>
              );
            })()}
            {showInputs ? renderFields(step.fields) : null}
          </>
        ) : null}

        {step.type === "inputs" ? renderFields(step.fields) : null}
        {step.type === "netBalance" ? renderNetBalance() : null}

        {step.type === "review" ? (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Pending Actions</Text>
            {summaryLines.map((line, index) => (
              <Text key={`${line}-${index}`} style={styles.reviewLine}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.navRow}>
        {stepIndex > 0 ? (
          <Pressable
            style={({ pressed }) => [styles.navButton, styles.navSecondary, pressed && styles.pressed]}
            onPress={goBack}
          >
            <Text style={styles.navSecondaryText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.navSpacer} />
        )}
        {step.type === "review" ? (
          <Pressable
            style={({ pressed }) => [styles.navButton, styles.navPrimary, pressed && styles.pressed]}
            onPress={handleFinish}
            disabled={initSystem.isPending}
          >
            <Text style={styles.navPrimaryText}>
              {initSystem.isPending ? "Starting..." : "Confirm & Start Business"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.navButton, styles.navPrimary, pressed && styles.pressed]}
            onPress={goNext}
          >
            <Text style={styles.navPrimaryText}>Next</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f6f7f9",
  },
  progressTrack: {
    height: 4,
    backgroundColor: "#e2e8f0",
  },
  progressFill: {
    height: 4,
    backgroundColor: "#0a7ea4",
  },
  container: {
    padding: 20,
    paddingBottom: 30,
  },
  stepIndicator: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#64748b",
    fontWeight: "700",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 6,
  },
  questionBlock: {
    marginTop: 18,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  question: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  explanation: {
    fontSize: 13,
    color: "#475569",
    marginTop: 6,
  },
  choiceRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  choiceButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  choiceYes: {
    backgroundColor: "#16a34a",
  },
  choiceNo: {
    backgroundColor: "#dc2626",
  },
  choiceNeutral: {
    backgroundColor: "#64748b",
  },
  choiceActive: {
    transform: [{ scale: 1.02 }],
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  choicePressed: {
    opacity: 0.9,
  },
  choiceText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  fieldGroup: {
    marginTop: 16,
    gap: 12,
  },
  fieldBlock: {
    gap: 6,
  },
  label: {
    fontWeight: "700",
    color: "#0f172a",
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  half: {
    flex: 1,
  },
  reviewCard: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reviewTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 10,
  },
  reviewLine: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "600",
    marginBottom: 6,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  navButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  navPrimary: {
    backgroundColor: "#0a7ea4",
  },
  navPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  navSecondary: {
    backgroundColor: "#e2e8f0",
  },
  navSecondaryText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 15,
  },
  navSpacer: {
    flex: 1,
  },
  pressed: {
    opacity: 0.9,
  },
  netBalanceCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  netBalanceTitle: {
    fontWeight: "800",
    fontSize: 16,
    color: "#0f172a",
  },
  netBalanceRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    padding: 4,
  },
  netBalanceButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  netBalanceActive: {
    backgroundColor: "#fff",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  netBalanceButtonText: {
    fontWeight: "700",
    color: "#475569",
  },
  netBalanceActiveText: {
    color: "#0a7ea4",
  },
});


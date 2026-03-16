import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type InlineWalletFundingPromptProps = {
  walletAmount: number;
  shortfall?: number;
  onTransferNow?: () => void;
};

export default function InlineWalletFundingPrompt({
  walletAmount,
  shortfall = 0,
  onTransferNow,
}: InlineWalletFundingPromptProps) {
  const showTransfer = shortfall > 0 && !!onTransferNow;

  return (
    <View style={styles.wrap}>
      <Text style={styles.walletText}>You have {walletAmount.toFixed(0)} shekels in the wallet.</Text>
      {showTransfer ? (
        <View style={styles.promptRow}>
          <Text style={styles.promptText}>Want to move money from bank to wallet?</Text>
          <Pressable onPress={onTransferNow} style={styles.button}>
            <Text style={styles.buttonText}>Transfer now</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    marginTop: 8,
  },
  walletText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },
  promptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  promptText: {
    color: "#b00020",
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  button: {
    borderColor: "#b00020",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  buttonText: {
    color: "#b00020",
    fontSize: 12,
    fontWeight: "700",
  },
});

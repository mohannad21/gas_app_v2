import { Pressable, StyleSheet, Text, View } from "react-native";

type FooterActionsProps = {
  onSave: () => void;
  onSaveAndAdd?: () => void;
  saveLabel?: string;
  saveAndAddLabel?: string;
  saveDisabled?: boolean;
  saving?: boolean;
  [key: string]: unknown;
};

export default function FooterActions({
  onSave,
  onSaveAndAdd,
  saveLabel = "Save",
  saveAndAddLabel = "Save & Add More",
  saveDisabled = false,
  saving = false,
}: FooterActionsProps) {
  return (
    <View style={styles.footer}>
      <View style={styles.row}>
        {onSaveAndAdd ? (
          <Pressable
            style={[styles.secondaryBtn, saveDisabled && styles.disabledBtn]}
            onPress={onSaveAndAdd}
            disabled={saveDisabled}
          >
            <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {saveAndAddLabel}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.primaryBtn, saveDisabled && styles.disabledBtn]}
          onPress={onSave}
          disabled={saveDisabled}
        >
          <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {saving ? "Saving..." : saveLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#0a7ea4",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#16a34a",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
  disabledBtn: {
    opacity: 0.6,
  },
});

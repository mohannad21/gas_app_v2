import { Pressable, StyleSheet, Text, View } from "react-native";

type FooterActionsProps = {
  onCancel: () => void;
  onSave: () => void;
  onSaveAndAdd?: () => void;
  saveLabel?: string;
  saveAndAddLabel?: string;
  saveDisabled?: boolean;
  saving?: boolean;
};

export default function FooterActions({
  onCancel,
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
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.btnText}>Cancel</Text>
        </Pressable>
        {onSaveAndAdd ? (
          <Pressable
            style={[styles.secondaryBtn, saveDisabled && styles.disabledBtn]}
            onPress={onSaveAndAdd}
            disabled={saveDisabled}
          >
            <Text style={styles.btnText}>{saveAndAddLabel}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.primaryBtn, saveDisabled && styles.disabledBtn]}
          onPress={onSave}
          disabled={saveDisabled}
        >
          <Text style={styles.btnText}>{saving ? "Saving..." : saveLabel}</Text>
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
    backgroundColor: "#f3f5f7",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#dc2626",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
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

import { Modal, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { CollectionEvent } from "@/types/domain";

interface CollectionEditModalProps {
  isOpen: boolean;
  target: CollectionEvent | null;
  amount: string;
  qty12: string;
  qty48: string;
  note: string;
  onAmountChange: (text: string) => void;
  onQty12Change: (text: string) => void;
  onQty48Change: (text: string) => void;
  onNoteChange: (text: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function CollectionEditModal({
  isOpen,
  target,
  amount,
  qty12,
  qty48,
  note,
  onAmountChange,
  onQty12Change,
  onQty48Change,
  onNoteChange,
  onClose,
  onSave,
}: CollectionEditModalProps) {
  return (
    <Modal transparent visible={isOpen} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Edit collection</Text>
          {target?.action_type !== "return" ? (
            <>
              <Text style={styles.modalLabel}>Amount</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                inputMode="numeric"
                value={amount}
                onChangeText={onAmountChange}
                placeholder="0"
              />
            </>
          ) : (
            <>
              <Text style={styles.modalLabel}>12kg</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                inputMode="numeric"
                value={qty12}
                onChangeText={onQty12Change}
                placeholder="0"
              />
              <Text style={styles.modalLabel}>48kg</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                inputMode="numeric"
                value={qty48}
                onChangeText={onQty48Change}
                placeholder="0"
              />
            </>
          )}
          <Text style={styles.modalLabel}>Note</Text>
          <TextInput
            style={styles.modalInput}
            value={note}
            onChangeText={onNoteChange}
            placeholder="Optional note"
          />
          <View style={styles.modalActions}>
            <Pressable style={styles.modalBtn} onPress={onClose}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={onSave}>
              <Text style={styles.modalBtnTextPrimary}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 24,
    width: "85%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 12,
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    justifyContent: "flex-end",
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: "500",
  },
  modalBtnPrimary: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  modalBtnTextPrimary: {
    fontSize: 14,
    fontWeight: "500",
    color: "white",
  },
});

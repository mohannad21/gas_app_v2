import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { useCreateInvite, usePendingInvites, useRevokeInvite, useRevokeWorker, useWorkers } from "@/hooks/useWorkers";
import { formatDateMedium, formatDateTimeMedium } from "@/lib/date";
import type { PendingInvite, WorkerInviteResult, WorkerMember } from "@/types/workers";

const ROLE_OPTIONS = [
  { id: "00000000-0000-0000-role-000000000002", label: "Driver", value: "driver" },
  { id: "00000000-0000-0000-role-000000000003", label: "Cashier", value: "cashier" },
  { id: "00000000-0000-0000-role-000000000004", label: "Accountant", value: "accountant" },
] as const;

function roleTone(roleName: string) {
  if (roleName === "driver") {
    return { backgroundColor: "#dbeafe", color: "#1d4ed8" };
  }
  if (roleName === "cashier") {
    return { backgroundColor: "#dcfce7", color: "#166534" };
  }
  if (roleName === "accountant") {
    return { backgroundColor: "#fef3c7", color: "#92400e" };
  }
  return { backgroundColor: "#e5e7eb", color: "#374151" };
}

function roleLabel(roleName: string) {
  return roleName
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function WorkersScreen() {
  const router = useRouter();
  const workersQuery = useWorkers();
  const invitesQuery = usePendingInvites();
  const createInviteMutation = useCreateInvite();
  const revokeInviteMutation = useRevokeInvite();
  const revokeWorkerMutation = useRevokeWorker();

  const [modalVisible, setModalVisible] = useState(false);
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState<string>(ROLE_OPTIONS[0].id);
  const [formError, setFormError] = useState<string | null>(null);

  const workers = workersQuery.data ?? [];
  const pendingInvites = invitesQuery.data ?? [];
  const activeWorkers = useMemo(
    () => workers.filter((worker) => worker.role_name !== "distributor_owner"),
    [workers]
  );
  const currentSeatUsage = activeWorkers.length + pendingInvites.length;

  function resetForm() {
    setPhone("");
    setRoleId(ROLE_OPTIONS[0].id);
    setFormError(null);
  }

  function closeModal() {
    setModalVisible(false);
    resetForm();
  }

  async function handleCreateInvite() {
    if (!phone.trim()) {
      setFormError("Phone number is required.");
      return;
    }
    if (!roleId) {
      setFormError("Select a role.");
      return;
    }

    setFormError(null);
    try {
      const result = await createInviteMutation.mutateAsync({
        phone: phone.trim(),
        role_id: roleId,
      });
      closeModal();
      showInviteResult(result);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (detail === "worker_limit_reached") {
        setFormError("No worker seats are available on this plan.");
        return;
      }
      setFormError("Could not send invite. Please try again.");
    }
  }

  function showInviteResult(result: WorkerInviteResult) {
    if (result.activation_code) {
      Alert.alert("Invite created", `OTP: ${result.activation_code}`);
      return;
    }
    Alert.alert("Invite sent", "The activation code was sent to the worker.");
  }

  function confirmRemoveWorker(worker: WorkerMember) {
    Alert.alert("Remove worker?", `Remove ${worker.phone || "this worker"} from access?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await revokeWorkerMutation.mutateAsync(worker.membership_id);
        },
      },
    ]);
  }

  function confirmCancelInvite(invite: PendingInvite) {
    Alert.alert("Cancel invite?", `Cancel the invite for ${invite.phone}?`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel invite",
        style: "destructive",
        onPress: async () => {
          await revokeInviteMutation.mutateAsync(invite.invite_id);
        },
      },
    ]);
  }

  const isLoading = workersQuery.isLoading || invitesQuery.isLoading;
  const hasLoadError = workersQuery.isError || invitesQuery.isError;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.title}>Workers</Text>
          <View style={styles.backButtonSpacer} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seat Usage</Text>
          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{activeWorkers.length}</Text>
              <Text style={styles.metricLabel}>Active workers</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{pendingInvites.length}</Text>
              <Text style={styles.metricLabel}>Pending invites</Text>
            </View>
          </View>
          <View style={styles.summaryBar}>
            <Text style={styles.summaryLabel}>Current usage</Text>
            <Text style={styles.summaryValue}>{currentSeatUsage} reserved seats</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.centerCard}>
            <ActivityIndicator size="small" color="#0a7ea4" />
            <Text style={styles.meta}>Loading workers...</Text>
          </View>
        ) : null}

        {hasLoadError ? (
          <View style={styles.centerCard}>
            <Text style={styles.errorText}>Could not load workers right now.</Text>
          </View>
        ) : null}

        {!isLoading && !hasLoadError ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Active Workers</Text>
              {workers.length === 0 ? (
                <Text style={styles.emptyText}>No active workers yet.</Text>
              ) : (
                workers.map((worker) => {
                  const tone = roleTone(worker.role_name);
                  const removable = worker.role_name !== "distributor_owner";
                  return (
                    <View key={worker.membership_id} style={styles.itemRow}>
                      <View style={styles.itemMain}>
                        <Text style={styles.itemTitle}>{worker.phone || "No phone"}</Text>
                        <View style={styles.itemMetaRow}>
                          <View style={[styles.badge, { backgroundColor: tone.backgroundColor }]}>
                            <Text style={[styles.badgeText, { color: tone.color }]}>{roleLabel(worker.role_name)}</Text>
                          </View>
                          <Text style={styles.itemMeta}>Joined {formatDateMedium(worker.joined_at, undefined, "-")}</Text>
                        </View>
                      </View>
                      {removable ? (
                        <Pressable
                          style={[styles.actionButton, styles.destructiveButton]}
                          onPress={() => confirmRemoveWorker(worker)}
                          disabled={revokeWorkerMutation.isPending}
                        >
                          <Text style={styles.destructiveButtonText}>Remove</Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.ownerLabel}>Owner</Text>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pending Invites</Text>
              {pendingInvites.length === 0 ? (
                <Text style={styles.emptyText}>No pending invites.</Text>
              ) : (
                pendingInvites.map((invite) => {
                  const tone = roleTone(invite.role_name);
                  return (
                    <View key={invite.invite_id} style={styles.itemRow}>
                      <View style={styles.itemMain}>
                        <Text style={styles.itemTitle}>{invite.phone}</Text>
                        <View style={styles.itemMetaRow}>
                          <View style={[styles.badge, { backgroundColor: tone.backgroundColor }]}>
                            <Text style={[styles.badgeText, { color: tone.color }]}>{roleLabel(invite.role_name)}</Text>
                          </View>
                          <Text style={styles.itemMeta}>Expires {formatDateTimeMedium(invite.expires_at, undefined, "-")}</Text>
                        </View>
                      </View>
                      <Pressable
                        style={[styles.actionButton, styles.secondaryButton]}
                        onPress={() => confirmCancelInvite(invite)}
                        disabled={revokeInviteMutation.isPending}
                      >
                        <Text style={styles.secondaryButtonText}>Cancel</Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.primaryButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.primaryButtonText}>Invite Worker</Text>
        </Pressable>
      </View>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.modalBackdrop}>
              <TouchableWithoutFeedback accessible={false}>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>Invite Worker</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="Phone number"
                    autoCapitalize="none"
                    keyboardType="phone-pad"
                    returnKeyType="done"
                    blurOnSubmit
                    value={phone}
                    onChangeText={setPhone}
                    onSubmitEditing={Keyboard.dismiss}
                    editable={!createInviteMutation.isPending}
                  />

                  <Text style={styles.fieldLabel}>Role</Text>
                  <View style={styles.roleGrid}>
                    {ROLE_OPTIONS.map((option) => {
                      const selected = option.id === roleId;
                      return (
                        <Pressable
                          key={option.id}
                          style={[styles.roleOption, selected && styles.roleOptionSelected]}
                          onPress={() => {
                            Keyboard.dismiss();
                            setRoleId(option.id);
                          }}
                          disabled={createInviteMutation.isPending}
                        >
                          <Text style={[styles.roleOptionText, selected && styles.roleOptionTextSelected]}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

                  <View style={styles.modalActions}>
                    <Pressable
                      style={styles.modalSecondaryButton}
                      onPress={closeModal}
                      disabled={createInviteMutation.isPending}
                    >
                      <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalPrimaryButton, createInviteMutation.isPending && styles.buttonDisabled]}
                      onPress={handleCreateInvite}
                      disabled={createInviteMutation.isPending}
                    >
                      {createInviteMutation.isPending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.modalPrimaryButtonText}>Send Invite</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f7f8",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 112,
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  backButtonText: {
    fontSize: 20,
    color: "#111",
  },
  backButtonSpacer: {
    width: 36,
    height: 36,
  },
  title: {
    fontSize: 26,
    fontFamily: "NunitoSans-Bold",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "NunitoSans-SemiBold",
    color: "#888",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    textTransform: "uppercase",
  },
  metricRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 4,
  },
  metricValue: {
    fontSize: 24,
    color: "#111827",
    fontFamily: "NunitoSans-Bold",
  },
  metricLabel: {
    fontSize: 13,
    color: "#64748b",
    fontFamily: "NunitoSans-Regular",
  },
  summaryBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  summaryLabel: {
    fontSize: 15,
    color: "#111",
    fontFamily: "NunitoSans-Regular",
  },
  summaryValue: {
    fontSize: 15,
    color: "#0a7ea4",
    fontFamily: "NunitoSans-Bold",
  },
  centerCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 10,
  },
  meta: {
    color: "#64748b",
    fontSize: 13,
    fontFamily: "NunitoSans-Regular",
  },
  errorText: {
    color: "#b00020",
    fontSize: 14,
    fontFamily: "NunitoSans-SemiBold",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  emptyText: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#64748b",
    fontSize: 14,
    fontFamily: "NunitoSans-Regular",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  itemMain: {
    flex: 1,
    gap: 6,
  },
  itemTitle: {
    fontSize: 16,
    color: "#111",
    fontFamily: "NunitoSans-SemiBold",
  },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  itemMeta: {
    fontSize: 12,
    color: "#64748b",
    fontFamily: "NunitoSans-Regular",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "NunitoSans-Bold",
  },
  actionButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  destructiveButton: {
    backgroundColor: "#fee2e2",
  },
  destructiveButtonText: {
    color: "#b91c1c",
    fontSize: 13,
    fontFamily: "NunitoSans-Bold",
  },
  secondaryButton: {
    backgroundColor: "#e0f2fe",
  },
  secondaryButtonText: {
    color: "#0369a1",
    fontSize: 13,
    fontFamily: "NunitoSans-Bold",
  },
  ownerLabel: {
    color: "#64748b",
    fontSize: 13,
    fontFamily: "NunitoSans-SemiBold",
  },
  footer: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 24,
  },
  primaryButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "NunitoSans-Bold",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 22,
    color: "#111",
    fontFamily: "NunitoSans-Bold",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  fieldLabel: {
    fontSize: 13,
    color: "#64748b",
    fontFamily: "NunitoSans-SemiBold",
    textTransform: "uppercase",
  },
  roleGrid: {
    gap: 10,
  },
  roleOption: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  roleOptionSelected: {
    borderColor: "#0a7ea4",
    backgroundColor: "#e0f2fe",
  },
  roleOptionText: {
    fontSize: 15,
    color: "#111",
    fontFamily: "NunitoSans-SemiBold",
  },
  roleOptionTextSelected: {
    color: "#075985",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  modalSecondaryButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalSecondaryButtonText: {
    fontSize: 15,
    color: "#64748b",
    fontFamily: "NunitoSans-SemiBold",
  },
  modalPrimaryButton: {
    minWidth: 120,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalPrimaryButtonText: {
    fontSize: 15,
    color: "#fff",
    fontFamily: "NunitoSans-Bold",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

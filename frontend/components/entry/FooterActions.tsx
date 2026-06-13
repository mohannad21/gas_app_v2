import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AppColors } from "@/constants/colors";

type FooterActionsProps = {
  onSave: () => void;
  onSaveAndAdd?: () => void;
  saveLabel?: string;
  saveAndAddLabel?: string;
  saveDisabled?: boolean;
  saving?: boolean;
  saveLoading?: boolean;
  saveAndAddLoading?: boolean;
  [key: string]: unknown;
};

export default function FooterActions({
  onSave,
  onSaveAndAdd,
  saveLabel = "Save",
  saveAndAddLabel = "Save & Add More",
  saveDisabled = false,
  saving = false,
  saveLoading,
  saveAndAddLoading = false,
}: FooterActionsProps) {
  const primaryLoading = saveLoading ?? saving;
  return (
    <View style={styles.footer}>
      <View style={styles.row}>
        {onSaveAndAdd ? (
          <Pressable
            style={[styles.secondaryBtn, saveDisabled && styles.disabledBtn]}
            onPress={onSaveAndAdd}
            disabled={saveDisabled}
          >
            <View style={styles.btnContent}>
              {saveAndAddLoading ? <ActivityIndicator size="small" color={AppColors.brand.onPrimary} /> : null}
              <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {saveAndAddLoading ? "Saving..." : saveAndAddLabel}
              </Text>
            </View>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.primaryBtn, saveDisabled && styles.disabledBtn]}
          onPress={onSave}
          disabled={saveDisabled}
        >
          <View style={styles.btnContent}>
            {primaryLoading ? <ActivityIndicator size="small" color={AppColors.brand.onPrimary} /> : null}
            <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {primaryLoading ? "Saving..." : saveLabel}
            </Text>
          </View>
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
    backgroundColor: AppColors.brand.primary,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: AppColors.intent.success,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: {
    color: AppColors.brand.onPrimary,
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
  btnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  disabledBtn: {
    opacity: 0.6,
  },
});

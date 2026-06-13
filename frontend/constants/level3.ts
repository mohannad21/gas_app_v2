import { AppColors } from "./colors";
import { FontFamilies, FontSizes } from "./typography";

export const Level3Tokens = {
  spacing: {
    rowX: 12,
    rowY: 10,
    topGap: 10,
    sublineGap: 4,
    actionGap: 6,
    chipGap: 6,
    chipPadX: 8,
    chipPadY: 4,
  },
  typography: {
    heroSize: FontSizes.lg,
    heroFamily: FontFamilies.semibold,
    contextSize: FontSizes.xs,
    contextFamily: FontFamilies.medium,
    moneySize: FontSizes.sm,
    moneyFamily: FontFamilies.semibold,
    timeSize: FontSizes.xs,
    timeFamily: FontFamilies.semibold,
    chipSize: FontSizes.xs,
    chipFamily: FontFamilies.medium,
  },
  colors: {
    rowBg: AppColors.level3.rowBg,
    border: AppColors.level3.border,
    textPrimary: AppColors.level3.textPrimary,
    textSecondary: AppColors.level3.textSecondary,
    textMuted: AppColors.level3.textMuted,
    money: AppColors.level3.money,
    settledBg: AppColors.level3.settledBg,
    settledBorder: AppColors.level3.settledBorder,
    settledText: AppColors.level3.settledText,
    actionChipBg: AppColors.level3.actionChipBg,
    actionChipBorder: AppColors.level3.actionChipBorder,
    actionChipText: AppColors.level3.actionChipText,
    actionLabel: AppColors.level3.actionLabel,
  },
};


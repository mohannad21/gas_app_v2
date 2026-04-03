import { createBankDeposit, deleteBankDeposit, listBankDeposits } from "@/lib/api";
import { getUserFacingApiError } from "@/lib/apiErrors";
import { BankDeposit } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showToast } from "@/lib/toast";

export function useBankDeposits(date?: string, options?: { enabled?: boolean; includeDeleted?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery<BankDeposit[]>({
    queryKey: ["bank_deposits", date ?? "all", options?.includeDeleted ?? false],
    enabled,
    queryFn: () => listBankDeposits(date, options?.includeDeleted),
  });
}

export function useCreateBankDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBankDeposit,
    onError: (err) => {
      showToast(getUserFacingApiError(err, "Failed to save transfer."));
    },
    onSuccess: (_, variables) => {
      const directionLabel =
        variables.direction === "bank_to_wallet" ? "Bank to Wallet saved" : "Wallet to Bank saved";
      showToast(directionLabel);
      queryClient.invalidateQueries({ queryKey: ["bank_deposits"] });
      queryClient.invalidateQueries({ queryKey: ["bank_deposits", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useDeleteBankDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; date: string }) => deleteBankDeposit(id),
    onError: (err) => {
      showToast(getUserFacingApiError(err, "Failed to remove transfer."));
    },
    onSuccess: (_, variables) => {
      showToast("Transfer removed");
      queryClient.invalidateQueries({ queryKey: ["bank_deposits"] });
      queryClient.invalidateQueries({ queryKey: ["bank_deposits", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}


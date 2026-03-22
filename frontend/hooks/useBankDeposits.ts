import { createBankDeposit, deleteBankDeposit, listBankDeposits } from "@/lib/api";
import { BankDeposit } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { showToast } from "@/lib/toast";

function extractErrorMessage(err: AxiosError) {
  const detail = err.response?.data?.detail ?? err.response?.data?.message ?? err.message;
  if (typeof detail === "string") return detail;
  if (detail) return JSON.stringify(detail);
  return "Unknown error";
}

export function useBankDeposits(date?: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery<BankDeposit[]>({
    queryKey: ["bank_deposits", date ?? "all"],
    enabled,
    queryFn: () => listBankDeposits(date),
  });
}

export function useCreateBankDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBankDeposit,
    onError: (err) => {
      const message = extractErrorMessage(err as AxiosError);
      showToast(`Failed to save transfer: ${message}`);
    },
    onSuccess: (_, variables) => {
      const directionLabel =
        variables.direction === "bank_to_wallet" ? "Bank to Wallet saved" : "Wallet to Bank saved";
      showToast(directionLabel);
      queryClient.invalidateQueries({ queryKey: ["bank_deposits"] });
      queryClient.invalidateQueries({ queryKey: ["bank_deposits", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"] });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"] });
    },
  });
}

export function useDeleteBankDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; date: string }) => deleteBankDeposit(id),
    onError: (err) => {
      const message = extractErrorMessage(err as AxiosError);
      showToast(`Failed to remove transfer: ${message}`);
    },
    onSuccess: (_, variables) => {
      showToast("Transfer removed");
      queryClient.invalidateQueries({ queryKey: ["bank_deposits"] });
      queryClient.invalidateQueries({ queryKey: ["bank_deposits", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"] });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"] });
    },
  });
}


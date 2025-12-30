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

export function useBankDeposits(date: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery<BankDeposit[]>({
    queryKey: ["bank_deposits", date],
    enabled: enabled && !!date,
    queryFn: () => listBankDeposits(date),
  });
}

export function useCreateBankDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBankDeposit,
    onError: (err) => {
      const message = extractErrorMessage(err as AxiosError);
      showToast(`Failed to save deposit: ${message}`);
    },
    onSuccess: (_, variables) => {
      showToast("Deposit saved");
      queryClient.invalidateQueries({ queryKey: ["bank_deposits", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useDeleteBankDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; date: string }) => deleteBankDeposit(id),
    onError: (err) => {
      const message = extractErrorMessage(err as AxiosError);
      showToast(`Failed to remove deposit: ${message}`);
    },
    onSuccess: (_, variables) => {
      showToast("Deposit removed");
      queryClient.invalidateQueries({ queryKey: ["bank_deposits"] });
      queryClient.invalidateQueries({ queryKey: ["bank_deposits", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

import { useState } from "react";

export function useExpenseModal() {
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseDate, setExpenseDate] = useState<string | null>(null);
  const [expenseType, setExpenseType] = useState("fuel");
  const [customExpenseType, setCustomExpenseType] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [useCustomType, setUseCustomType] = useState(false);
  const [allowExpenseInput, setAllowExpenseInput] = useState(false);

  const resetExpenseForm = () => {
    setExpenseModalOpen(false);
    setExpenseDate(null);
    setExpenseType("fuel");
    setCustomExpenseType("");
    setExpenseAmount("");
    setExpenseNote("");
    setUseCustomType(false);
    setAllowExpenseInput(false);
  };

  return {
    expenseModalOpen,
    setExpenseModalOpen,
    expenseDate,
    setExpenseDate,
    expenseType,
    setExpenseType,
    customExpenseType,
    setCustomExpenseType,
    expenseAmount,
    setExpenseAmount,
    expenseNote,
    setExpenseNote,
    useCustomType,
    setUseCustomType,
    allowExpenseInput,
    setAllowExpenseInput,
    resetExpenseForm,
  };
}

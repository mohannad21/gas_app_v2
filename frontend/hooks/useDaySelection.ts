import { useEffect, useState } from "react";

export function useDaySelection(v2Rows?: { date: string }[] | null) {
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });

  const [openEventKeys, setOpenEventKeys] = useState<string[]>([]);

  // Sync selectedDate to first v2Row when current date disappears
  useEffect(() => {
    if (!v2Rows?.length) return;
    if (selectedDate && v2Rows.some((row) => row.date === selectedDate)) return;
    setSelectedDate(v2Rows[0]?.date ?? null);
  }, [selectedDate, v2Rows]);

  return {
    selectedDate,
    setSelectedDate,
    openEventKeys,
    setOpenEventKeys,
  };
}

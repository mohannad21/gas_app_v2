import { useEffect, useRef, useState } from "react";
import { formatTimeHMS, getCurrentLocalDate, getCurrentLocalTime } from "@/lib/date";

export type EditRefillEntry = {
  refill_id: string;
  date: string;
  time_of_day?: "morning" | "evening";
  effective_at?: string;
  buy12: number;
  return12: number;
  buy48: number;
  return48: number;
};

export function useRefillFormState(
  visible: boolean,
  mode: "refill" | "buy" | "return",
  editEntry?: EditRefillEntry | null,
  refillNotes?: string
) {
  // Date & time
  const [date, setDate] = useState(getCurrentLocalDate());
  const [time, setTime] = useState(getCurrentLocalTime({ includeSeconds: true }));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  // Cylinders
  const [buy12, setBuy12] = useState("");
  const [ret12, setRet12] = useState("");
  const [buy48, setBuy48] = useState("");
  const [ret48, setRet48] = useState("");
  const [ret12Touched, setRet12Touched] = useState(false);
  const [ret48Touched, setRet48Touched] = useState(false);

  // Money
  const [paidNow, setPaidNow] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);

  // Prices
  const [price12Input, setPrice12Input] = useState("");
  const [price48Input, setPrice48Input] = useState("");
  const [price12Dirty, setPrice12Dirty] = useState(false);
  const [price48Dirty, setPrice48Dirty] = useState(false);
  const [ironPrice12Input, setIronPrice12Input] = useState("");
  const [ironPrice48Input, setIronPrice48Input] = useState("");

  // Other
  const [notes, setNotes] = useState("");
  const [initOpen, setInitOpen] = useState(false);
  const [initCounts, setInitCounts] = useState({
    full12: "",
    empty12: "",
    full48: "",
    empty48: "",
  });

  const isBuyMode = mode === "buy";
  const isReturnMode = mode === "return";
  const prevVisible = useRef(visible);
  const lastInitKey = useRef<string | null>(null);

  const initializeForm = () => {
    if (editEntry) {
      setDate(editEntry.date);
      if (editEntry.effective_at) {
        const parsed = new Date(editEntry.effective_at);
        if (!Number.isNaN(parsed.getTime())) {
          setTime(formatTimeHMS(parsed, { hour12: false }));
        }
      } else if (editEntry.time_of_day) {
        setTime(editEntry.time_of_day === "morning" ? "09:00:00" : "18:00:00");
      }
      setBuy12(String(editEntry.buy12));
      setRet12(String(editEntry.return12));
      setBuy48(String(editEntry.buy48));
      setRet48(String(editEntry.return48));
      setRet12Touched(true);
      setRet48Touched(true);
      setPaidTouched(false);
      setNotes(refillNotes ?? "");
      setPrice12Dirty(false);
      setPrice48Dirty(false);
      setIronPrice12Input("0");
      setIronPrice48Input("0");
    } else {
      setDate(getCurrentLocalDate());
      setTime(getCurrentLocalTime({ includeSeconds: true }));
      setBuy12("");
      setRet12("");
      setBuy48("");
      setRet48("");
      setRet12Touched(false);
      setRet48Touched(false);
      setPaidNow("");
      setPaidTouched(false);
      setNotes("");
      setPrice12Dirty(false);
      setPrice48Dirty(false);
      setIronPrice12Input("0");
      setIronPrice48Input("0");
    }
    if (isBuyMode) {
      setRet12("0");
      setRet48("0");
      setRet12Touched(true);
      setRet48Touched(true);
    }
    if (isReturnMode) {
      setBuy12("0");
      setBuy48("0");
    }
  };

  // Initialize form when modal opens
  useEffect(() => {
    const initKey = `${mode}:${editEntry?.refill_id ?? "new"}`;
    if (visible && (!prevVisible.current || lastInitKey.current !== initKey)) {
      initializeForm();
      lastInitKey.current = initKey;
    }
    if (!visible) {
      lastInitKey.current = null;
    }
    prevVisible.current = visible;
  }, [visible, mode, editEntry, refillNotes, isBuyMode, isReturnMode]);

  // Handle effective_at changes
  useEffect(() => {
    if (!visible || !editEntry?.effective_at) return;
    const parsed = new Date(editEntry.effective_at);
    if (Number.isNaN(parsed.getTime())) return;
    setTime(formatTimeHMS(parsed, { hour12: false }));
  }, [visible, editEntry?.effective_at]);

  // Handle buy mode initialization
  useEffect(() => {
    if (!visible || !isBuyMode) return;
    setRet12("0");
    setRet48("0");
    setRet12Touched(true);
    setRet48Touched(true);
  }, [isBuyMode, visible]);

  // Handle return mode initialization
  useEffect(() => {
    if (!visible || !isReturnMode) return;
    setBuy12("0");
    setBuy48("0");
  }, [isReturnMode, visible]);

  const resetFormForCurrentMode = () => {
    setDate(getCurrentLocalDate());
    setTime(getCurrentLocalTime({ includeSeconds: true }));
    setBuy12(isReturnMode ? "0" : "");
    setRet12(isBuyMode ? "0" : "");
    setBuy48(isReturnMode ? "0" : "");
    setRet48(isBuyMode ? "0" : "");
    setRet12Touched(isBuyMode);
    setRet48Touched(isBuyMode);
    setPaidNow("");
    setPaidTouched(false);
    setNotes("");
    setPrice12Dirty(false);
    setPrice48Dirty(false);
    setIronPrice12Input("0");
    setIronPrice48Input("0");
  };

  return {
    // Date & time
    date,
    setDate,
    time,
    setTime,
    calendarOpen,
    setCalendarOpen,
    timeOpen,
    setTimeOpen,
    // Cylinders
    buy12,
    setBuy12,
    ret12,
    setRet12,
    buy48,
    setBuy48,
    ret48,
    setRet48,
    ret12Touched,
    setRet12Touched,
    ret48Touched,
    setRet48Touched,
    // Money
    paidNow,
    setPaidNow,
    paidTouched,
    setPaidTouched,
    // Prices
    price12Input,
    setPrice12Input,
    price48Input,
    setPrice48Input,
    price12Dirty,
    setPrice12Dirty,
    price48Dirty,
    setPrice48Dirty,
    ironPrice12Input,
    setIronPrice12Input,
    ironPrice48Input,
    setIronPrice48Input,
    // Other
    notes,
    setNotes,
    initOpen,
    setInitOpen,
    initCounts,
    setInitCounts,
    // Helpers
    isBuyMode,
    isReturnMode,
    resetFormForCurrentMode,
  };
}

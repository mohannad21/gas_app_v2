import { router } from "expo-router";

import { toDateKey } from "@/lib/date";

export const ADD_DATA_SOURCE = "add";

export function isAddDataSource(source?: string | string[] | null) {
  if (Array.isArray(source)) {
    return source[0] === ADD_DATA_SOURCE;
  }
  return source === ADD_DATA_SOURCE;
}

export function getReportDateParam(value?: string | null) {
  if (!value) return "";
  const normalized = toDateKey(value);
  if (normalized) return normalized;
  const raw = String(value);
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

export function openDailyReportForDate(value?: string | null, extraParams?: Record<string, string | number | undefined>) {
  const date = getReportDateParam(value);
  router.replace({
    pathname: "/(tabs)/reports",
    params: {
      ...(date ? { date } : {}),
      ...extraParams,
    },
  });
}

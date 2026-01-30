type DateInput = string | Date | null | undefined;

const toDate = (value: DateInput): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const pad2 = (value: number) => value.toString().padStart(2, "0");

export const toDateKey = (value: DateInput) => {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
};

export const formatWeekdayShort = (value: DateInput, locale = "en-US") => {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleDateString(locale, { weekday: "short" });
};

export const formatHourLabel = (value: DateInput, fallback = "--:00") => {
  const date = toDate(value);
  if (!date) return fallback;
  return `${pad2(date.getHours())}:00`;
};

export const formatTimeHM = (
  value: DateInput,
  options: { locale?: string; hour12?: boolean; fallback?: string } = {}
) => {
  const date = toDate(value);
  if (!date) return options.fallback ?? "--:--";
  const formatOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };
  if (options.hour12 != null) formatOptions.hour12 = options.hour12;
  return date.toLocaleTimeString(options.locale ?? "en-US", formatOptions);
};

export const formatDateLocale = (
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
  fallback = ""
) => {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString(locale, options);
};

export const formatDateTimeLocale = (
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
  fallback = ""
) => {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleString(locale, options);
};

export const formatDateMedium = (value: DateInput, locale?: string, fallback = "") => {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
};

export const formatDateTimeMedium = (value: DateInput, locale?: string, fallback = "") => {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export const formatDateTimeYMDHM = (value: DateInput) => {
  if (!value) return "";
  const date = toDate(value);
  if (!date) return String(value);
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

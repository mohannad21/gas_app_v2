type DateInput = string | Date | null | undefined;
type HappenedAtInput = {
  date?: string;
  time?: string;
  time_of_day?: "morning" | "evening";
  at?: string;
};
type TimeParts = {
  hour: string;
  minute: string;
  second: string;
};

const toDate = (value: DateInput): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const pad2 = (value: number) => value.toString().padStart(2, "0");
const CLOCK_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function formatTimeParts(parts: TimeParts, includeSeconds = true) {
  return includeSeconds
    ? `${parts.hour}:${parts.minute}:${parts.second}`
    : `${parts.hour}:${parts.minute}`;
}

function parseTimeParts(value?: string | null): TimeParts | null {
  if (!value) return null;
  const match = CLOCK_RE.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) return null;
  return {
    hour: pad2(hour),
    minute: pad2(minute),
    second: pad2(second),
  };
}

function normalizeClockTime(value: string, defaultSecond = "00") {
  const parts = parseTimeParts(value);
  if (!parts) return null;
  return `${parts.hour}:${parts.minute}:${parts.second || defaultSecond}`;
}

export function getCurrentLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function getCurrentLocalTime(options: { includeSeconds?: boolean } = {}) {
  const now = new Date();
  const parts = {
    hour: pad2(now.getHours()),
    minute: pad2(now.getMinutes()),
    second: pad2(now.getSeconds()),
  };
  return formatTimeParts(parts, options.includeSeconds ?? false);
}

export function getTimeParts(value?: string | null, fallbackToNow = true): TimeParts {
  const parsed = parseTimeParts(value);
  if (parsed) return parsed;
  if (!fallbackToNow) return { hour: "00", minute: "00", second: "00" };
  const fallback = getCurrentLocalTime({ includeSeconds: true });
  return parseTimeParts(fallback) ?? { hour: "00", minute: "00", second: "00" };
}

export const buildHappenedAt = (input?: HappenedAtInput): string | undefined => {
  if (!input) return undefined;
  if (input.at) return input.at;
  if (!input.date) return undefined;
  const time = input.time
    ? normalizeClockTime(input.time)
    : input.time_of_day === "morning"
      ? "09:00:00"
      : input.time_of_day === "evening"
        ? "18:00:00"
        : "12:00:00";
  if (!time) return undefined;
  const dt = new Date(`${input.date}T${time}`);
  return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
};

export const buildActivityHappenedAt = (input?: Pick<HappenedAtInput, "date" | "time" | "at">): string | undefined => {
  if (!input) return undefined;
  if (input.at) return input.at;
  if (!input.date) return undefined;
  const normalizedTime = normalizeClockTime(input.time ?? getCurrentLocalTime({ includeSeconds: true }));
  if (!normalizedTime) return undefined;
  const dt = new Date(`${input.date}T${normalizedTime}`);
  return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
};

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

export const formatTimeHMS = (
  value: DateInput,
  options: { locale?: string; hour12?: boolean; fallback?: string } = {}
) => {
  const date = toDate(value);
  if (!date) return options.fallback ?? "--:--:--";
  const formatOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };
  if (options.hour12 != null) formatOptions.hour12 = options.hour12;
  return date.toLocaleTimeString(options.locale ?? "en-US", formatOptions);
};

export const getTimeHMSFromIso = (value?: string | null) => {
  const date = toDate(value);
  if (!date) return getCurrentLocalTime({ includeSeconds: true });
  return formatTimeParts(
    {
      hour: pad2(date.getHours()),
      minute: pad2(date.getMinutes()),
      second: pad2(date.getSeconds()),
    },
    true,
  );
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
  const seconds = pad2(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};


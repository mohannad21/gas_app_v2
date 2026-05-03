type CountInputOptions = {
  allowNegative?: boolean;
};

function normalizeInteger(value: number, options: CountInputOptions = {}) {
  if (!Number.isFinite(value)) return 0;
  const truncated = Math.trunc(value);
  return options.allowNegative ? truncated : Math.max(0, truncated);
}

export function sanitizeCountInput(value: string, options: CountInputOptions = {}) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return "";
  return String(normalizeInteger(parsed, options));
}

export function parseCountValue(value: string | number | null | undefined, options: CountInputOptions = {}) {
  if (typeof value === "number") {
    return normalizeInteger(value, options);
  }
  if (typeof value !== "string") return 0;
  const sanitized = sanitizeCountInput(value, options);
  return sanitized ? Number(sanitized) : 0;
}

import { DEFAULT_USER_SETTINGS } from "../userSettingsModel";

function normalizeTimeZone(timeZone: string | null | undefined): string {
  return timeZone?.trim() || DEFAULT_USER_SETTINGS.timeZone;
}

export function localDate(
  timeZone: string | null | undefined,
  date: Date = new Date(),
): string {
  // en-CA locale formats as YYYY-MM-DD, which is what the rest of the
  // app uses for ISO date strings.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
  }).format(date);
}

// Formats a ms timestamp as "YYYY-MM-DD HH:MM (Time/Zone)" for prompt context.
export function localDateTime(
  timeZone: string | null | undefined,
  ms: number,
): string {
  const normalized = normalizeTimeZone(timeZone);
  const d = new Date(ms);
  const datePart = localDate(normalized, d);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: normalized,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${datePart} ${timePart} (${normalized})`;
}

// Parses an ISO datetime string (any timezone-bearing format) and
// returns its ms timestamp. Throws on invalid input.
export function parseIsoToMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid ISO datetime: ${iso}`);
  }
  return ms;
}

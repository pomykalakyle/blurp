// Convex actions run on UTC servers, but Kyle lives in California and
// thinks of "today" in Pacific time. Anchoring date strings to America/
// Los_Angeles keeps the system prompt's "today" and entry endDate
// comparisons aligned with what Kyle sees on his clock.
const PACIFIC_TZ = "America/Los_Angeles";

export function pacificDate(date: Date = new Date()): string {
  // en-CA locale formats as YYYY-MM-DD, which is what the rest of the
  // app uses for ISO date strings.
  return new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ }).format(date);
}

// Formats a ms timestamp as "YYYY-MM-DD HH:MM Pacific" — used for
// surfacing one-off notification fire times in the chat system context.
export function pacificDateTime(ms: number): string {
  const d = new Date(ms);
  const datePart = pacificDate(d);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: PACIFIC_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${datePart} ${timePart} Pacific`;
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

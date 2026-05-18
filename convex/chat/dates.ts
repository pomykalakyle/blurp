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

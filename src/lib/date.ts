export function formatEntryDateRange(
  startDate: string,
  endDate: string | null,
): string {
  if (endDate === null) return `${startDate} → ongoing`;
  if (startDate === endDate) return startDate;
  return `${startDate} → ${endDate}`;
}

export function formatNotificationSchedule(
  schedule:
    | { kind: "oneoff"; at: number }
    | { kind: "daily"; time: string },
): string {
  if (schedule.kind === "oneoff") {
    const d = new Date(schedule.at);
    const datePart = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
    }).format(d);
    const timePart = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    return `one-off at ${datePart} ${timePart} Pacific`;
  }
  return `daily at ${schedule.time} Pacific`;
}

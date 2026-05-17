export function formatEntryDateRange(
  startDate: string,
  endDate: string | null,
): string {
  if (endDate === null) return `${startDate} → ongoing`;
  if (startDate === endDate) return startDate;
  return `${startDate} → ${endDate}`;
}

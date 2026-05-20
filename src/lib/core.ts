// @ts-nocheck
import type { Goal } from '../types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const now = () => new Date().toISOString();
export function todayISO() { return new Date().toISOString().slice(0, 10); }

export function getISOWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function getWeekDateRange(weekId) {
  const [year, week] = weekId.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday, end: sunday };
}

export function getNextWeekId(weekId) {
  const range = getWeekDateRange(weekId);
  const nextMonday = new Date(range.start);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  return getISOWeekId(nextMonday);
}

export function formatWeekLabel(weekId) {
  const { start, end } = getWeekDateRange(weekId);
  const opts = { month: 'short', day: 'numeric' };
  const sStr = start.toLocaleDateString(undefined, opts);
  const eStr = end.toLocaleDateString(undefined, { ...opts, year: 'numeric' });
  return `${sStr} – ${eStr}`;
}

export function formatWeekShort(weekId) {
  const { start } = getWeekDateRange(weekId);
  return `Week of ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function daysOpenSince(startDateStr) {
  const start = new Date(startDateStr + 'T00:00:00');
  const ms = Date.now() - start.getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

export function isWeekendReady(startDateStr) { return daysOpenSince(startDateStr) >= 5; }

// Outcome derivation. A goal is "closed out" once reviewedAt is set.
// Once closed:
//   achievement + outcomeDate set  → success (completed on outcomeDate)
//   achievement + outcomeDate null → failure (no completion through review)
//   avoidance   + outcomeDate set  → failure (slipped on outcomeDate)
//   avoidance   + outcomeDate null → success (successfully avoided)
// While still open (reviewedAt null), isGoalSuccess reflects the current
// "on track" reading: avoidance is succeeding until it slips; achievement
// is not yet successful until completed.
export function isGoalClosed(g) { return g.reviewedAt != null; }
export function isGoalResolved(g) { return isGoalClosed(g); }
export function isGoalSuccess(g) {
  const outcomeSet = g.outcomeDate != null;
  if (g.type === 'achievement') return outcomeSet;
  return !outcomeSet;
}
export function isGoalFail(g) { return !isGoalSuccess(g); }

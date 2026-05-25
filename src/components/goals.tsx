// @ts-nocheck
import { Check, ChevronDown, ChevronRight, Flag } from 'lucide-react';
import { FONT_DISPLAY } from './ui';
import { isGoalClosed, isGoalSuccess } from '../lib/core';

export function LtgGroup({ ltg, goals, collapsed, onToggleCollapse, dragHandle = null, dimmed = false }) {
  const successCount = goals.filter(isGoalSuccess).length;

  return (
    <div className={`border border-soft rounded-lg overflow-hidden ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between px-4 py-3 bg-surface-soft border-b border-soft">
        {dragHandle}
        <button onClick={onToggleCollapse} className="flex items-center gap-2 flex-1 text-left group">
          {collapsed ? <ChevronRight size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
          <span className="text-sm font-medium text-cream" style={{ fontFamily: FONT_DISPLAY }}>{ltg.title}</span>
          {goals.length > 0 && <span className="text-xs text-muted ml-2">{successCount}/{goals.length}</span>}
        </button>
      </div>
      {!collapsed && (
        <div>
          {goals.length === 0 ? (
            <div className="px-4 py-4 text-xs text-muted italic">No goals under this long-term goal yet.</div>
          ) : (
            goals.map(g => <GoalRow key={g.id} goal={g} />)
          )}
        </div>
      )}
    </div>
  );
}

export function GoalRow({ goal, ltgLabel = null }) {
  const closed = isGoalClosed(goal);
  const success = isGoalSuccess(goal);
  // Strike-through any closed achievement (whether succeeded or failed)
  // and any avoidance that ended in success — they represent "done with."
  // Avoidance failures (slips) stay un-struck so the row reads as a flag.
  const struck = closed && (goal.type === 'achievement' || success);

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-soft last:border-b-0 hover-bg-surface-soft transition-colors">
      <div className="flex-shrink-0">
        <GoalIcon goal={goal} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${struck ? 'line-through' : ''}`} style={{ color: struck ? 'var(--c-text-faint)' : (success ? 'var(--c-text)' : 'var(--c-text-muted)') }}>
          {goal.title}
        </div>
        {ltgLabel && <div className="text-xs text-faint mt-0.5 truncate">· {ltgLabel}</div>}
        {goal.description && <div className="text-xs text-muted mt-0.5">{goal.description}</div>}
        {goal.notes && <div className="text-xs text-faint mt-0.5 italic whitespace-pre-line">{goal.notes}</div>}
      </div>
      {goal.targetDate && (
        <span className="text-[10px] uppercase tracking-widest text-faint whitespace-nowrap">
          {new Date(goal.targetDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}
    </div>
  );
}

export function GoalIcon({ goal }) {
  const closed = isGoalClosed(goal);
  const success = isGoalSuccess(goal);
  if (!closed) {
    if (goal.type === 'achievement') {
      return <div className="w-6 h-6 rounded-full border-2 border-default" />;
    }
    // Avoidance not yet closed — currently on the success side.
    return (
      <div className="w-6 h-6 rounded-full bg-success-tint-soft border border-success flex items-center justify-center">
        <Check size={12} className="text-success" />
      </div>
    );
  }
  // Closed out — render based on actual outcome.
  if (success) {
    return (
      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-success-tint border border-success">
        <Check size={14} className="text-success-strong" />
      </div>
    );
  }
  // Failure: failed achievement or slipped avoidance.
  return (
    <div className="w-6 h-6 rounded-full bg-danger-tint border border-danger flex items-center justify-center">
      <Flag size={12} className="icon-flag-fill" />
    </div>
  );
}

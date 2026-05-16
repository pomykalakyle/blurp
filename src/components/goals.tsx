// @ts-nocheck
import { useState } from 'react';
import { Archive, Check, ChevronDown, ChevronRight, Edit2, Flag, MoreHorizontal, Trash2 } from 'lucide-react';
import { FONT_DISPLAY, IconButton } from './ui';
import { isGoalSuccess } from '../lib/core';

export function LtgGroup({ ltg, goals, collapsed, onToggleCollapse, onToggleGoal, onEditGoal, onDeleteGoal, onRenameLtg, onArchiveLtg }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(ltg.title);
  const successCount = goals.filter(isGoalSuccess).length;

  return (
    <div className="border border-soft rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-surface-soft border-b border-soft">
        <button onClick={onToggleCollapse} className="flex items-center gap-2 flex-1 text-left group">
          {collapsed ? <ChevronRight size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
          {renaming ? (
            <input autoFocus value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onBlur={() => { onRenameLtg(renameVal || ltg.title); setRenaming(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { onRenameLtg(renameVal || ltg.title); setRenaming(false); }
                if (e.key === 'Escape') { setRenameVal(ltg.title); setRenaming(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-2 text-cream text-sm px-2 py-1 rounded outline-none border border-default" />
          ) : (
            <span className="text-sm font-medium text-cream" style={{ fontFamily: FONT_DISPLAY }}>{ltg.title}</span>
          )}
          {goals.length > 0 && <span className="text-xs text-muted ml-2">{successCount}/{goals.length}</span>}
        </button>
        <div className="relative">
          <IconButton onClick={() => setMenuOpen(v => !v)} title="Group menu"><MoreHorizontal size={16} /></IconButton>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 z-20 bg-surface border border-default rounded-md shadow-xl py-1 min-w-[160px]">
                <button onClick={() => { setRenaming(true); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-cream hover-bg-surface-2 flex items-center gap-2">
                  <Edit2 size={14} /> Rename
                </button>
                <button onClick={() => { onArchiveLtg(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-cream hover-bg-surface-2 flex items-center gap-2">
                  <Archive size={14} /> Archive
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {!collapsed && (
        <div>
          {goals.length === 0 ? (
            <div className="px-4 py-4 text-xs text-muted italic">No weekly goals under this long-term goal yet.</div>
          ) : (
            goals.map(g => (
              <GoalRow key={g.id} goal={g} onToggle={() => onToggleGoal(g.id)} onEdit={() => onEditGoal(g)} onDelete={() => onDeleteGoal(g.id)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function GoalRow({ goal, onToggle, onEdit, onDelete, readOnly = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const success = isGoalSuccess(goal);
  const struck = goal.type === 'achievement' && goal.state?.done;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-soft last:border-b-0 hover-bg-surface-soft transition-colors">
      <button onClick={readOnly ? undefined : onToggle} disabled={readOnly} className="flex-shrink-0"
        title={goal.type === 'achievement' ? (goal.state?.done ? 'Mark not done' : 'Mark done') : (goal.state?.slipped ? 'Unmark slip' : 'Mark slipped')}>
        <GoalIcon goal={goal} />
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${struck ? 'line-through' : ''}`} style={{ color: struck ? 'var(--c-text-faint)' : (success ? 'var(--c-text)' : 'var(--c-text-muted)') }}>
          {goal.title}
        </div>
        {goal.notes && <div className="text-xs text-muted mt-0.5">{goal.notes}</div>}
      </div>
      <span className="text-[10px] uppercase tracking-widest text-faint">
        {goal.type === 'avoidance' ? 'avoid' : ''}
      </span>
      {!readOnly && (
        <div className="relative">
          <IconButton onClick={() => setMenuOpen(v => !v)} title="Goal menu"><MoreHorizontal size={14} /></IconButton>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 z-20 bg-surface border border-default rounded-md shadow-xl py-1 min-w-[140px]">
                <button onClick={() => { onEdit(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-cream hover-bg-surface-2 flex items-center gap-2">
                  <Edit2 size={14} /> Edit
                </button>
                <button onClick={() => { if (confirm('Delete this goal?')) onDelete(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-danger-strong hover-bg-surface-2 flex items-center gap-2">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function GoalIcon({ goal }) {
  if (goal.type === 'achievement') {
    if (goal.state?.done) {
      return (
        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-success-tint border border-success">
          <Check size={14} className="text-success-strong" />
        </div>
      );
    }
    return <div className="w-6 h-6 rounded-full border-2 border-default" />;
  }
  if (goal.state?.slipped) {
    return (
      <div className="w-6 h-6 rounded-full bg-danger-tint border border-danger flex items-center justify-center">
        <Flag size={12} className="icon-flag-fill" />
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-success-tint-soft border border-success flex items-center justify-center">
      <Check size={12} className="text-success" />
    </div>
  );
}

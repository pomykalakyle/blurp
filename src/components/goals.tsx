// @ts-nocheck
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Check, ChevronDown, ChevronRight, Edit2, Flag, MoreHorizontal, Trash2 } from 'lucide-react';
import { FONT_DISPLAY, IconButton } from './ui';
import { isGoalSuccess } from '../lib/core';

function PortalMenu({ open, anchorRef, onClose, children }) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (open && anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
  }, [open, anchorRef]);
  if (!open || !pos) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="bg-surface border border-default rounded-md shadow-xl py-1 min-w-[160px]"
        style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 50 }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

export function LtgGroup({ ltg, goals, collapsed, onToggleCollapse, onToggleGoal, onEditGoal, onDeleteGoal, onRenameLtg, onArchiveLtg, renderGoal }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(ltg.title);
  const ltgMenuRef = useRef(null);
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
        <div ref={ltgMenuRef}>
          <IconButton onClick={() => setMenuOpen(v => !v)} title="Group menu"><MoreHorizontal size={16} /></IconButton>
          <PortalMenu open={menuOpen} anchorRef={ltgMenuRef} onClose={() => setMenuOpen(false)}>
            <button onClick={() => { setRenaming(true); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-cream hover-bg-surface-2 flex items-center gap-2">
              <Edit2 size={14} /> Rename
            </button>
            <button onClick={() => { onArchiveLtg(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-cream hover-bg-surface-2 flex items-center gap-2">
              <Archive size={14} /> Archive
            </button>
          </PortalMenu>
        </div>
      </div>
      {!collapsed && (
        <div>
          {goals.length === 0 ? (
            <div className="px-4 py-4 text-xs text-muted italic">No goals under this long-term goal yet.</div>
          ) : (
            goals.map(g => (
              renderGoal
                ? renderGoal(g)
                : <GoalRow key={g.id} goal={g} onToggle={() => onToggleGoal(g.id)} onEdit={() => onEditGoal(g)} onDelete={() => onDeleteGoal(g.id)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function GoalRow({ goal, onToggle, onEdit, onDelete, readOnly = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const goalMenuRef = useRef(null);
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
      {goal.endDate && (
        <span className="text-[10px] uppercase tracking-widest text-faint whitespace-nowrap">
          {new Date(goal.endDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}
      <span className="text-[10px] uppercase tracking-widest text-faint">
        {goal.type === 'avoidance' ? 'avoid' : ''}
      </span>
      {!readOnly && (
        <div ref={goalMenuRef}>
          <IconButton onClick={() => setMenuOpen(v => !v)} title="Goal menu"><MoreHorizontal size={14} /></IconButton>
          <PortalMenu open={menuOpen} anchorRef={goalMenuRef} onClose={() => setMenuOpen(false)}>
            <button onClick={() => { onEdit(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-cream hover-bg-surface-2 flex items-center gap-2">
              <Edit2 size={14} /> Edit
            </button>
            <button onClick={() => { if (confirm('Delete this goal?')) onDelete(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-danger-strong hover-bg-surface-2 flex items-center gap-2">
              <Trash2 size={14} /> Delete
            </button>
          </PortalMenu>
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

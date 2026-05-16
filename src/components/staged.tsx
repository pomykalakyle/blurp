// @ts-nocheck
import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Modal } from './ui';

export function computeStagedView(ltgs, stagedLtgs, stagedGoals) {
  const ltgByTitle = new Map();
  Object.values(ltgs).filter(l => l.status === 'active').forEach(l => {
    ltgByTitle.set(l.title.toLowerCase(), { title: l.title, isStaged: false, isNew: false });
  });
  stagedLtgs.forEach((sl, idx) => {
    ltgByTitle.set(sl.title.toLowerCase(), { title: sl.title, isStaged: true, isNew: true, stagedIdx: idx });
  });
  const groupedGoals = new Map();
  const standalone = [];
  stagedGoals.forEach((g, idx) => {
    const goalWithIdx = { ...g, stagedIdx: idx };
    const key = g.longTermGoalTitle ? g.longTermGoalTitle.toLowerCase() : null;
    if (key && ltgByTitle.has(key)) {
      if (!groupedGoals.has(key)) groupedGoals.set(key, []);
      groupedGoals.get(key).push(goalWithIdx);
    } else {
      standalone.push(goalWithIdx);
    }
  });
  const groups = [];
  for (const [key, ltgData] of ltgByTitle) {
    const goals = groupedGoals.get(key) || [];
    if (ltgData.isNew || goals.length > 0) {
      groups.push({ ltg: ltgData, goals });
    }
  }
  return { groups, standalone };
}

export function StagedGoalRow({ goal, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(goal.title);

  const startEdit = () => { setEditText(goal.title); setEditing(true); };
  const saveEdit = () => {
    const v = editText.trim();
    if (v && v !== goal.title) onRename(v);
    setEditing(false);
  };

  return (
    <div className="group flex items-center gap-2">
      <Plus size={10} className="text-accent flex-shrink-0" />
      {editing ? (
        <input autoFocus value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') { setEditText(goal.title); setEditing(false); }
          }}
          className="flex-1 bg-base border border-default rounded px-2 py-1 text-sm text-cream outline-none focus-border-accent" />
      ) : (
        <button onClick={startEdit} className="flex-1 text-left text-sm text-cream leading-snug hover-text-accent">
          {goal.title}
        </button>
      )}
      {goal.type === 'avoidance' && (
        <span className="text-[10px] uppercase tracking-widest text-faint flex-shrink-0">avoid</span>
      )}
      <button onClick={onRemove} title="Remove from staging"
        className="opacity-0 group-hover:opacity-100 text-muted hover-text-danger transition-opacity flex-shrink-0">
        <X size={12} />
      </button>
    </div>
  );
}

export function StagedLtgHeader({ ltg, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(ltg.title);

  const startEdit = () => { setEditText(ltg.title); setEditing(true); };
  const saveEdit = () => {
    const v = editText.trim();
    if (v && v !== ltg.title) onRename(v);
    setEditing(false);
  };

  return (
    <div className="group flex items-center gap-1.5 mb-2 pb-1 border-b border-soft">
      {editing && ltg.isStaged ? (
        <input autoFocus value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') { setEditText(ltg.title); setEditing(false); }
          }}
          className="flex-1 bg-base border border-default rounded px-2 py-0.5 text-xs uppercase tracking-widest text-cream outline-none focus-border-accent" />
      ) : ltg.isStaged ? (
        <button onClick={startEdit} className="flex-1 text-left text-xs uppercase tracking-widest text-cream hover-text-accent">
          {ltg.title}
        </button>
      ) : (
        <span className="text-xs uppercase tracking-widest text-cream flex-1">{ltg.title}</span>
      )}
      {ltg.isNew && (
        <span className="text-[9px] uppercase tracking-widest text-accent-strong flex-shrink-0">new</span>
      )}
      {ltg.isStaged && (
        <button onClick={onRemove} title="Remove from staging"
          className="opacity-0 group-hover:opacity-100 text-muted hover-text-danger transition-opacity flex-shrink-0">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function AddStagedGoalModal({ open, onClose, allLtgTitles, onAddGoal, onAddLtg }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('achievement');
  const [parent, setParent] = useState('');
  const [creatingLtg, setCreatingLtg] = useState(false);
  const [newLtgTitle, setNewLtgTitle] = useState('');

  useEffect(() => {
    if (open) { setTitle(''); setType('achievement'); setParent(''); setCreatingLtg(false); setNewLtgTitle(''); }
  }, [open]);

  const submit = () => {
    if (!title.trim()) return;
    let useParent = parent || null;
    if (creatingLtg && newLtgTitle.trim()) {
      onAddLtg({ title: newLtgTitle.trim() });
      useParent = newLtgTitle.trim();
    }
    onAddGoal({ title: title.trim(), type, longTermGoalTitle: useParent });
    onClose();
  };

  const inputCls = "w-full bg-base border border-default rounded-md px-3 py-2 text-cream placeholder-faint outline-none focus-border-accent";

  return (
    <Modal open={open} onClose={onClose} title="Stage goal for next week">
      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Goal</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'achievement' ? 'Do what...' : "Don't do what..."}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setType('achievement')}
              className={`px-3 py-2 rounded-md text-sm text-left border transition-colors ${type === 'achievement' ? 'border-accent bg-accent-tint text-cream' : 'border-default text-muted hover-bg-surface-soft'}`}>
              <div className="font-medium">Achievement</div>
              <div className="text-xs text-muted mt-0.5">Do X this week</div>
            </button>
            <button type="button" onClick={() => setType('avoidance')}
              className={`px-3 py-2 rounded-md text-sm text-left border transition-colors ${type === 'avoidance' ? 'border-accent bg-accent-tint text-cream' : 'border-default text-muted hover-bg-surface-soft'}`}>
              <div className="font-medium">Avoidance</div>
              <div className="text-xs text-muted mt-0.5">Don't do X this week</div>
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Long-term goal (optional)</label>
          {!creatingLtg ? (
            <div className="flex gap-2">
              <select value={parent} onChange={(e) => setParent(e.target.value)}
                className="flex-1 bg-base border border-default rounded-md px-3 py-2 text-cream outline-none focus-border-accent">
                <option value="">None</option>
                {allLtgTitles.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <Button variant="subtle" size="sm" onClick={() => setCreatingLtg(true)}>
                <Plus size={14} /> New
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input autoFocus value={newLtgTitle} onChange={(e) => setNewLtgTitle(e.target.value)}
                placeholder="e.g. Health, Get stronger" className={inputCls} />
              <Button variant="ghost" size="sm" onClick={() => { setCreatingLtg(false); setNewLtgTitle(''); }}>Cancel</Button>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim()}>Stage goal</Button>
        </div>
      </div>
    </Modal>
  );
}

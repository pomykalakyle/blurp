// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { Button, FONT_DISPLAY, Modal } from '../components/ui';
import { GoalRow, LtgGroup } from '../components/goals';
import { daysOpenSince, formatWeekLabel, formatWeekShort, isWeekendReady } from '../lib/core';

export function ThisWeekScreen({ week, ltgs, onToggleGoal, onAddGoal, onUpdateGoal, onDeleteGoal, onAddLtg, onUpdateLtg, onArchiveLtg, onOpenReview }) {
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addLtgOpen, setAddLtgOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState({});

  const activeLtgs = useMemo(() => Object.values(ltgs).filter(l => l.status === 'active'), [ltgs]);
  const goalsByLtg = useMemo(() => {
    const m = new Map();
    activeLtgs.forEach(l => m.set(l.id, []));
    const standalone = [];
    for (const g of week.goals) {
      if (g.longTermGoalId && m.has(g.longTermGoalId)) m.get(g.longTermGoalId).push(g);
      else standalone.push(g);
    }
    return { byLtg: m, standalone };
  }, [week.goals, activeLtgs]);

  const daysOpen = daysOpenSince(week.startDate);
  const reviewProminent = isWeekendReady(week.startDate);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 pt-8 pb-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted mb-1">{week.id}</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-cream leading-tight" style={{ fontFamily: FONT_DISPLAY }}>
            {formatWeekShort(week.id)}
          </h1>
          <p className="text-sm text-muted mt-2">
            Day {daysOpen}{daysOpen > 10 ? ` (review overdue)` : ''} · {formatWeekLabel(week.id)}
          </p>
        </div>
        <Button onClick={onOpenReview} variant={reviewProminent ? 'primary' : 'outline'}>
          <Sparkles size={16} />Review week
        </Button>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-widest text-muted">Goals</h2>
          <button onClick={() => setAddLtgOpen(true)} className="text-xs text-muted hover-text-accent transition-colors flex items-center gap-1">
            <Plus size={12} /> New long-term goal
          </button>
        </div>

        {activeLtgs.length === 0 && goalsByLtg.standalone.length === 0 && (
          <div className="border border-dashed border-default rounded-lg p-8 text-center text-muted">
            <p className="mb-3">No goals yet for this week.</p>
            <Button onClick={() => setAddGoalOpen(true)} variant="subtle" size="sm">
              <Plus size={14} /> Add your first goal
            </Button>
          </div>
        )}

        {activeLtgs.map(ltg => {
          const goals = goalsByLtg.byLtg.get(ltg.id) || [];
          const isCollapsed = collapsed[ltg.id];
          return (
            <LtgGroup key={ltg.id} ltg={ltg} goals={goals} collapsed={isCollapsed}
              onToggleCollapse={() => setCollapsed(c => ({ ...c, [ltg.id]: !c[ltg.id] }))}
              onToggleGoal={onToggleGoal} onEditGoal={setEditingGoal} onDeleteGoal={onDeleteGoal}
              onRenameLtg={(t) => onUpdateLtg(ltg.id, { title: t })}
              onArchiveLtg={() => onArchiveLtg(ltg.id)} />
          );
        })}

        {goalsByLtg.standalone.length > 0 && (
          <div className="border border-soft rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-surface-soft border-b border-soft">
              <span className="text-xs uppercase tracking-widest text-muted">Other goals</span>
            </div>
            <div>
              {goalsByLtg.standalone.map(g => (
                <GoalRow key={g.id} goal={g} onToggle={() => onToggleGoal(g.id)} onEdit={() => setEditingGoal(g)} onDelete={() => onDeleteGoal(g.id)} />
              ))}
            </div>
          </div>
        )}

        {Object.values(ltgs).some(l => l.status === 'archived') && (
          <div className="pt-4">
            <button onClick={() => setShowArchived(s => !s)} className="text-xs text-muted hover-text-cream flex items-center gap-1">
              {showArchived ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Archived long-term goals
            </button>
            {showArchived && (
              <div className="mt-2 space-y-1">
                {Object.values(ltgs).filter(l => l.status === 'archived').map(l => (
                  <div key={l.id} className="flex items-center justify-between px-3 py-2 text-sm text-muted">
                    <span>{l.title}</span>
                    <button onClick={() => onUpdateLtg(l.id, { status: 'active' })} className="text-xs text-dim hover-text-accent">Unarchive</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <button onClick={() => setAddGoalOpen(true)} aria-label="Add goal"
        className="fixed bottom-24 md:bottom-8 right-6 md:right-8 w-14 h-14 rounded-full fab-shadow transition-colors flex items-center justify-center z-20"
        style={{ backgroundColor: 'var(--c-accent)', color: 'var(--c-accent-text)' }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--c-accent-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--c-accent)'}>
        <Plus size={24} />
      </button>

      <AddGoalModal open={addGoalOpen} onClose={() => setAddGoalOpen(false)} ltgs={activeLtgs} onAdd={onAddGoal} onAddLtg={onAddLtg} />
      <AddLtgModal open={addLtgOpen} onClose={() => setAddLtgOpen(false)} onAdd={(title, desc) => { onAddLtg(title, desc); setAddLtgOpen(false); }} />
      <EditGoalModal open={!!editingGoal} goal={editingGoal} ltgs={activeLtgs}
        onClose={() => setEditingGoal(null)}
        onSave={(updates) => { onUpdateGoal(editingGoal.id, updates); setEditingGoal(null); }} />
    </div>
  );
}

export function AddGoalModal({ open, onClose, ltgs, onAdd, onAddLtg }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('achievement');
  const [ltgId, setLtgId] = useState('');
  const [newLtgTitle, setNewLtgTitle] = useState('');
  const [creatingLtg, setCreatingLtg] = useState(false);
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');

  useEffect(() => {
    if (open) { setTitle(''); setType('achievement'); setLtgId(''); setNewLtgTitle(''); setCreatingLtg(false); setDescription(''); setTargetDate(''); }
  }, [open]);

  const submit = async () => {
    if (!title.trim()) return;
    let useLtgId = ltgId || null;
    if (creatingLtg && newLtgTitle.trim()) {
      const ltg = await onAddLtg(newLtgTitle.trim());
      useLtgId = ltg.id;
    }
    onAdd({
      title: title.trim(),
      type,
      longTermGoalId: useLtgId,
      description: description.trim() || null,
      targetDate: targetDate || null,
    });
    onClose();
  };

  const inputCls = "w-full bg-base border border-default rounded-md px-3 py-2 text-cream placeholder-faint outline-none focus-border-accent";

  return (
    <Modal open={open} onClose={onClose} title="New goal">
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
              <div className="text-xs text-muted mt-0.5">Do X by the target date</div>
            </button>
            <button type="button" onClick={() => setType('avoidance')}
              className={`px-3 py-2 rounded-md text-sm text-left border transition-colors ${type === 'avoidance' ? 'border-accent bg-accent-tint text-cream' : 'border-default text-muted hover-bg-surface-soft'}`}>
              <div className="font-medium">Avoidance</div>
              <div className="text-xs text-muted mt-0.5">Don't do X through the target</div>
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Long-term goal (optional)</label>
          {!creatingLtg ? (
            <div className="flex gap-2">
              <select value={ltgId} onChange={(e) => setLtgId(e.target.value)}
                className="flex-1 bg-base border border-default rounded-md px-3 py-2 text-cream outline-none focus-border-accent">
                <option value="">None (Other goals)</option>
                {ltgs.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
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
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What this goal is about — scoping, context, why..." rows={2}
            className={`${inputCls} resize-none`} />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Target date (optional)</label>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim()}>Add goal</Button>
        </div>
      </div>
    </Modal>
  );
}

export function AddLtgModal({ open, onClose, onAdd }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  useEffect(() => { if (open) { setTitle(''); setDesc(''); } }, [open]);
  const submit = () => { if (!title.trim()) return; onAdd(title.trim(), desc.trim()); };
  const inputCls = "w-full bg-base border border-default rounded-md px-3 py-2 text-cream placeholder-faint outline-none focus-border-accent";
  return (
    <Modal open={open} onClose={onClose} title="New long-term goal">
      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Title</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Health, Get stronger, Ship side project..." className={inputCls} />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Description (optional)</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="What this means, why it matters..." rows={3}
            className={`${inputCls} resize-none`} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim()}>Add</Button>
        </div>
      </div>
    </Modal>
  );
}

export function EditGoalModal({ open, goal, ltgs, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [ltgId, setLtgId] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [targetDate, setTargetDate] = useState('');
  useEffect(() => {
    if (open && goal) {
      setTitle(goal.title);
      setLtgId(goal.longTermGoalId || '');
      setDescription(goal.description || '');
      setNotes(goal.notes || '');
      setTargetDate(goal.targetDate || '');
    }
  }, [open, goal]);
  if (!goal) return null;
  const submit = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      longTermGoalId: ltgId || null,
      description: description.trim() || null,
      notes: notes.trim() || null,
      targetDate: targetDate || null,
    });
  };
  const inputCls = "w-full bg-base border border-default rounded-md px-3 py-2 text-cream outline-none focus-border-accent";
  return (
    <Modal open={open} onClose={onClose} title="Edit goal">
      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Goal</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Long-term goal</label>
          <select value={ltgId} onChange={(e) => setLtgId(e.target.value)} className={inputCls}>
            <option value="">None (Other goals)</option>
            {ltgs.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What this goal is about" rows={2}
            className={`${inputCls} resize-none`} />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Running commentary — added as the goal progresses" rows={3}
            className={`${inputCls} resize-none`} />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Target date (optional)</label>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}


// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical, Loader2, Plus } from 'lucide-react';
import { Button, FONT_DISPLAY } from '../components/ui';
import { GoalRow, LtgGroup } from '../components/goals';
import { AddGoalModal, AddLtgModal, EditGoalModal } from './ThisWeekScreen';

function compareUrgency(a, b) {
  const aDated = !!a.targetDate;
  const bDated = !!b.targetDate;
  if (aDated && bDated) return a.targetDate.localeCompare(b.targetDate);
  if (aDated) return -1;
  if (bDated) return 1;
  return b._creationTime - a._creationTime;
}

function sortGoalsForDisplay(goals, showResolved) {
  const open = [];
  const resolved = [];
  for (const g of goals) {
    if (g.resolvedAt != null) resolved.push(g);
    else open.push(g);
  }
  open.sort(compareUrgency);
  resolved.sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
  return showResolved ? [...open, ...resolved] : open;
}

function SortableLtgSection({ ltg, goals, collapsed, onToggleCollapse, onToggleGoal, onEditGoal, onDeleteGoal, onRenameLtg, onArchiveLtg }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ltg.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const handle = (
    <button
      {...attributes}
      {...listeners}
      className="text-muted hover-text-cream cursor-grab active:cursor-grabbing"
      title="Drag to reorder"
      aria-label="Drag to reorder"
      style={{ touchAction: 'none' }}
    >
      <GripVertical size={14} />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style}>
      <LtgGroup
        ltg={ltg}
        goals={goals}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        onToggleGoal={onToggleGoal}
        onEditGoal={onEditGoal}
        onDeleteGoal={onDeleteGoal}
        onRenameLtg={onRenameLtg}
        onArchiveLtg={onArchiveLtg}
        dragHandle={handle}
      />
    </div>
  );
}

export function GoalsScreen({ onNewChat }: { onNewChat?: () => void } = {}) {
  const ltgsRaw = useQuery(api.longTermGoals.list);
  const goalsRaw = useQuery(api.goals.list);
  const createLtg = useMutation(api.longTermGoals.create);
  const updateLtgM = useMutation(api.longTermGoals.update);
  const endLtg = useMutation(api.longTermGoals.end);
  const reopenLtg = useMutation(api.longTermGoals.reopen);
  const reorderLtgs = useMutation(api.longTermGoals.reorder);
  const createGoal = useMutation(api.goals.create);
  const updateGoalM = useMutation(api.goals.update);
  const resolveGoalM = useMutation(api.goals.resolve);
  const removeGoalM = useMutation(api.goals.remove);

  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addLtgOpen, setAddLtgOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showResolvedA, setShowResolvedA] = useState(false);
  const [showResolvedB, setShowResolvedB] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [activePane, setActivePane] = useState(0);

  const scrollerRef = useRef(null);

  const loading = ltgsRaw === undefined || goalsRaw === undefined;

  const ltgs = useMemo(() => {
    if (!ltgsRaw) return [];
    return ltgsRaw.map(l => ({
      id: l._id,
      title: l.title,
      description: l.description,
      notes: l.notes ?? null,
      status: l.endedAt === null ? 'active' : 'archived',
      order: l.order ?? l._creationTime,
      _creationTime: l._creationTime,
    }));
  }, [ltgsRaw]);

  const goals = useMemo(() => {
    if (!goalsRaw) return [];
    return goalsRaw.map(g => ({
      id: g._id,
      title: g.title,
      type: g.type,
      longTermGoalId: g.longTermGoalId,
      description: g.description ?? null,
      notes: g.notes ?? null,
      targetDate: g.targetDate ?? null,
      resolvedAt: g.resolvedAt ?? null,
      _creationTime: g._creationTime,
    }));
  }, [goalsRaw]);

  const activeLtgs = useMemo(
    () => ltgs.filter(l => l.status === 'active').sort((a, b) => a.order - b.order),
    [ltgs],
  );

  const archivedLtgs = useMemo(
    () => ltgs.filter(l => l.status === 'archived').sort((a, b) => a.order - b.order),
    [ltgs],
  );

  const ltgTitleById = useMemo(() => {
    const m = new Map();
    for (const l of ltgs) m.set(l.id, l.title);
    return m;
  }, [ltgs]);

  // Pane A: flat urgency-sorted list of ALL goals (with and without LTG).
  const { paneAGoals, paneAResolvedCount } = useMemo(() => {
    const open = [];
    const resolved = [];
    for (const g of goals) {
      if (g.resolvedAt != null) resolved.push(g);
      else open.push(g);
    }
    open.sort(compareUrgency);
    resolved.sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
    return {
      paneAGoals: showResolvedA ? [...open, ...resolved] : open,
      paneAResolvedCount: resolved.length,
    };
  }, [goals, showResolvedA]);

  // Pane B: goals grouped by LTG.
  const goalsByLtg = useMemo(() => {
    const m = new Map();
    for (const l of ltgs) m.set(l.id, []);
    for (const g of goals) {
      if (g.longTermGoalId && m.has(g.longTermGoalId)) {
        m.get(g.longTermGoalId).push(g);
      }
    }
    return m;
  }, [goals, ltgs]);

  const paneBResolvedCount = useMemo(() => {
    let c = 0;
    for (const g of goals) {
      if (g.longTermGoalId && g.resolvedAt != null) c++;
    }
    return c;
  }, [goals]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleLtgDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = activeLtgs.map(l => l.id);
    const fromIdx = ids.indexOf(active.id);
    const toIdx = ids.indexOf(over.id);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...ids];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, active.id);
    reorderLtgs({ ids: next });
  };

  const handleToggleGoal = (gid) => {
    const g = goals.find(x => x.id === gid);
    if (!g) return;
    if (g.resolvedAt != null) updateGoalM({ id: gid, resolvedAt: null });
    else resolveGoalM({ id: gid });
  };
  const handleAddGoal = (g) => createGoal({
    title: g.title,
    type: g.type,
    longTermGoalId: g.longTermGoalId || null,
    description: g.description ?? null,
    targetDate: g.targetDate ?? null,
  });
  const handleUpdateGoal = (gid, updates) => updateGoalM({
    id: gid,
    title: updates.title,
    longTermGoalId: updates.longTermGoalId,
    description: updates.description,
    notes: updates.notes,
    targetDate: updates.targetDate,
  });
  const handleDeleteGoal = (gid) => removeGoalM({ id: gid });
  const handleAddLtg = async (title, description = '') => {
    const id = await createLtg({ title, description, notes: null });
    return { id, title, description, status: 'active' };
  };
  const handleRenameLtg = (id, title) => updateLtgM({ id, title });
  const handleArchiveLtg = (id) => endLtg({ id });
  const handleUnarchiveLtg = (id) => reopenLtg({ id });

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activePane) setActivePane(idx);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-dim">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  // ------- Pane A: flat all-goals list -------
  const paneA = (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">All goals</h2>
        {paneAResolvedCount > 0 && (
          <button
            onClick={() => setShowResolvedA(s => !s)}
            className="text-xs text-muted hover-text-cream transition-colors"
          >
            {showResolvedA ? 'Hide resolved' : `Show resolved (${paneAResolvedCount})`}
          </button>
        )}
      </div>

      {paneAGoals.length === 0 ? (
        <div className="border border-dashed border-default rounded-lg p-8 text-center text-muted">
          <p className="mb-3">No goals yet.</p>
          <Button onClick={() => setAddGoalOpen(true)} variant="subtle" size="sm">
            <Plus size={14} /> Add your first goal
          </Button>
        </div>
      ) : (
        <div className="border border-soft rounded-lg overflow-hidden">
          {paneAGoals.map(g => (
            <GoalRow
              key={g.id}
              goal={g}
              ltgLabel={g.longTermGoalId ? ltgTitleById.get(g.longTermGoalId) ?? null : null}
              onToggle={() => handleToggleGoal(g.id)}
              onEdit={() => setEditingGoal(g)}
              onDelete={() => handleDeleteGoal(g.id)}
            />
          ))}
        </div>
      )}
    </section>
  );

  // ------- Pane B: LTG-grouped view -------
  const paneB = (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">By long-term goal</h2>
        <div className="flex items-center gap-3">
          {paneBResolvedCount > 0 && (
            <button
              onClick={() => setShowResolvedB(s => !s)}
              className="text-xs text-muted hover-text-cream transition-colors"
            >
              {showResolvedB ? 'Hide resolved' : `Show resolved (${paneBResolvedCount})`}
            </button>
          )}
          <button
            onClick={() => setAddLtgOpen(true)}
            className="text-xs text-muted hover-text-accent transition-colors flex items-center gap-1"
          >
            <Plus size={12} /> New
          </button>
        </div>
      </div>

      {activeLtgs.length === 0 && archivedLtgs.length === 0 ? (
        <div className="border border-dashed border-default rounded-lg p-8 text-center text-muted">
          <p className="mb-3">No long-term goals yet.</p>
          <Button onClick={() => setAddLtgOpen(true)} variant="subtle" size="sm">
            <Plus size={14} /> Add a long-term goal
          </Button>
        </div>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLtgDragEnd}>
            <SortableContext items={activeLtgs.map(l => l.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {activeLtgs.map(ltg => {
                  const ltgGoals = sortGoalsForDisplay(goalsByLtg.get(ltg.id) || [], showResolvedB);
                  return (
                    <SortableLtgSection
                      key={ltg.id}
                      ltg={ltg}
                      goals={ltgGoals}
                      collapsed={!!collapsed[ltg.id]}
                      onToggleCollapse={() => setCollapsed(c => ({ ...c, [ltg.id]: !c[ltg.id] }))}
                      onToggleGoal={handleToggleGoal}
                      onEditGoal={setEditingGoal}
                      onDeleteGoal={handleDeleteGoal}
                      onRenameLtg={(t) => handleRenameLtg(ltg.id, t)}
                      onArchiveLtg={() => handleArchiveLtg(ltg.id)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

          {archivedLtgs.length > 0 && (
            <div className="pt-2 space-y-3">
              <div className="text-xs uppercase tracking-widest text-faint">Archived</div>
              {archivedLtgs.map(ltg => {
                const ltgGoals = sortGoalsForDisplay(goalsByLtg.get(ltg.id) || [], showResolvedB);
                return (
                  <LtgGroup
                    key={ltg.id}
                    ltg={ltg}
                    goals={ltgGoals}
                    collapsed={collapsed[ltg.id] !== false}
                    onToggleCollapse={() => setCollapsed(c => ({ ...c, [ltg.id]: c[ltg.id] === false }))}
                    onToggleGoal={handleToggleGoal}
                    onEditGoal={setEditingGoal}
                    onDeleteGoal={handleDeleteGoal}
                    onRenameLtg={(t) => handleRenameLtg(ltg.id, t)}
                    onArchiveLtg={() => handleArchiveLtg(ltg.id)}
                    onUnarchiveLtg={() => handleUnarchiveLtg(ltg.id)}
                    dimmed
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );

  return (
    <>
      <main className="max-w-6xl mx-auto px-4 md:px-10 pt-8 pb-10">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl md:text-4xl font-semibold text-cream leading-tight" style={{ fontFamily: FONT_DISPLAY }}>
            Goals
          </h1>
          <div className="md:hidden flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{ backgroundColor: activePane === 0 ? 'var(--c-accent)' : 'var(--c-text-faint)' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{ backgroundColor: activePane === 1 ? 'var(--c-accent)' : 'var(--c-text-faint)' }}
            />
          </div>
        </header>

        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="
            flex overflow-x-auto snap-x snap-mandatory gap-4 -mx-4 px-4
            md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:snap-none md:mx-0 md:px-0
          "
          style={{ scrollbarWidth: 'none' }}
        >
          <div className="snap-center shrink-0 w-full md:w-auto min-w-0">{paneA}</div>
          <div className="snap-center shrink-0 w-full md:w-auto min-w-0">{paneB}</div>
        </div>

        <button onClick={() => onNewChat?.()} aria-label="Start a new chat"
          className="fixed bottom-8 right-6 md:right-8 w-14 h-14 rounded-full fab-shadow transition-colors flex items-center justify-center z-20"
          style={{ backgroundColor: 'var(--c-accent)', color: 'var(--c-accent-text)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--c-accent-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--c-accent)'}>
          <Plus size={24} />
        </button>

        <AddGoalModal open={addGoalOpen} onClose={() => setAddGoalOpen(false)} ltgs={activeLtgs} onAdd={handleAddGoal} onAddLtg={handleAddLtg} />
        <AddLtgModal open={addLtgOpen} onClose={() => setAddLtgOpen(false)} onAdd={(title, desc) => { handleAddLtg(title, desc); setAddLtgOpen(false); }} />
        <EditGoalModal open={!!editingGoal} goal={editingGoal} ltgs={activeLtgs}
          onClose={() => setEditingGoal(null)}
          onSave={(updates) => { handleUpdateGoal(editingGoal.id, updates); setEditingGoal(null); }} />
      </main>
    </>
  );
}

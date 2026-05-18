// @ts-nocheck
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Loader2, Plus } from 'lucide-react';
import { Button, FONT_DISPLAY } from '../components/ui';
import { GoalRow, LtgGroup } from '../components/goals';
import { AddGoalModal, AddLtgModal, EditGoalModal } from './ThisWeekScreen';

function DraggableGoal({ goal, onToggle, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: goal.id });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'manipulation',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <GoalRow goal={goal} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function DroppableZone({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const style = isOver
    ? { outline: '2px solid var(--c-accent)', outlineOffset: '2px', borderRadius: '8px' }
    : undefined;
  return (
    <div ref={setNodeRef} style={style}>
      {children}
    </div>
  );
}

export function GoalsScreen() {
  const ltgsRaw = useQuery(api.longTermGoals.list);
  const goalsRaw = useQuery(api.goals.list);
  const createLtg = useMutation(api.longTermGoals.create);
  const updateLtgM = useMutation(api.longTermGoals.update);
  const endLtg = useMutation(api.longTermGoals.end);
  const reopenLtg = useMutation(api.longTermGoals.reopen);
  const createGoal = useMutation(api.goals.create);
  const updateGoalM = useMutation(api.goals.update);
  const resolveGoalM = useMutation(api.goals.resolve);
  const unresolveGoalM = useMutation(api.goals.unresolve);
  const removeGoalM = useMutation(api.goals.remove);

  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addLtgOpen, setAddLtgOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [toast, setToast] = useState('');

  const loading = ltgsRaw === undefined || goalsRaw === undefined;

  const ltgs = useMemo(() => {
    const m = {};
    if (!ltgsRaw) return m;
    for (const l of ltgsRaw) {
      m[l._id] = {
        id: l._id,
        title: l.title,
        description: l.description,
        notes: l.notes ?? null,
        status: l.endedAt === null ? 'active' : 'archived',
      };
    }
    return m;
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
    }));
  }, [goalsRaw]);

  const activeLtgs = useMemo(
    () => Object.values(ltgs).filter(l => l.status === 'active'),
    [ltgs],
  );

  const goalsByLtg = useMemo(() => {
    const m = new Map();
    activeLtgs.forEach(l => m.set(l.id, []));
    const standalone = [];
    for (const g of goals) {
      if (g.longTermGoalId && m.has(g.longTermGoalId)) m.get(g.longTermGoalId).push(g);
      else standalone.push(g);
    }
    return { byLtg: m, standalone };
  }, [goals, activeLtgs]);

  const handleToggleGoal = (gid) => {
    const g = goals.find(x => x.id === gid);
    if (!g) return;
    if (g.resolvedAt != null) {
      // Already resolved — reopen.
      unresolveGoalM({ id: gid });
    } else {
      // Resolve. For achievements this marks complete; for avoidances, slipped.
      resolveGoalM({ id: gid });
    }
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
  const handleUpdateLtg = (id, updates) => {
    if (updates.status === 'archived') return endLtg({ id });
    if (updates.status === 'active') return reopenLtg({ id });
    return updateLtgM({ id, ...updates });
  };
  const handleArchiveLtg = (id) => endLtg({ id });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    const g = goals.find(x => x.id === active.id);
    if (!g) return;
    const newLtgId = over.id === 'standalone' ? null : over.id;
    if (g.longTermGoalId === newLtgId) return;
    updateGoalM({ id: g.id, longTermGoalId: newLtgId });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-dim">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  return (
    <>
      <main className="max-w-3xl mx-auto px-4 md:px-10 pt-8 pb-10">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-semibold text-cream leading-tight" style={{ fontFamily: FONT_DISPLAY }}>
            Goals
          </h1>
        </header>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-widest text-muted">Active</h2>
            <button onClick={() => setAddLtgOpen(true)} className="text-xs text-muted hover-text-accent transition-colors flex items-center gap-1">
              <Plus size={12} /> New long-term goal
            </button>
          </div>

          {activeLtgs.length === 0 && goalsByLtg.standalone.length === 0 && (
            <div className="border border-dashed border-default rounded-lg p-8 text-center text-muted">
              <p className="mb-3">No goals yet.</p>
              <Button onClick={() => setAddGoalOpen(true)} variant="subtle" size="sm">
                <Plus size={14} /> Add your first goal
              </Button>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
            {activeLtgs.map(ltg => {
              const ltgGoals = goalsByLtg.byLtg.get(ltg.id) || [];
              const isCollapsed = collapsed[ltg.id];
              return (
                <DroppableZone key={ltg.id} id={ltg.id}>
                  <LtgGroup ltg={ltg} goals={ltgGoals} collapsed={isCollapsed}
                    onToggleCollapse={() => setCollapsed(c => ({ ...c, [ltg.id]: !c[ltg.id] }))}
                    onToggleGoal={handleToggleGoal} onEditGoal={setEditingGoal} onDeleteGoal={handleDeleteGoal}
                    onRenameLtg={(t) => handleUpdateLtg(ltg.id, { title: t })}
                    onArchiveLtg={() => handleArchiveLtg(ltg.id)}
                    renderGoal={(g) => (
                      <DraggableGoal key={g.id} goal={g}
                        onToggle={() => handleToggleGoal(g.id)}
                        onEdit={() => setEditingGoal(g)}
                        onDelete={() => handleDeleteGoal(g.id)} />
                    )} />
                </DroppableZone>
              );
            })}

            {goalsByLtg.standalone.length > 0 && (
              <DroppableZone id="standalone">
                <div className="border border-soft rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-surface-soft border-b border-soft">
                    <span className="text-xs uppercase tracking-widest text-muted">Other goals</span>
                  </div>
                  <div>
                    {goalsByLtg.standalone.map(g => (
                      <DraggableGoal key={g.id} goal={g}
                        onToggle={() => handleToggleGoal(g.id)}
                        onEdit={() => setEditingGoal(g)}
                        onDelete={() => handleDeleteGoal(g.id)} />
                    ))}
                  </div>
                </div>
              </DroppableZone>
            )}
          </DndContext>

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
                      <button onClick={() => handleUpdateLtg(l.id, { status: 'active' })} className="text-xs text-dim hover-text-accent">Unarchive</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <button onClick={() => setAddGoalOpen(true)} aria-label="Add goal"
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

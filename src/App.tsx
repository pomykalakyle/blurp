// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { Download, History as HistoryIcon, Home, Lightbulb, Loader2 } from 'lucide-react';
import { SEED_BACKLOG } from './constants';
import { FONT_BODY, FONT_DISPLAY, ThemeStyles, Toast } from './components/ui';
import { MobileTab, NavItem } from './components/navigation';
import { HistoryScreen } from './screens/HistoryScreen';
import { IdeasScreen } from './screens/IdeasScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { ThisWeekScreen } from './screens/ThisWeekScreen';
import { storage } from './lib/storage';
import { formatWeekShort, getISOWeekId, getNextWeekId, getWeekDateRange, now, todayISO, uid } from './lib/core';

export default function App() {
  const [meta, setMeta] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [ltgs, setLtgs] = useState({});
  const [pastWeeks, setPastWeeks] = useState({});
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('thisWeek');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    (async () => {
      let m = await storage.getMeta();
      if (!m) {
        const weekId = getISOWeekId();
        const { start } = getWeekDateRange(weekId);
        const week = {
          id: weekId,
          startDate: start.toISOString().slice(0, 10),
          endDate: null,
          status: 'in_progress',
          goals: [],
          narrative: { versions: [{ text: '', source: 'user', createdAt: now() }], currentIndex: 0 },
          reviewConversation: null,
          reviewedAt: null,
        };
        await storage.saveWeek(week);
        m = {
          schemaVersion: 2,
          longTermGoalIds: [],
          currentWeekId: weekId,
          weekIds: [weekId],
          backlog: SEED_BACKLOG.map(text => ({ id: uid(), text, createdAt: now() })),
        };
        await storage.saveMeta(m);
      }
      setMeta(m);
      const week = await storage.getWeek(m.currentWeekId);
      setCurrentWeek(week);
      const ltgEntries = await Promise.all(m.longTermGoalIds.map(id => storage.getLtg(id)));
      const ltgMap = {};
      ltgEntries.forEach(l => { if (l) ltgMap[l.id] = l; });
      setLtgs(ltgMap);
      setLoading(false);
    })().catch(err => { console.error(err); setLoading(false); });
  }, []);

  const updateMeta = useCallback((updater) => {
    setMeta(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      storage.saveMeta(next);
      return next;
    });
  }, []);

  const updateWeek = useCallback((updater) => {
    setCurrentWeek(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      storage.saveWeek(next);
      return next;
    });
  }, []);

  const addLtg = useCallback(async (title, description = '') => {
    const ltg = { id: 'ltg_' + uid(), title, description, status: 'active', createdAt: now() };
    await storage.saveLtg(ltg);
    setLtgs(prev => ({ ...prev, [ltg.id]: ltg }));
    setMeta(prev => {
      const next = { ...prev, longTermGoalIds: [...prev.longTermGoalIds, ltg.id] };
      storage.saveMeta(next);
      return next;
    });
    return ltg;
  }, []);

  const updateLtg = useCallback((id, updates) => {
    setLtgs(prev => {
      const ltg = prev[id]; if (!ltg) return prev;
      const next = { ...ltg, ...updates };
      storage.saveLtg(next);
      return { ...prev, [id]: next };
    });
  }, []);

  const archiveLtg = useCallback((id) => updateLtg(id, { status: 'archived' }), [updateLtg]);

  const addGoal = useCallback((g) => {
    updateWeek(w => ({
      ...w,
      goals: [...w.goals, {
        id: 'g_' + uid(), title: g.title, type: g.type,
        longTermGoalId: g.longTermGoalId || null,
        state: g.type === 'achievement' ? { done: false } : { slipped: false },
        notes: g.notes || null,
        createdAt: now(),
      }],
    }));
  }, [updateWeek]);

  const updateGoal = useCallback((gid, updates) => {
    updateWeek(w => ({ ...w, goals: w.goals.map(g => g.id === gid ? { ...g, ...updates } : g) }));
  }, [updateWeek]);

  const deleteGoal = useCallback((gid) => {
    updateWeek(w => ({ ...w, goals: w.goals.filter(g => g.id !== gid) }));
  }, [updateWeek]);

  const toggleGoalState = useCallback((gid) => {
    updateWeek(w => ({
      ...w,
      goals: w.goals.map(g => {
        if (g.id !== gid) return g;
        if (g.type === 'achievement') return { ...g, state: { done: !g.state?.done } };
        return { ...g, state: { slipped: !g.state?.slipped } };
      }),
    }));
  }, [updateWeek]);

  const setNarrativeText = useCallback((text) => {
    updateWeek(w => {
      const versions = [...w.narrative.versions];
      const cur = versions[w.narrative.currentIndex];
      if (cur && cur.source === 'user') {
        versions[w.narrative.currentIndex] = { ...cur, text };
      } else {
        versions.push({ text, source: 'user', createdAt: now() });
        return { ...w, narrative: { versions, currentIndex: versions.length - 1 } };
      }
      return { ...w, narrative: { ...w.narrative, versions } };
    });
  }, [updateWeek]);

  const addNarrativeVersion = useCallback((text, source, instruction) => {
    updateWeek(w => {
      const versions = [...w.narrative.versions, { text, source, instruction: instruction || undefined, createdAt: now() }];
      return { ...w, narrative: { versions, currentIndex: versions.length - 1 } };
    });
  }, [updateWeek]);

  const setReviewConversation = useCallback((messages) => {
    updateWeek(w => ({ ...w, reviewConversation: { messages } }));
  }, [updateWeek]);

  const addBacklogItem = useCallback((text) => {
    updateMeta(m => ({ ...m, backlog: [{ id: uid(), text, createdAt: now() }, ...m.backlog] }));
  }, [updateMeta]);
  const updateBacklogItem = useCallback((id, text) => {
    updateMeta(m => ({ ...m, backlog: m.backlog.map(b => b.id === id ? { ...b, text } : b) }));
  }, [updateMeta]);
  const deleteBacklogItem = useCallback((id) => {
    updateMeta(m => ({ ...m, backlog: m.backlog.filter(b => b.id !== id) }));
  }, [updateMeta]);

  const completeReview = useCallback(async ({ goalsToCarry, stagedNewGoals, stagedNewLtgs, stagedIdeas }) => {
    if (!currentWeek || !meta) return;
    const closedWeek = { ...currentWeek, status: 'reviewed', reviewedAt: now(), endDate: todayISO() };
    await storage.saveWeek(closedWeek);
    setPastWeeks(prev => ({ ...prev, [closedWeek.id]: closedWeek }));

    const titleToLtgId = {};
    Object.values(ltgs).forEach(l => { titleToLtgId[l.title.toLowerCase()] = l.id; });
    const newLtgIds = [];
    const newLtgsCreated = [];
    for (const sl of stagedNewLtgs) {
      const ltg = { id: 'ltg_' + uid(), title: sl.title, description: sl.description || '', status: 'active', createdAt: now() };
      await storage.saveLtg(ltg);
      newLtgIds.push(ltg.id);
      newLtgsCreated.push(ltg);
      titleToLtgId[ltg.title.toLowerCase()] = ltg.id;
    }

    const nextWeekId = getNextWeekId(currentWeek.id);
    const { start: nextStart } = getWeekDateRange(nextWeekId);
    const newWeek = {
      id: nextWeekId,
      startDate: nextStart.toISOString().slice(0, 10),
      endDate: null,
      status: 'in_progress',
      goals: [],
      narrative: { versions: [{ text: '', source: 'user', createdAt: now() }], currentIndex: 0 },
      reviewConversation: null,
      reviewedAt: null,
    };
    for (const g of currentWeek.goals) {
      if (!goalsToCarry.has(g.id)) continue;
      newWeek.goals.push({
        id: 'g_' + uid(), title: g.title, type: g.type,
        longTermGoalId: g.longTermGoalId,
        state: g.type === 'achievement' ? { done: false } : { slipped: false },
        notes: null, createdAt: now(),
      });
    }
    for (const sg of stagedNewGoals) {
      let ltgId = null;
      if (sg.longTermGoalTitle) ltgId = titleToLtgId[sg.longTermGoalTitle.toLowerCase()] || null;
      newWeek.goals.push({
        id: 'g_' + uid(), title: sg.title,
        type: sg.type === 'avoidance' ? 'avoidance' : 'achievement',
        longTermGoalId: ltgId,
        state: sg.type === 'avoidance' ? { slipped: false } : { done: false },
        notes: null, createdAt: now(),
      });
    }
    await storage.saveWeek(newWeek);

    const newMeta = {
      ...meta,
      currentWeekId: nextWeekId,
      weekIds: [...meta.weekIds.filter(id => id !== nextWeekId), nextWeekId],
      longTermGoalIds: [...meta.longTermGoalIds, ...newLtgIds],
      backlog: [...stagedIdeas.map(i => ({ id: uid(), text: i.text, createdAt: now() })), ...meta.backlog],
    };
    await storage.saveMeta(newMeta);

    setMeta(newMeta);
    setCurrentWeek(newWeek);
    setLtgs(prev => {
      const next = { ...prev };
      newLtgsCreated.forEach(l => { next[l.id] = l; });
      return next;
    });
    setReviewOpen(false);
    setToast('Week closed. New week started.');
  }, [currentWeek, meta, ltgs]);

  const loadPastWeek = useCallback(async (id) => {
    if (pastWeeks[id]) return pastWeeks[id];
    const w = await storage.getWeek(id);
    if (w) setPastWeeks(prev => ({ ...prev, [id]: w }));
    return w;
  }, [pastWeeks]);

  const exportAll = useCallback(async () => {
    const allWeeks = {};
    for (const wid of meta.weekIds) allWeeks[wid] = await storage.getWeek(wid);
    const dump = { schemaVersion: meta.schemaVersion, exportedAt: now(), meta, longTermGoals: ltgs, weeks: allWeeks };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `weekly-review-export-${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
    setToast('Export downloaded.');
  }, [meta, ltgs]);

  if (loading) {
    return (
      <div className="min-h-screen bg-base text-dim flex items-center justify-center">
        <ThemeStyles />
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base text-cream" style={{ fontFamily: FONT_BODY }}>
      <ThemeStyles />

      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 border-r border-soft bg-base flex-col p-4 z-10">
        <div className="mb-8 px-2">
          <h1 className="text-xl font-semibold text-cream" style={{ fontFamily: FONT_DISPLAY }}>Weekly Review</h1>
          <p className="text-xs text-muted mt-1">{formatWeekShort(currentWeek.id)}</p>
        </div>
        <div className="flex flex-col gap-1">
          <NavItem icon={Home} label="This Week" active={screen === 'thisWeek'} onClick={() => setScreen('thisWeek')} />
          <NavItem icon={HistoryIcon} label="History" active={screen === 'history'} onClick={() => setScreen('history')} />
          <NavItem icon={Lightbulb} label="Ideas" active={screen === 'ideas'} onClick={() => setScreen('ideas')} />
        </div>
        <div className="mt-auto px-2">
          <button onClick={exportAll} className="flex items-center gap-2 text-xs text-muted hover-text-cream transition-colors">
            <Download size={14} /> Export all data
          </button>
        </div>
      </nav>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-soft bg-base z-10 flex">
        <MobileTab icon={Home} label="This Week" active={screen === 'thisWeek'} onClick={() => setScreen('thisWeek')} />
        <MobileTab icon={HistoryIcon} label="History" active={screen === 'history'} onClick={() => setScreen('history')} />
        <MobileTab icon={Lightbulb} label="Ideas" active={screen === 'ideas'} onClick={() => setScreen('ideas')} />
      </nav>

      <main className="md:ml-56 pb-20 md:pb-0 min-h-screen">
        {screen === 'thisWeek' && (
          <ThisWeekScreen week={currentWeek} ltgs={ltgs}
            onToggleGoal={toggleGoalState} onAddGoal={addGoal}
            onUpdateGoal={updateGoal} onDeleteGoal={deleteGoal}
            onAddLtg={addLtg} onUpdateLtg={updateLtg} onArchiveLtg={archiveLtg}
            onOpenReview={() => setReviewOpen(true)} />
        )}
        {screen === 'history' && (
          <HistoryScreen meta={meta} currentWeekId={currentWeek.id} ltgs={ltgs}
            loadPastWeek={loadPastWeek} pastWeeks={pastWeeks} />
        )}
        {screen === 'ideas' && (
          <IdeasScreen backlog={meta.backlog} onAdd={addBacklogItem} onUpdate={updateBacklogItem} onDelete={deleteBacklogItem} />
        )}
      </main>

      {reviewOpen && (
        <ReviewScreen
          week={currentWeek} ltgs={ltgs} meta={meta}
          loadPastWeek={loadPastWeek}
          onClose={() => setReviewOpen(false)}
          onSetNarrativeText={setNarrativeText}
          onAddNarrativeVersion={addNarrativeVersion}
          onSetReviewConversation={setReviewConversation}
          onComplete={completeReview} onToast={setToast}
        />
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  );
}

// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pause, Play, Square } from 'lucide-react';
import { FONT_BODY, FONT_DISPLAY, IconButton } from '../components/ui';
import { GoalRow } from '../components/goals';
import { formatWeekLabel, formatWeekShort } from '../lib/core';
import { useTTS } from '../hooks/useTTS';

export function HistoryScreen({ meta, currentWeekId, ltgs, loadPastWeek, pastWeeks }) {
  const [selectedId, setSelectedId] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);

  const historyIds = useMemo(() => meta.weekIds.filter(id => id !== currentWeekId).sort().reverse(), [meta.weekIds, currentWeekId]);

  const [summaries, setSummaries] = useState({});

  useEffect(() => {
    (async () => {
      for (const id of historyIds) {
        if (summaries[id]) continue;
        const w = await loadPastWeek(id);
        if (!w) continue;
        const achievements = w.goals.filter(g => g.type === 'achievement');
        const avoidances = w.goals.filter(g => g.type === 'avoidance');
        const hit = achievements.filter(g => g.state?.done).length;
        const slipped = avoidances.filter(g => g.state?.slipped).length;
        const narrative = w.narrative.versions[w.narrative.currentIndex]?.text || '';
        const firstSentence = narrative.split(/[.!?\n]/).find(s => s.trim().length > 0) || '';
        setSummaries(s => ({ ...s, [id]: { hit, total: achievements.length, slipped, slips: avoidances.length, firstSentence: firstSentence.slice(0, 120) } }));
      }
    })();
  }, [historyIds]);

  const openWeek = async (id) => {
    setSelectedId(id);
    const w = await loadPastWeek(id);
    setSelectedWeek(w);
  };

  if (selectedId && selectedWeek) {
    return <PastWeekView week={selectedWeek} ltgs={ltgs} onBack={() => { setSelectedId(null); setSelectedWeek(null); }} />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 pt-8 pb-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted mb-1">History</p>
        <h1 className="text-3xl md:text-4xl font-semibold text-cream leading-tight" style={{ fontFamily: FONT_DISPLAY }}>Past weeks</h1>
      </header>
      {historyIds.length === 0 ? (
        <div className="border border-dashed border-default rounded-lg p-8 text-center text-muted">
          No closed weeks yet. After your first review, weeks will appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {historyIds.map(id => {
            const s = summaries[id];
            return (
              <button key={id} onClick={() => openWeek(id)}
                className="w-full text-left bg-surface-soft hover-bg-surface border border-soft rounded-lg p-4 transition-colors group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-cream" style={{ fontFamily: FONT_DISPLAY }}>{formatWeekShort(id)}</p>
                    <p className="text-xs text-muted mt-0.5">{formatWeekLabel(id)}</p>
                    {s?.firstSentence && <p className="text-sm text-muted mt-2 line-clamp-2">{s.firstSentence}…</p>}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {s ? (
                      <div className="text-xs text-muted space-y-0.5">
                        {s.total > 0 && <div>{s.hit}/{s.total} hit</div>}
                        {s.slips > 0 && (
                          <div className={s.slipped > 0 ? 'text-danger' : 'text-success'}>
                            {s.slipped > 0 ? `${s.slipped} slip${s.slipped > 1 ? 's' : ''}` : 'no slips'}
                          </div>
                        )}
                      </div>
                    ) : <Loader2 size={12} className="animate-spin text-faint" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PastWeekView({ week, ltgs, onBack }) {
  const tts = useTTS();
  const [versionIdx, setVersionIdx] = useState(week.narrative.currentIndex);
  const narrative = week.narrative.versions[versionIdx];
  const text = narrative?.text || '';

  const goalsByLtg = useMemo(() => {
    const m = new Map();
    Object.values(ltgs).forEach(l => m.set(l.id, []));
    const standalone = [];
    for (const g of week.goals) {
      if (g.longTermGoalId && m.has(g.longTermGoalId)) m.get(g.longTermGoalId).push(g);
      else standalone.push(g);
    }
    return { byLtg: m, standalone };
  }, [week, ltgs]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 pt-8 pb-10">
      <button onClick={onBack} className="text-sm text-muted hover-text-cream mb-4 inline-flex items-center gap-1">← All weeks</button>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted mb-1">{week.id}</p>
        <h1 className="text-3xl md:text-4xl font-semibold text-cream leading-tight" style={{ fontFamily: FONT_DISPLAY }}>{formatWeekShort(week.id)}</h1>
        <p className="text-sm text-muted mt-2">{formatWeekLabel(week.id)}</p>
      </header>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-widest text-muted mb-3">Goals</h2>
        <div className="space-y-3">
          {Array.from(goalsByLtg.byLtg.entries()).filter(([_, gs]) => gs.length > 0).map(([ltgId, gs]) => (
            <div key={ltgId} className="border border-soft rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-surface-soft border-b border-soft">
                <span className="text-sm font-medium text-cream" style={{ fontFamily: FONT_DISPLAY }}>{ltgs[ltgId]?.title || 'Long-term goal'}</span>
              </div>
              {gs.map(g => <GoalRow key={g.id} goal={g} readOnly />)}
            </div>
          ))}
          {goalsByLtg.standalone.length > 0 && (
            <div className="border border-soft rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-surface-soft border-b border-soft">
                <span className="text-xs uppercase tracking-widest text-muted">Other goals</span>
              </div>
              {goalsByLtg.standalone.map(g => <GoalRow key={g.id} goal={g} readOnly />)}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-widest text-muted">Narrative</h2>
          {week.narrative.versions.length > 1 && (
            <select value={versionIdx} onChange={(e) => setVersionIdx(parseInt(e.target.value))}
              className="bg-surface border border-default rounded px-2 py-1 text-xs text-cream outline-none">
              {week.narrative.versions.map((v, i) => (
                <option key={i} value={i}>v{i + 1} · {v.source}</option>
              ))}
            </select>
          )}
        </div>
        {text.trim() ? (
          <div className="bg-surface-soft border border-soft rounded-lg p-5">
            <p className="text-cream whitespace-pre-wrap leading-relaxed" style={{ fontFamily: FONT_BODY, fontSize: '15px' }}>{text}</p>
            <div className="mt-4 pt-3 border-t border-default flex items-center justify-between text-xs text-muted">
              <span>{text.trim().split(/\s+/).length} words</span>
              <div className="flex items-center gap-1">
                {!tts.speaking && <IconButton onClick={() => tts.speak(text)} title="Play"><Play size={14} /></IconButton>}
                {tts.speaking && !tts.paused && <IconButton onClick={tts.pause} title="Pause"><Pause size={14} /></IconButton>}
                {tts.speaking && tts.paused && <IconButton onClick={tts.resume} title="Resume"><Play size={14} /></IconButton>}
                {tts.speaking && <IconButton onClick={tts.stop} title="Stop"><Square size={14} /></IconButton>}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted italic">No narrative for this week.</p>
        )}
      </section>
    </div>
  );
}

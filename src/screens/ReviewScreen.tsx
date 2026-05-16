// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Edit2, FileText, Loader2, Plus, Send, Sparkles, Wand2, X } from 'lucide-react';
import { Button, FONT_BODY, FONT_DISPLAY, IconButton, ThemeStyles } from '../components/ui';
import { GoalIcon, GoalRow } from '../components/goals';
import { AddStagedGoalModal, computeStagedView, StagedGoalRow, StagedLtgHeader } from '../components/staged';
import { aiCleanup, aiConverse } from '../lib/ai';
import { formatWeekShort, isGoalFail, isGoalSuccess, now } from '../lib/core';

export function ReviewScreen({ week, ltgs, meta, loadPastWeek, onClose, onSetNarrativeText, onAddNarrativeVersion, onSetReviewConversation, onComplete, onToast }) {
  const initialCarry = useMemo(() => {
    const s = new Set();
    week.goals.forEach(g => { if (g.longTermGoalId) s.add(g.id); });
    return s;
  }, [week]);
  const [carrySet, setCarrySet] = useState(initialCarry);
  const toggleCarry = (gid) => setCarrySet(s => {
    const n = new Set(s); if (n.has(gid)) n.delete(gid); else n.add(gid); return n;
  });

  const [messages, setMessages] = useState(week.reviewConversation?.messages || []);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const [stagedGoals, setStagedGoals] = useState([]);
  const [stagedLtgs, setStagedLtgs] = useState([]);
  const [stagedIdeas, setStagedIdeas] = useState([]);
  const [proposalStatus, setProposalStatus] = useState({});

  const [pastSummaries, setPastSummaries] = useState([]);

  const [draftCollapsed, setDraftCollapsed] = useState(false);
  const [editingNarrative, setEditingNarrative] = useState(false);
  const [editNarrativeText, setEditNarrativeText] = useState('');
  const [commitOpen, setCommitOpen] = useState(false);
  const [addStagedOpen, setAddStagedOpen] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { onSetReviewConversation(messages); }, [messages, onSetReviewConversation]);

  useEffect(() => {
    (async () => {
      const pastIds = meta.weekIds.filter(id => id !== week.id).sort().reverse().slice(0, 4);
      const summaries = [];
      for (const id of pastIds) {
        const w = await loadPastWeek(id);
        if (!w) continue;
        const achievements = w.goals.filter(g => g.type === 'achievement');
        const avoidances = w.goals.filter(g => g.type === 'avoidance');
        const hitCount = achievements.filter(g => g.state?.done).length;
        const slipCount = avoidances.filter(g => g.state?.slipped).length;
        const narrative = w.narrative.versions[w.narrative.currentIndex]?.text || '';
        const snippet = narrative.replace(/\s+/g, ' ').slice(0, 180).trim();
        summaries.push({
          id: w.id, hitCount, totalAchievements: achievements.length,
          slipCount, totalAvoidances: avoidances.length, narrativeSnippet: snippet,
        });
      }
      setPastSummaries(summaries);
    })();
  }, [meta.weekIds, week.id, loadPastWeek]);

  const greetingRequested = useRef(false);
  useEffect(() => {
    if (greetingRequested.current) return;
    if (messages.length > 0) return;
    if (pastSummaries.length === 0 && meta.weekIds.filter(id => id !== week.id).length > 0) return;
    greetingRequested.current = true;
    (async () => {
      setAiLoading(true); setAiError('');
      try {
        const result = await aiConverse({ week, ltgs, pastSummaries, messages: [], isOpening: true });
        const assistantMsg = {
          role: 'assistant', content: result.say, narrative: result.narrative,
          proposals: { weeklyGoals: result.proposedWeeklyGoals, longTermGoals: result.proposedLongTermGoals, ideas: result.proposedIdeas },
          createdAt: now(),
        };
        if (result.narrative) onAddNarrativeVersion(result.narrative, 'claude_conversation');
        setMessages([assistantMsg]);
      } catch (e) {
        setAiError(`Couldn't reach Claude: ${e.message}`);
      } finally { setAiLoading(false); }
    })();
  }, [pastSummaries, messages.length, meta.weekIds, week, ltgs, onAddNarrativeVersion]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, aiLoading]);

  // Auto-resize chat textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Empty: always render at minimum, skip measurement
    if (!input || input.length === 0) {
      el.style.height = '40px';
      return;
    }
    // Content: reset then measure on next frame so layout is settled
    el.style.height = '40px';
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const sh = inputRef.current.scrollHeight;
      inputRef.current.style.height = Math.min(Math.max(sh, 40), 360) + 'px';
    });
  }, [input]);

  const currentNarrative = week.narrative.versions[week.narrative.currentIndex];
  const currentText = currentNarrative?.text || '';

  const failedGoals = useMemo(() => week.goals.filter(isGoalFail), [week.goals]);
  const achievements = week.goals.filter(g => g.type === 'achievement');
  const avoidances = week.goals.filter(g => g.type === 'avoidance');
  const hitCount = achievements.filter(g => g.state?.done).length;
  const slipCount = avoidances.filter(g => g.state?.slipped).length;

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || aiLoading) return;
    const userMsg = { role: 'user', content: trimmed, createdAt: now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setAiLoading(true); setAiError('');
    try {
      const result = await aiConverse({ week, ltgs, pastSummaries, messages: newMessages, isOpening: false });
      const assistantMsg = {
        role: 'assistant', content: result.say, narrative: result.narrative,
        proposals: { weeklyGoals: result.proposedWeeklyGoals, longTermGoals: result.proposedLongTermGoals, ideas: result.proposedIdeas },
        createdAt: now(),
      };
      if (result.narrative) onAddNarrativeVersion(result.narrative, 'claude_conversation');
      setMessages([...newMessages, assistantMsg]);
    } catch (e) {
      setAiError(`Couldn't reach Claude: ${e.message}`);
    } finally { setAiLoading(false); }
  };

  const onAcceptProposal = (msgIdx, kind, itemIdx, item) => {
    const key = `${msgIdx}-${kind}-${itemIdx}`;
    setProposalStatus(p => ({ ...p, [key]: 'accepted' }));
    if (kind === 'weeklyGoals') {
      setStagedGoals(s => [...s, item]);
      if (item.longTermGoalTitle) {
        const existing = Object.values(ltgs).find(l => l.title.toLowerCase() === item.longTermGoalTitle.toLowerCase());
        const alreadyStaged = stagedLtgs.find(sl => sl.title.toLowerCase() === item.longTermGoalTitle.toLowerCase());
        if (!existing && !alreadyStaged) {
          setStagedLtgs(s => [...s, { title: item.longTermGoalTitle, description: '' }]);
        }
      }
    } else if (kind === 'longTermGoals') {
      setStagedLtgs(s => [...s, item]);
    } else if (kind === 'ideas') {
      setStagedIdeas(s => [...s, item]);
    }
  };

  const onDismissProposal = (msgIdx, kind, itemIdx) => {
    const key = `${msgIdx}-${kind}-${itemIdx}`;
    setProposalStatus(p => ({ ...p, [key]: 'dismissed' }));
  };

  const startEditNarrative = () => { setEditNarrativeText(currentText); setEditingNarrative(true); };
  const saveEditNarrative = () => {
    if (editNarrativeText.trim() !== currentText.trim()) onAddNarrativeVersion(editNarrativeText, 'user');
    setEditingNarrative(false);
  };

  const handleComplete = () => {
    onComplete({ goalsToCarry: carrySet, stagedNewGoals: stagedGoals, stagedNewLtgs: stagedLtgs, stagedIdeas });
  };

  return (
    <div className="fixed inset-0 z-40 bg-base overflow-hidden flex flex-col" style={{ fontFamily: FONT_BODY }}>
      <ThemeStyles />

      <header className="flex-shrink-0 border-b border-soft px-4 md:px-8 py-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted mb-0.5">Weekly review</p>
          <h1 className="text-xl md:text-2xl font-semibold text-cream leading-tight" style={{ fontFamily: FONT_DISPLAY }}>
            Closing {formatWeekShort(week.id)}
          </h1>
          <p className="text-xs text-muted mt-1">
            {achievements.length > 0 && <span>{hitCount}/{achievements.length} hit</span>}
            {achievements.length > 0 && avoidances.length > 0 && <span> · </span>}
            {avoidances.length > 0 && (
              <span className={slipCount > 0 ? 'text-danger' : 'text-success'}>
                {slipCount > 0 ? `${slipCount} slip${slipCount > 1 ? 's' : ''}` : 'no slips'}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setCommitOpen(true)}>
            <Check size={14} /> Complete week
          </Button>
          <IconButton onClick={onClose} title="Close review"><X size={20} /></IconButton>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">

        {/* Desktop: left column - goals reference + narrative draft */}
        <aside className="hidden md:flex md:w-1/2 md:flex-shrink-0 md:border-r border-soft md:flex-col md:overflow-y-auto">
          {/* Goals reference */}
          <div className="px-6 py-5 border-b border-soft">
            <p className="text-xs uppercase tracking-widest text-muted mb-3">Goals this week</p>
            {week.goals.length === 0 ? (
              <p className="text-sm text-muted italic">No goals set this week.</p>
            ) : (
              <div className="space-y-2.5">
                {week.goals.map(g => {
                  const done = g.type === 'achievement' && g.state?.done;
                  const success = isGoalSuccess(g);
                  const parent = g.longTermGoalId ? ltgs[g.longTermGoalId] : null;
                  return (
                    <div key={g.id} className="flex items-center gap-2.5">
                      <div className="flex-shrink-0"><GoalIcon goal={g} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm leading-snug" style={{
                          color: done ? 'var(--c-text-faint)' : (success ? 'var(--c-text)' : 'var(--c-text-muted)'),
                          textDecoration: done ? 'line-through' : 'none',
                        }}>
                          {g.title}
                        </div>
                        {parent && (
                          <div className="text-[10px] text-faint mt-0.5">{parent.title}</div>
                        )}
                      </div>
                      {g.type === 'avoidance' && (
                        <span className="text-[10px] uppercase tracking-widest text-faint flex-shrink-0">avoid</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Staged for next week */}
          <div className="px-6 py-5 border-b border-soft">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-widest text-muted">Staged for next week</p>
              <button onClick={() => setAddStagedOpen(true)}
                className="text-xs text-muted hover-text-accent flex items-center gap-1">
                <Plus size={12} /> Add
              </button>
            </div>
            {(() => {
              const stagedView = computeStagedView(ltgs, stagedLtgs, stagedGoals);
              if (stagedView.groups.length === 0 && stagedView.standalone.length === 0) {
                return <p className="text-sm text-muted italic">Nothing staged yet. Accept Claude's proposals or use Add to queue items here.</p>;
              }
              return (
                <div className="space-y-4">
                  {stagedView.groups.map((group, gi) => (
                    <div key={`grp-${gi}`}>
                      <StagedLtgHeader
                        ltg={group.ltg}
                        onRename={(v) => setStagedLtgs(s => s.map((l, i) => i === group.ltg.stagedIdx ? { ...l, title: v } : l))}
                        onRemove={() => setStagedLtgs(s => s.filter((_, i) => i !== group.ltg.stagedIdx))}
                      />
                      {group.goals.length > 0 && (
                        <div className="pl-3 space-y-1.5">
                          {group.goals.map(g => (
                            <StagedGoalRow key={`gr-${g.stagedIdx}`}
                              goal={g}
                              onRename={(v) => setStagedGoals(s => s.map((sg, i) => i === g.stagedIdx ? { ...sg, title: v } : sg))}
                              onRemove={() => setStagedGoals(s => s.filter((_, i) => i !== g.stagedIdx))}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {stagedView.standalone.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-faint mb-2 pb-1 border-b border-soft">Other</p>
                      <div className="space-y-1.5">
                        {stagedView.standalone.map(g => (
                          <StagedGoalRow key={`s-${g.stagedIdx}`}
                            goal={g}
                            onRename={(v) => setStagedGoals(s => s.map((sg, i) => i === g.stagedIdx ? { ...sg, title: v } : sg))}
                            onRemove={() => setStagedGoals(s => s.filter((_, i) => i !== g.stagedIdx))}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <AddStagedGoalModal
              open={addStagedOpen}
              onClose={() => setAddStagedOpen(false)}
              allLtgTitles={[
                ...Object.values(ltgs).filter(l => l.status === 'active').map(l => l.title),
                ...stagedLtgs.map(l => l.title),
              ]}
              onAddGoal={(g) => setStagedGoals(s => [...s, g])}
              onAddLtg={(l) => setStagedLtgs(s => [...s, l])}
            />
          </div>

          {/* Narrative draft */}
          <div className="px-6 py-5 flex-1">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-widest text-muted mb-0.5 flex items-center gap-2">
                  <FileText size={11} />Narrative draft
                </p>
                {currentText.trim() ? (
                  <p className="text-xs text-faint truncate">
                    {currentText.trim().split(/\s+/).length} words · v{week.narrative.currentIndex + 1} · {currentNarrative.source}
                  </p>
                ) : (
                  <p className="text-xs text-faint">empty</p>
                )}
              </div>
              {!editingNarrative && (
                <button onClick={startEditNarrative} className="text-xs text-muted hover-text-accent flex items-center gap-1 flex-shrink-0">
                  <Edit2 size={12} /> Edit
                </button>
              )}
            </div>
            {editingNarrative ? (
              <div className="flex flex-col">
                <textarea value={editNarrativeText}
                  onChange={(e) => setEditNarrativeText(e.target.value)}
                  className="narrative-textarea w-full min-h-[300px] bg-surface border border-default rounded-md p-3 text-cream placeholder-faint outline-none focus-border-accent resize-y"
                  style={{ fontFamily: FONT_BODY, fontSize: '14px' }}
                  placeholder="Write or revise the narrative..." />
                <div className="flex justify-end gap-2 mt-3">
                  <Button variant="ghost" size="sm" onClick={() => setEditingNarrative(false)}>Cancel</Button>
                  <Button size="sm" onClick={saveEditNarrative}>Save</Button>
                </div>
              </div>
            ) : currentText.trim() ? (
              <p className="text-cream whitespace-pre-wrap" style={{ fontFamily: FONT_BODY, fontSize: '14.5px', lineHeight: 1.75 }}>{currentText}</p>
            ) : (
              <p className="text-sm text-muted italic leading-relaxed">
                No draft yet. As you talk with Claude in the chat, the narrative will build up here in your voice. You can also write it yourself by clicking Edit.
              </p>
            )}
          </div>
        </aside>

        {/* Chat column */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-4 md:px-6 py-6">

              {/* Mobile only: collapsible narrative draft */}
              <div className="md:hidden mb-6 border border-default rounded-lg overflow-hidden bg-surface-soft">
                <button onClick={() => setDraftCollapsed(c => !c)} className="w-full px-4 py-3 flex items-center justify-between hover-bg-surface transition-colors">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-muted" />
                    <span className="text-xs uppercase tracking-widest text-muted">Narrative draft</span>
                    {currentText.trim() && (
                      <span className="text-xs text-faint">{currentText.trim().split(/\s+/).length} words</span>
                    )}
                  </div>
                  {draftCollapsed ? <ChevronDown size={14} className="text-muted" /> : <ChevronUp size={14} className="text-muted" />}
                </button>
                {!draftCollapsed && (
                  <div className="border-t border-default p-4">
                    {editingNarrative ? (
                      <div>
                        <textarea value={editNarrativeText}
                          onChange={(e) => setEditNarrativeText(e.target.value)}
                          className="narrative-textarea w-full min-h-[180px] bg-base border border-default rounded-md p-3 text-cream placeholder-faint outline-none focus-border-accent resize-y"
                          style={{ fontFamily: FONT_BODY, fontSize: '14px' }}
                          placeholder="Write or revise the narrative..." />
                        <div className="flex justify-end gap-2 mt-3">
                          <Button variant="ghost" size="sm" onClick={() => setEditingNarrative(false)}>Cancel</Button>
                          <Button size="sm" onClick={saveEditNarrative}>Save</Button>
                        </div>
                      </div>
                    ) : currentText.trim() ? (
                      <div>
                        <p className="text-cream whitespace-pre-wrap chat-message-content text-sm">{currentText}</p>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-default">
                          <span className="text-xs text-faint">v{week.narrative.currentIndex + 1} · {currentNarrative.source}</span>
                          <button onClick={startEditNarrative} className="text-xs text-muted hover-text-accent flex items-center gap-1">
                            <Edit2 size={12} /> Edit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-muted italic">
                          No draft yet. Just talk to Claude below, the narrative will build up as you go.
                        </p>
                        <button onClick={startEditNarrative} className="text-xs text-muted hover-text-accent flex items-center gap-1 mt-2">
                          <Edit2 size={12} /> Or write it yourself
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {failedGoals.length > 0 && (
                <div className="mb-6 border border-soft rounded-lg overflow-hidden bg-surface-soft">
                  <div className="px-4 py-2 border-b border-soft flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest text-muted">Missed this week</span>
                    <span className="text-xs text-faint">{failedGoals.length} goal{failedGoals.length > 1 ? 's' : ''}</span>
                  </div>
                  {failedGoals.map(g => <GoalRow key={g.id} goal={g} readOnly />)}
                </div>
              )}

              <div className="space-y-4">
                {messages.length === 0 && aiLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Claude is reviewing your week...</span>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <ChatMessage key={i} msg={msg} msgIdx={i}
                    proposalStatus={proposalStatus}
                    onAcceptProposal={onAcceptProposal}
                    onDismissProposal={onDismissProposal}
                    ltgs={ltgs} stagedLtgs={stagedLtgs} />
                ))}
                {aiLoading && messages.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted pl-2">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Thinking...</span>
                  </div>
                )}
                {aiError && (
                  <div className="text-xs text-danger-strong bg-danger-tint border border-danger rounded px-3 py-2 flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    {aiError}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 border-t border-soft bg-base px-4 md:px-6 py-3">
            <div className="max-w-2xl mx-auto flex gap-2 items-end">
              <textarea ref={inputRef} value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Say anything about your week, or ask Claude something..."
                rows={1}
                className="flex-1 bg-surface border border-default rounded-md px-3 py-2 text-cream placeholder-faint outline-none focus-border-accent resize-none overflow-y-auto"
                style={{ minHeight: '40px', maxHeight: '360px' }} />
              <Button onClick={send} disabled={!input.trim() || aiLoading}>
                {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {commitOpen && (
        <CommitSheet
          week={week} ltgs={ltgs}
          carrySet={carrySet} toggleCarry={toggleCarry}
          stagedGoals={stagedGoals} setStagedGoals={setStagedGoals}
          stagedLtgs={stagedLtgs} setStagedLtgs={setStagedLtgs}
          stagedIdeas={stagedIdeas} setStagedIdeas={setStagedIdeas}
          onClose={() => setCommitOpen(false)}
          onConfirm={handleComplete}
        />
      )}
    </div>
  );
}

export function ChatMessage({ msg, msgIdx, proposalStatus, onAcceptProposal, onDismissProposal }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end fade-in">
        <div className="max-w-[85%] bg-surface-2 text-cream rounded-lg rounded-tr-sm px-4 py-3 chat-message-content text-sm whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }

  const proposals = msg.proposals || { weeklyGoals: [], longTermGoals: [], ideas: [] };
  const hasProposals = (proposals.weeklyGoals.length + proposals.longTermGoals.length + proposals.ideas.length) > 0;

  return (
    <div className="fade-in space-y-3">
      <div className="flex justify-start">
        <div className="max-w-[90%] text-cream chat-message-content text-[15px] whitespace-pre-wrap" style={{ fontFamily: FONT_BODY }}>
          {msg.content}
        </div>
      </div>

      {msg.narrative && (
        <div className="ml-0 max-w-[90%] flex items-center gap-2 text-xs text-muted">
          <FileText size={12} />
          <span>Narrative updated</span>
        </div>
      )}

      {hasProposals && (
        <div className="ml-0 max-w-[90%] space-y-2">
          {proposals.weeklyGoals.map((pg, i) => {
            const status = proposalStatus[`${msgIdx}-weeklyGoals-${i}`];
            return (
              <ProposalCard key={`wg-${i}`} kind="Weekly goal for next week"
                primary={pg.title}
                secondary={`${pg.type === 'avoidance' ? 'Avoidance' : 'Achievement'}${pg.longTermGoalTitle ? ` · under "${pg.longTermGoalTitle}"` : ''}`}
                status={status}
                onAccept={() => onAcceptProposal(msgIdx, 'weeklyGoals', i, pg)}
                onDismiss={() => onDismissProposal(msgIdx, 'weeklyGoals', i)} />
            );
          })}
          {proposals.longTermGoals.map((pl, i) => {
            const status = proposalStatus[`${msgIdx}-longTermGoals-${i}`];
            return (
              <ProposalCard key={`lg-${i}`} kind="New long-term goal"
                primary={pl.title} secondary={pl.description}
                status={status}
                onAccept={() => onAcceptProposal(msgIdx, 'longTermGoals', i, pl)}
                onDismiss={() => onDismissProposal(msgIdx, 'longTermGoals', i)} />
            );
          })}
          {proposals.ideas.map((pi, i) => {
            const status = proposalStatus[`${msgIdx}-ideas-${i}`];
            return (
              <ProposalCard key={`i-${i}`} kind="Idea for backlog"
                primary={pi.text}
                status={status}
                onAccept={() => onAcceptProposal(msgIdx, 'ideas', i, pi)}
                onDismiss={() => onDismissProposal(msgIdx, 'ideas', i)} />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProposalCard({ kind, primary, secondary, status, onAccept, onDismiss }) {
  const base = "border rounded-lg p-3 flex items-start justify-between gap-3 transition-colors";
  if (status === 'accepted') {
    return (
      <div className={`${base} border-success bg-success-tint-soft`}>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-success mb-1">{kind} · added</p>
          <p className="text-cream text-sm" style={{ fontFamily: FONT_DISPLAY }}>{primary}</p>
          {secondary && <p className="text-xs text-muted mt-1">{secondary}</p>}
        </div>
        <Check size={16} className="text-success-strong flex-shrink-0 mt-1" />
      </div>
    );
  }
  if (status === 'dismissed') {
    return (
      <div className={`${base} border-soft bg-surface-soft`} style={{ opacity: 0.5 }}>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-faint mb-1">{kind} · dismissed</p>
          <p className="text-muted text-sm line-through" style={{ fontFamily: FONT_DISPLAY }}>{primary}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={`${base} border-accent bg-accent-tint`}>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-accent-strong mb-1">{kind}</p>
        <p className="text-cream font-medium text-sm" style={{ fontFamily: FONT_DISPLAY }}>{primary}</p>
        {secondary && <p className="text-xs text-muted mt-1">{secondary}</p>}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button onClick={onAccept} size="sm" variant="primary">Add</Button>
        <Button onClick={onDismiss} size="sm" variant="ghost">Dismiss</Button>
      </div>
    </div>
  );
}

export function CommitSheet({ week, ltgs, carrySet, toggleCarry, stagedGoals, setStagedGoals, stagedLtgs, setStagedLtgs, stagedIdeas, setStagedIdeas, onClose, onConfirm }) {
  const carryingGoals = week.goals.filter(g => carrySet.has(g.id));
  const removedFromCarry = week.goals.filter(g => g.longTermGoalId && !carrySet.has(g.id));

  return (
    <div className="fixed inset-0 z-50 fade-in flex items-stretch md:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="bg-surface border border-default w-full md:max-w-lg md:rounded-lg md:shadow-2xl md:max-h-[85vh] overflow-y-auto md:my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-default sticky top-0 bg-surface z-10">
          <h2 className="text-lg font-medium text-cream" style={{ fontFamily: FONT_DISPLAY }}>Confirm and close week</h2>
          <IconButton onClick={onClose} title="Cancel"><X size={18} /></IconButton>
        </div>
        <div className="p-4 space-y-5">
          {carryingGoals.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-muted mb-2">Carrying to next week</p>
              <div className="space-y-1">
                {carryingGoals.map(g => (
                  <div key={g.id} className="flex items-center justify-between px-3 py-2 bg-base border border-default rounded text-sm">
                    <span className="text-cream">
                      {g.title}
                      <span className="text-xs text-muted ml-2">
                        · {g.longTermGoalId ? ltgs[g.longTermGoalId]?.title || 'long-term' : 'other'}
                      </span>
                    </span>
                    <button onClick={() => toggleCarry(g.id)} className="text-xs text-muted hover-text-danger">remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {removedFromCarry.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-muted mb-2">Not carrying</p>
              <div className="space-y-1">
                {removedFromCarry.map(g => (
                  <div key={g.id} className="flex items-center justify-between px-3 py-1.5 text-sm text-muted">
                    <span>{g.title}</span>
                    <button onClick={() => toggleCarry(g.id)} className="text-xs text-accent-strong hover-text-accent">add back</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stagedGoals.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-muted mb-2">New goals for next week</p>
              <div className="space-y-1">
                {stagedGoals.map((sg, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-accent-tint border border-accent rounded text-sm">
                    <span className="text-cream">
                      {sg.title}
                      <span className="text-xs text-muted ml-2">
                        · {sg.type}{sg.longTermGoalTitle ? ` · ${sg.longTermGoalTitle}` : ''}
                      </span>
                    </span>
                    <button onClick={() => setStagedGoals(s => s.filter((_, idx) => idx !== i))} className="text-xs text-muted hover-text-danger">remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stagedLtgs.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-muted mb-2">New long-term goals</p>
              <div className="space-y-1">
                {stagedLtgs.map((sl, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-accent-tint border border-accent rounded text-sm">
                    <span className="text-cream">{sl.title}</span>
                    <button onClick={() => setStagedLtgs(s => s.filter((_, idx) => idx !== i))} className="text-xs text-muted hover-text-danger">remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stagedIdeas.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-muted mb-2">New ideas for backlog</p>
              <div className="space-y-1">
                {stagedIdeas.map((si, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-accent-tint border border-accent rounded text-sm">
                    <span className="text-cream">{si.text}</span>
                    <button onClick={() => setStagedIdeas(s => s.filter((_, idx) => idx !== i))} className="text-xs text-muted hover-text-danger">remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {carryingGoals.length === 0 && stagedGoals.length === 0 && stagedLtgs.length === 0 && stagedIdeas.length === 0 && (
            <p className="text-sm text-muted italic">No changes staged. Closing this week will start a fresh next week with no goals.</p>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t border-default">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button size="lg" onClick={onConfirm}>
              <Check size={16} /> Complete week and start next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

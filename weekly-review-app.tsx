import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus, X, Check, Circle, Flag, ChevronRight, ChevronDown, ChevronUp,
  Play, Pause, Square, Send,
  Sparkles, Wand2, MoreHorizontal, Edit2, Archive, Trash2,
  Home, History as HistoryIcon, Lightbulb,
  Download, AlertTriangle, Loader2, FileText
} from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const MODEL = 'claude-sonnet-4-6';

const CONVERSATION_PROMPT = `You're helping Kyle close out his week through a brief, reflective conversation. You're warm, thoughtful, and a good listener. Not pushy. You don't ask multiple questions at once.

You'll be given (in the user message context):
- The current week's goals and their pass/fail status
- A summary of recent past weeks
- His active long-term goals
- The conversation so far

Your job:
1. Open with a short, grounding greeting that names how the week went numerically. Ask one open question to start.
2. As he shares, build up a "narrative" draft. Capture what he says in his own casual voice. Don't formalize it. Don't add ideas he didn't express. Don't restructure heavily. Keep it sounding like Kyle wrote it himself.
3. When something emerges that feels like a goal for next week, a new long-term theme, or an idea worth saving, propose it. Don't oversuggest. One or two items at a time, max.
4. Answer questions about his history accurately using the past-weeks context you're given.
5. When the conversation feels naturally complete, say so. Suggest he's ready to close out.

Response format. Return ONLY this JSON object (no markdown fences, no preamble, no commentary outside the JSON):

{
  "say": "your conversational reply, usually 1-3 sentences, longer only if answering a substantive history question",
  "narrative": "the FULL updated narrative draft (not a delta), or null if no update this turn",
  "proposedWeeklyGoals": [{ "title": "...", "type": "achievement" | "avoidance", "longTermGoalTitle": "existing or new long-term goal title, or null" }],
  "proposedLongTermGoals": [{ "title": "...", "description": "optional" }],
  "proposedIdeas": [{ "text": "..." }]
}

Hard rules:
- "say" is always required. Keep it brief and conversational.
- "narrative" should be null on most turns. Only fill it when there's meaningful new content to weave in. When you do, include the FULL current narrative.
- Narrative voice: first person, casual, Kyle's phrasings. NEVER use em dashes. En dashes are fine. Use commas, periods, or parentheses instead.
- Only propose goals/ideas when they emerge clearly from what was said. Don't fish for them.
- Achievement goal format: "do X this week" style. Avoidance: "don't do X this week" style.
- Long-term goal titles: short noun phrases ("Health", "Get stronger", "Ship side project").
- Output the JSON object only.`;

const CLEANUP_PROMPT = `You're cleaning up a personal weekly journal entry written off the cuff. Preserve the writer's voice and casual tone. Tighten run-on sentences, trim repetition and filler, fix awkward phrasings and obvious typos. Don't make it formal, don't add ideas of your own, don't restructure heavily. NEVER use em dashes; en dashes are fine. Return only the revised text, no preamble.`;

const SEED_BACKLOG = [
  'Weekend notification reminders (calendar .ics export or PWA push)',
  'Mid-week quick notes',
  'Mood / energy tracking alongside goals',
  'Pattern detection across weeks',
  'Automatic AI suggestions without being prompted',
  'Stats dashboard (hit rate over time, by long-term goal)',
  'Avoidance goal slip count and streak tracking',
  'Quantitative goals ("workout 3x", "read 2 books")',
  'Monthly / quarterly long-term goal reviews',
  'Light mode',
  'Tags on goals for analysis',
  'Multiple narrative sections (work, personal, etc.)',
  'Markdown export of past weeks',
  'Migrate storage to Supabase for separate-app access',
  'Voice input for review conversation',
  'Persist accepted proposals across review sessions'
];

// ============================================================================
// HELPERS
// ============================================================================

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const now = () => new Date().toISOString();
function todayISO() { return new Date().toISOString().slice(0, 10); }

function getISOWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getWeekDateRange(weekId) {
  const [year, week] = weekId.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday, end: sunday };
}

function getNextWeekId(weekId) {
  const range = getWeekDateRange(weekId);
  const nextMonday = new Date(range.start);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  return getISOWeekId(nextMonday);
}

function formatWeekLabel(weekId) {
  const { start, end } = getWeekDateRange(weekId);
  const opts = { month: 'short', day: 'numeric' };
  const sStr = start.toLocaleDateString(undefined, opts);
  const eStr = end.toLocaleDateString(undefined, { ...opts, year: 'numeric' });
  return `${sStr} – ${eStr}`;
}

function formatWeekShort(weekId) {
  const { start } = getWeekDateRange(weekId);
  return `Week of ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function daysOpenSince(startDateStr) {
  const start = new Date(startDateStr + 'T00:00:00');
  const ms = Date.now() - start.getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

function isWeekendReady(startDateStr) { return daysOpenSince(startDateStr) >= 5; }

function isGoalSuccess(g) {
  if (g.type === 'achievement') return !!g.state?.done;
  return !g.state?.slipped;
}
function isGoalFail(g) { return !isGoalSuccess(g); }

// ============================================================================
// STORAGE
// ============================================================================

const storage = {
  async _get(key) {
    try {
      const r = await window.storage.get(key);
      return r && r.value != null ? JSON.parse(r.value) : null;
    } catch { return null; }
  },
  async _set(key, value) { return window.storage.set(key, JSON.stringify(value)); },
  async _delete(key) {
    try { return await window.storage.delete(key); } catch { return null; }
  },
  getMeta() { return this._get('app:meta'); },
  saveMeta(m) { return this._set('app:meta', m); },
  getWeek(id) { return this._get(`week:${id}`); },
  saveWeek(w) { return this._set(`week:${w.id}`, w); },
  getLtg(id) { return this._get(`ltg:${id}`); },
  saveLtg(l) { return this._set(`ltg:${l.id}`, l); },
  deleteLtg(id) { return this._delete(`ltg:${id}`); },
};

// ============================================================================
// AI MODULE
// ============================================================================

async function callClaude({ system, messages, maxTokens = 2500 }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages })
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`API ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

async function aiCleanup(narrative) {
  return callClaude({
    system: CLEANUP_PROMPT,
    messages: [{ role: 'user', content: narrative }],
    maxTokens: 1500
  });
}

function buildReviewContext({ week, ltgs, pastSummaries, stagedGoals = [], stagedLtgs = [], stagedIdeas = [] }) {
  const goalLines = week.goals.length === 0
    ? '(no goals set this week)'
    : week.goals.map(g => {
        const status = isGoalSuccess(g) ? 'success' : 'fail';
        const parent = g.longTermGoalId ? ltgs[g.longTermGoalId]?.title : null;
        const note = g.notes ? ` (note: ${g.notes})` : '';
        return `- [${status}] ${g.type === 'avoidance' ? '(avoidance) ' : ''}${g.title}${parent ? ` [under: ${parent}]` : ''}${note}`;
      }).join('\n');

  const activeLtgs = Object.values(ltgs).filter(l => l.status === 'active');
  const ltgLines = activeLtgs.length === 0
    ? '(none)'
    : activeLtgs.map(l => `- ${l.title}${l.description ? `: ${l.description}` : ''}`).join('\n');

  const pastLines = pastSummaries.length === 0
    ? '(no past weeks yet)'
    : pastSummaries.map(p => {
        const goalSummary = p.totalAchievements > 0
          ? `${p.hitCount}/${p.totalAchievements} achievement goals hit`
          : 'no achievement goals';
        const slipSummary = p.totalAvoidances > 0
          ? `, ${p.slipCount}/${p.totalAvoidances} avoidance slips`
          : '';
        const narrativeBit = p.narrativeSnippet ? `\n    narrative: "${p.narrativeSnippet}"` : '';
        return `- ${formatWeekShort(p.id)} (${p.id}): ${goalSummary}${slipSummary}${narrativeBit}`;
      }).join('\n');

  let stagedSection = '';
  if (stagedGoals.length > 0 || stagedLtgs.length > 0 || stagedIdeas.length > 0) {
    stagedSection = '\n\nAlready staged for next week (DO NOT propose any of these again, they are already handled):';
    stagedGoals.forEach(g => {
      stagedSection += `\n- Weekly goal: "${g.title}" (${g.type})${g.longTermGoalTitle ? ` [under ${g.longTermGoalTitle}]` : ''}`;
    });
    stagedLtgs.forEach(l => {
      stagedSection += `\n- New long-term goal: "${l.title}"`;
    });
    stagedIdeas.forEach(i => {
      stagedSection += `\n- Idea for backlog: "${i.text}"`;
    });
  }

  return `<context>
Current week: ${week.id} (${formatWeekLabel(week.id)})
This week's goals:
${goalLines}

Active long-term goals:
${ltgLines}

Recent past weeks (most recent first):
${pastLines}${stagedSection}
</context>`;
}

function parseAiResponse(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/gm, '').replace(/\s*```$/gm, '').trim();
  try {
    const p = JSON.parse(cleaned);
    return {
      say: typeof p.say === 'string' ? p.say : '(no reply)',
      narrative: typeof p.narrative === 'string' && p.narrative.trim() ? p.narrative : null,
      proposedWeeklyGoals: Array.isArray(p.proposedWeeklyGoals) ? p.proposedWeeklyGoals : [],
      proposedLongTermGoals: Array.isArray(p.proposedLongTermGoals) ? p.proposedLongTermGoals : [],
      proposedIdeas: Array.isArray(p.proposedIdeas) ? p.proposedIdeas : [],
    };
  } catch {
    return { say: cleaned || '(no reply)', narrative: null, proposedWeeklyGoals: [], proposedLongTermGoals: [], proposedIdeas: [] };
  }
}

async function aiConverse({ week, ltgs, pastSummaries, messages, isOpening = false }) {
  const context = buildReviewContext({ week, ltgs, pastSummaries });
  const apiMessages = [];
  if (isOpening) {
    apiMessages.push({
      role: 'user',
      content: `${context}\n\nThis is the start of the review conversation. Greet Kyle, briefly name how the week went numerically, and ask one open question to start.`
    });
  } else {
    const convoText = messages.map(m => `${m.role === 'user' ? 'Kyle' : 'You'}: ${m.content}`).join('\n\n');
    apiMessages.push({
      role: 'user',
      content: `${context}\n\nConversation so far:\n${convoText}\n\nKyle just said: "${messages[messages.length - 1].content}"\n\nRespond as instructed.`
    });
  }
  const raw = await callClaude({ system: CONVERSATION_PROMPT, messages: apiMessages, maxTokens: 2500 });
  return parseAiResponse(raw);
}

// ============================================================================
// TTS HOOK
// ============================================================================

function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);
  const speak = (text) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.onend = () => { setSpeaking(false); setPaused(false); };
    u.onerror = () => { setSpeaking(false); setPaused(false); };
    window.speechSynthesis.speak(u);
    setSpeaking(true); setPaused(false);
  };
  const pause = () => { window.speechSynthesis?.pause(); setPaused(true); };
  const resume = () => { window.speechSynthesis?.resume(); setPaused(false); };
  const stop = () => { window.speechSynthesis?.cancel(); setSpeaking(false); setPaused(false); };
  return { speaking, paused, speak, pause, resume, stop };
}

// ============================================================================
// THEME + UI PRIMITIVES
// ============================================================================

const FONT_DISPLAY = "'Fraunces', Georgia, serif";
const FONT_BODY = "'DM Sans', -apple-system, sans-serif";

function ThemeStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600&display=swap');

      :root {
        --c-bg: #131915;
        --c-surface: #1b231d;
        --c-surface-2: #232d25;
        --c-surface-3: #2b372e;
        --c-border: #2d362f;
        --c-border-soft: #232d25;
        --c-text: #ebe7df;
        --c-text-dim: #b8b6ac;
        --c-text-muted: #919286;
        --c-text-faint: #5d6259;
        --c-accent: #dbb673;
        --c-accent-hover: #e8c485;
        --c-accent-strong: #c9a665;
        --c-accent-text: #131915;
        --c-accent-tint: rgba(219, 182, 115, 0.1);
        --c-accent-tint-strong: rgba(219, 182, 115, 0.18);
        --c-accent-border: rgba(219, 182, 115, 0.35);
        --c-success: #8db876;
        --c-success-strong: #a3c889;
        --c-success-bg: rgba(141, 184, 118, 0.15);
        --c-success-bg-soft: rgba(141, 184, 118, 0.08);
        --c-success-border: rgba(141, 184, 118, 0.45);
        --c-danger: #cc7878;
        --c-danger-strong: #df8b8b;
        --c-danger-bg: rgba(204, 120, 120, 0.18);
        --c-danger-border: rgba(204, 120, 120, 0.45);
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background-color: var(--c-bg); }
      textarea, input { font-family: inherit; }
      .scroll-hidden::-webkit-scrollbar { display: none; }
      .scroll-hidden { scrollbar-width: none; }
      .narrative-textarea { line-height: 1.7; }
      .chat-message-content { line-height: 1.6; }

      @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      .fade-in { animation: fadeIn 0.25s ease-out; }

      .bg-base { background-color: var(--c-bg); }
      .bg-surface { background-color: var(--c-surface); }
      .bg-surface-soft { background-color: rgba(27, 35, 29, 0.5); }
      .bg-surface-2 { background-color: var(--c-surface-2); }
      .bg-surface-3 { background-color: var(--c-surface-3); }

      .text-cream { color: var(--c-text); }
      .text-dim { color: var(--c-text-dim); }
      .text-muted { color: var(--c-text-muted); }
      .text-faint { color: var(--c-text-faint); }

      .text-accent { color: var(--c-accent); }
      .text-accent-strong { color: var(--c-accent-strong); }
      .text-success { color: var(--c-success); }
      .text-success-strong { color: var(--c-success-strong); }
      .text-danger { color: var(--c-danger); }
      .text-danger-strong { color: var(--c-danger-strong); }

      .border-default { border-color: var(--c-border); }
      .border-soft { border-color: var(--c-border-soft); }
      .border-accent { border-color: var(--c-accent-border); }
      .border-success { border-color: var(--c-success-border); }
      .border-danger { border-color: var(--c-danger-border); }

      .bg-accent-tint { background-color: var(--c-accent-tint); }
      .bg-accent-tint-strong { background-color: var(--c-accent-tint-strong); }
      .bg-success-tint { background-color: var(--c-success-bg); }
      .bg-success-tint-soft { background-color: var(--c-success-bg-soft); }
      .bg-danger-tint { background-color: var(--c-danger-bg); }

      .placeholder-faint::placeholder { color: var(--c-text-faint); }
      .focus-border-accent:focus { border-color: var(--c-accent); }

      .hover-text-accent:hover { color: var(--c-accent); }
      .hover-text-cream:hover { color: var(--c-text); }
      .hover-text-danger:hover { color: var(--c-danger-strong); }
      .hover-bg-surface:hover { background-color: var(--c-surface); }
      .hover-bg-surface-2:hover { background-color: var(--c-surface-2); }
      .hover-bg-surface-soft:hover { background-color: rgba(27, 35, 29, 0.7); }

      .icon-flag-fill { color: var(--c-danger-strong); fill: var(--c-danger-strong); }

      .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 500; border-radius: 6px; transition: background-color 0.15s, color 0.15s, border-color 0.15s; }
      .btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn-primary { background-color: var(--c-accent); color: var(--c-accent-text); }
      .btn-primary:hover:not(:disabled) { background-color: var(--c-accent-hover); }
      .btn-ghost { background-color: transparent; color: var(--c-text-dim); }
      .btn-ghost:hover:not(:disabled) { background-color: var(--c-surface); color: var(--c-text); }
      .btn-outline { background-color: transparent; color: var(--c-text); border: 1px solid var(--c-border); }
      .btn-outline:hover:not(:disabled) { background-color: var(--c-surface); }
      .btn-danger { background-color: var(--c-danger-bg); color: var(--c-danger-strong); border: 1px solid var(--c-danger-border); }
      .btn-danger:hover:not(:disabled) { background-color: rgba(204, 120, 120, 0.28); }
      .btn-subtle { background-color: var(--c-surface-2); color: var(--c-text); }
      .btn-subtle:hover:not(:disabled) { background-color: var(--c-surface-3); }

      .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 6px; color: var(--c-text-muted); transition: color 0.15s, background-color 0.15s; }
      .icon-btn:hover { color: var(--c-text); background-color: var(--c-surface); }

      .fab-shadow { box-shadow: 0 18px 28px -8px rgba(219, 182, 115, 0.25), 0 6px 12px -4px rgba(219, 182, 115, 0.15); }

      .toast-bg { background-color: var(--c-text); color: var(--c-bg); }
    `}</style>
  );
}

function Button({ children, onClick, variant = 'primary', size = 'md', disabled, className = '', type = 'button', ...rest }) {
  const sizeCls = size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm';
  const variantCls = `btn btn-${variant}`;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${variantCls} ${sizeCls} ${className}`} {...rest}>
      {children}
    </button>
  );
}

function IconButton({ children, onClick, className = '', title, ...rest }) {
  return (
    <button onClick={onClick} title={title} className={`icon-btn ${className}`} {...rest}>{children}</button>
  );
}

function Modal({ open, onClose, children, title, maxWidth = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center fade-in" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div
        className={`bg-surface border border-default w-full md:rounded-lg md:shadow-2xl md:my-6 ${maxWidth} md:max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-default">
          <h2 className="text-lg font-medium text-cream" style={{ fontFamily: FONT_DISPLAY }}>{title}</h2>
          <IconButton onClick={onClose} title="Close"><X size={18} /></IconButton>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 toast-bg px-4 py-2 rounded-md shadow-lg text-sm fade-in">
      {message}
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

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

// ============================================================================
// NAV
// ============================================================================

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${active ? 'bg-surface text-cream' : 'text-muted hover-text-cream hover-bg-surface-soft'}`}>
      <Icon size={16} /><span>{label}</span>
    </button>
  );
}

function MobileTab({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 ${active ? 'text-accent' : 'text-muted'}`}>
      <Icon size={20} />
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
    </button>
  );
}

// ============================================================================
// THIS WEEK SCREEN
// ============================================================================

function ThisWeekScreen({ week, ltgs, onToggleGoal, onAddGoal, onUpdateGoal, onDeleteGoal, onAddLtg, onUpdateLtg, onArchiveLtg, onOpenReview }) {
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

function LtgGroup({ ltg, goals, collapsed, onToggleCollapse, onToggleGoal, onEditGoal, onDeleteGoal, onRenameLtg, onArchiveLtg }) {
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

function GoalRow({ goal, onToggle, onEdit, onDelete, readOnly = false }) {
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

function GoalIcon({ goal }) {
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

// ============================================================================
// ADD / EDIT MODALS
// ============================================================================

function AddGoalModal({ open, onClose, ltgs, onAdd, onAddLtg }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('achievement');
  const [ltgId, setLtgId] = useState('');
  const [newLtgTitle, setNewLtgTitle] = useState('');
  const [creatingLtg, setCreatingLtg] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) { setTitle(''); setType('achievement'); setLtgId(''); setNewLtgTitle(''); setCreatingLtg(false); setNotes(''); }
  }, [open]);

  const submit = async () => {
    if (!title.trim()) return;
    let useLtgId = ltgId || null;
    if (creatingLtg && newLtgTitle.trim()) {
      const ltg = await onAddLtg(newLtgTitle.trim());
      useLtgId = ltg.id;
    }
    onAdd({ title: title.trim(), type, longTermGoalId: useLtgId, notes: notes.trim() || null });
    onClose();
  };

  const inputCls = "w-full bg-base border border-default rounded-md px-3 py-2 text-cream placeholder-faint outline-none focus-border-accent";

  return (
    <Modal open={open} onClose={onClose} title="New weekly goal">
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
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Note (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Context, why, how..." className={inputCls} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim()}>Add goal</Button>
        </div>
      </div>
    </Modal>
  );
}

function AddLtgModal({ open, onClose, onAdd }) {
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

function EditGoalModal({ open, goal, ltgs, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [ltgId, setLtgId] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (open && goal) { setTitle(goal.title); setLtgId(goal.longTermGoalId || ''); setNotes(goal.notes || ''); }
  }, [open, goal]);
  if (!goal) return null;
  const submit = () => { if (!title.trim()) return; onSave({ title: title.trim(), longTermGoalId: ltgId || null, notes: notes.trim() || null }); };
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
          <label className="block text-xs uppercase tracking-widest text-muted mb-2">Note</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// STAGED-FOR-NEXT-WEEK COMPONENTS
// ============================================================================

function computeStagedView(ltgs, stagedLtgs, stagedGoals) {
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

function StagedGoalRow({ goal, onRename, onRemove }) {
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

function StagedLtgHeader({ ltg, onRename, onRemove }) {
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

function AddStagedGoalModal({ open, onClose, allLtgTitles, onAddGoal, onAddLtg }) {
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

// ============================================================================
// REVIEW SCREEN (conversational)
// ============================================================================

function ReviewScreen({ week, ltgs, meta, loadPastWeek, onClose, onSetNarrativeText, onAddNarrativeVersion, onSetReviewConversation, onComplete, onToast }) {
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

function ChatMessage({ msg, msgIdx, proposalStatus, onAcceptProposal, onDismissProposal }) {
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

function ProposalCard({ kind, primary, secondary, status, onAccept, onDismiss }) {
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

function CommitSheet({ week, ltgs, carrySet, toggleCarry, stagedGoals, setStagedGoals, stagedLtgs, setStagedLtgs, stagedIdeas, setStagedIdeas, onClose, onConfirm }) {
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

// ============================================================================
// HISTORY SCREEN
// ============================================================================

function HistoryScreen({ meta, currentWeekId, ltgs, loadPastWeek, pastWeeks }) {
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

function PastWeekView({ week, ltgs, onBack }) {
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

// ============================================================================
// IDEAS SCREEN
// ============================================================================

function IdeasScreen({ backlog, onAdd, onUpdate, onDelete }) {
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const submit = () => { if (!newText.trim()) return; onAdd(newText.trim()); setNewText(''); };
  const startEdit = (item) => { setEditingId(item.id); setEditText(item.text); };
  const saveEdit = () => { if (editText.trim()) onUpdate(editingId, editText.trim()); setEditingId(null); };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 pt-8 pb-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted mb-1">Backlog</p>
        <h1 className="text-3xl md:text-4xl font-semibold text-cream leading-tight" style={{ fontFamily: FONT_DISPLAY }}>Ideas</h1>
        <p className="text-sm text-muted mt-2">Things to come back to. Future features for this app, mid-week thoughts, anything.</p>
      </header>

      <div className="mb-6 flex gap-2">
        <input value={newText} onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="New idea..."
          className="flex-1 bg-surface-soft border border-default rounded-md px-3 py-2 text-cream placeholder-faint outline-none focus-border-accent" />
        <Button onClick={submit} disabled={!newText.trim()}><Plus size={16} /> Add</Button>
      </div>

      <div className="space-y-1">
        {backlog.length === 0 && <p className="text-sm text-muted italic text-center py-8">No ideas yet.</p>}
        {backlog.map(item => (
          <div key={item.id} className="group flex items-start gap-3 px-3 py-2 rounded hover-bg-surface-soft transition-colors">
            {editingId === item.id ? (
              <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                className="flex-1 bg-base border border-default rounded px-2 py-1 text-cream outline-none" />
            ) : (
              <>
                <span className="text-faint text-sm flex-shrink-0 mt-0.5">•</span>
                <button onClick={() => startEdit(item)} className="flex-1 text-left text-sm text-cream hover-text-accent">
                  {item.text}
                </button>
                <button onClick={() => { if (confirm('Delete this idea?')) onDelete(item.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted hover-text-danger transition-opacity">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

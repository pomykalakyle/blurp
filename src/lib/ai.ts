// @ts-nocheck
import { CLEANUP_PROMPT, CONVERSATION_PROMPT, MODEL } from '../constants';
import { formatWeekLabel, formatWeekShort, isGoalSuccess } from './core';

export function buildReviewContext({ week, ltgs, pastSummaries, stagedGoals = [], stagedLtgs = [], stagedIdeas = [] }) {
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

export function parseAiResponse(raw) {
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

export async function callClaude(_args: { system: string; messages: Array<{ role: string; content: string }>; maxTokens?: number }) {
  throw new Error('Claude API is mocked locally for now.');
}

export async function aiCleanup(narrative: string) {
  void CLEANUP_PROMPT;
  return narrative;
}

export async function aiConverse({ week, ltgs, pastSummaries, messages, isOpening = false }) {
  void CONVERSATION_PROMPT;
  void MODEL;
  const achievements = week.goals.filter(g => g.type === 'achievement');
  const avoidances = week.goals.filter(g => g.type === 'avoidance');
  const hitCount = achievements.filter(g => g.state?.done).length;
  const slipCount = avoidances.filter(g => g.state?.slipped).length;

  if (isOpening) {
    return {
      say: `Mock review assistant is ready. This week you hit ${hitCount}/${achievements.length} achievement goals${avoidances.length ? ` and logged ${slipCount}/${avoidances.length} avoidance slips` : ''}. What stands out most from the week?`,
      narrative: null,
      proposedWeeklyGoals: [],
      proposedLongTermGoals: [],
      proposedIdeas: [],
    };
  }

  const latest = messages[messages.length - 1]?.content || '';
  return {
    say: `Mock reply recorded: "${latest.slice(0, 120)}". Real Claude conversation will be wired up later.`,
    narrative: latest.trim() ? latest.trim() : null,
    proposedWeeklyGoals: [],
    proposedLongTermGoals: [],
    proposedIdeas: [],
  };
}

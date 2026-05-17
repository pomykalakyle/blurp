# Handoff — blurp (Life Tracking App)

## Goal

Personal life-tracking app for Kyle. Currently has:

1. **Goals + long-term goals** — drag-and-drop UI, Convex-backed (shipped before this session).
2. **Claude chat** — talk to Claude inside the app, with proposal cards Kyle accepts/dismisses for any change to his data (shipped in this session, see [chat functional review](./2026-05-17-claude-chat-functional-review.md) and [chat technical review](./2026-05-17-claude-chat-technical-review.md)).
3. **Narrative entries** — Claude-extracted events with start/end dates, on a timeline (shipped in this session, see [narrative functional review](./2026-05-17-narrative-functional-review.md) and [narrative technical review](./2026-05-17-narrative-technical-review.md)).

Stack: Vite 8 + React 19 + TypeScript 6 SPA, Convex backend, Vercel hosting, Vercel AI Gateway → Anthropic (Sonnet 4.6 for chat, Haiku 4.5 for auto-titles). `@convex-dev/agent` component does streaming + tool dispatch on top of Vercel's `ai` SDK.

Deployed at `blurp-ten.vercel.app`. Public, no auth — gated only by URL obscurity (per Kyle's call in the tech review).

## Current Progress

### Done in this session

- **Chat feature** end-to-end: drawer-based nav (Goals / Chat / Narrative), chat list with auto-titles + rename, conversation view with streaming markdown messages, typing indicator while waiting, inline retry on errors, proposal cards inline beneath assistant messages with Accept / Dismiss.
- **Narrative feature** end-to-end: third nav tab; chronological timeline of entries; each entry has title, body, startDate, endDate (nullable for ongoing); created/edited via chat proposal cards using `propose_create_entry` / `propose_edit_entry` tools.
- **AI Gateway** wired up with `AI_GATEWAY_API_KEY` set on both dev (`vivid-shrimp-392`) and prod (`effervescent-labrador-524`) Convex deployments. Kyle added a credit card to Vercel AI Gateway so requests are no longer 403'd.
- **stopWhen: stepCountIs(10)** added to the Agent constructor — without this, the AI SDK runs in single-step mode and tool execute functions never fire.
- **System prompt** in `convex/chatConstants.ts` explicitly tells Claude to always call tools instead of describing changes in prose.
- **Diagnostic logging** in `convex/chat.ts` logs each step's tool calls and finishReason — used to confirm the model actually emits tool_use blocks.
- **Dedup pass**: extracted `makeProposeTool` helper (~50 lines saved across 10 tools); `formatEntryDateRange` lives in `src/lib/date.ts`.
- **Maintainability pass**: all new code is strict TS, internal Convex functions properly use `internalQuery`/`internalMutation`, model IDs + prompts centralized in `convex/chatConstants.ts`.

### Open bug (KNOWN, currently reverted)

**Proposal cards never render because tool execute throws on every call.** Root cause: my `requireThreadAndMessage` helper in `convex/chatAgent.ts:54-63` reads `ctx.messageId`. The Convex Agent SDK's `ToolCtx` *type declaration* in `node_modules/@convex-dev/agent/dist/client/createTool.d.ts:6-11` says the field is `messageId?: string`. But the *runtime* in `node_modules/@convex-dev/agent/src/client/start.ts` populates `promptMessageId` instead. So `ctx.messageId` is always `undefined` and the tool throws with `"threadId or messageId missing"`. Claude then relays that error string verbatim to the user.

A fix was implemented and pushed (commit `9f43f34`) but then **reverted** at Kyle's request (commit `1d7bdee`) because he wanted to fully understand the tool-call protocol before applying fixes. The fix involves:

1. Reading `ctx.promptMessageId ?? ctx.messageId` in `requireThreadAndMessage` and returning `promptMessageId`.
2. Renaming the `proposalCards.messageId` schema field to `promptMessageId` so the field name matches what's actually stored (the user prompt's message ID, not the assistant's).
3. In `src/components/chat/Conversation.tsx`, tracking the most recent user-message ID while iterating and using it to look up cards for the following assistant message (since cards are now keyed by the prompt's user-message ID, not the assistant's).

The fix is correct — the prior deploy showed tools actually firing and writing cards. Apply it again whenever Kyle gives the go-ahead.

## What Worked

- **Convex Agent component + Vercel AI Gateway** is a clean stack. The agent handles persistence, streaming deltas to Convex docs, and the multi-step tool loop. The Gateway handles model routing. No custom HTTP plumbing needed.
- **Push-to-prod iteration**. Kyle's `vercel.json` build command runs `convex deploy` before `vite build`, so a single `git push` deploys both backend schema/functions and frontend in one go. Vercel reports a GitHub status check we can poll via `gh api repos/.../commits/$SHA/status`.
- **Diagnostic via prod logs**. `npx convex logs --prod --history N` (with a Bash background kill since `--watch` is the default and there's no `--once` flag) reliably surfaces both successful function executions and uncaught errors with stack traces. This is how we found the AI Gateway credit-card requirement, the missing `stopWhen`, and confirmed the tool-call dispatch flow.
- **Functional review → technical review → implement → dedup/maintainability passes** as a workflow. Kyle's preferred process and it consistently produced clean outcomes.
- **Strict TS only on new code; legacy `@ts-nocheck` left alone** as a separate cleanup we can sweep later in maintainability passes.

## What Didn't Work

- **Vercel AI Gateway without a credit card on file** — returns 403 `customer_verification_required`. Free credits unlock only after a card is added. The error string is buried in the action's exception; Convex sanitizes it to "Server Error" before the client sees it.
- **Tool calls without `stopWhen`** — easy to miss. The AI SDK silently runs in single-step mode where it surfaces tool_use events in the stream but does NOT execute the tool. Symptom: Claude says "I'll do X" but no execute fires. Fix: pass `stopWhen: stepCountIs(N>1)` on the Agent constructor.
- **Trusting the Convex Agent's TypeScript types** — `ToolCtx.messageId` is on the type declaration but the runtime sets `promptMessageId`. This is upstream drift between the SDK's `.d.ts` and its implementation. Read the source (`node_modules/@convex-dev/agent/src/client/start.ts`) when in doubt about ctx field names.
- **Using `text-parse` mental models for tool calls** — Anthropic's API returns structured `tool_use` content blocks, not text patterns. The Vercel AI SDK matches them by name and invokes our `execute` function directly. No parsing on our side.
- **Kyle's Claude.ai Pro/Max subscription does not confer API credits.** They're separate billing buckets. Anthropic announced Agent SDK credits on Pro/Max plans starting **June 15, 2026** (Pro: $20/mo, Max 5x: $100/mo, Max 20x: $200/mo) — but that's the *Anthropic Agent SDK*, not the Vercel AI SDK. Migrating to it would be a significant rewrite of `convex/chatAgent.ts` plus dropping the Convex Agent component.
- **Hardcoded user — `USER_ID = "kyle"`** in `convex/chat.ts:11`. Fine for v1 single-user; will need to read from `ctx.auth.getUserIdentity()` if auth is ever added.

## Current Worktree State

- **Branch**: `main`, tracks `origin/main`. Working tree clean.
- **Last commit**: `1d7bdee Revert "Fix tool ctx field name: use promptMessageId, not messageId"`.
- **HEAD is what's deployed on Vercel.** Vercel auto-deploys main on push; the GitHub status check confirms success.
- All `convex/` and `src/` files are hand-written. `convex/_generated/` is from `npx convex codegen`. `dist/` is built output (gitignored). `node_modules/` is from `npm install` (gitignored).
- **Untracked files** (intentionally not committed): `.agents/` (Claude Code agent metadata), `skills-lock.json` (plugin skill lockfile).
- **Env vars**: `AI_GATEWAY_API_KEY` set on both Convex dev and prod deployments. `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` in `.env.local` (gitignored).

## Next Steps

1. **Re-apply the tool ctx field name fix** when Kyle says so. The fix is small and proven to work:
   - `convex/chatAgent.ts`: `requireThreadAndMessage` reads `ctx.promptMessageId ?? ctx.messageId`, returns `promptMessageId`. All propose tools pass it as `promptMessageId` to `internal.chatProposals.internalCreate`.
   - `convex/schema.ts`: rename `proposalCards.messageId` → `promptMessageId`; rename index `by_message` → `by_prompt_message`.
   - `convex/chatProposals.ts`: rename arg `messageId` → `promptMessageId` in `internalCreate`.
   - `src/components/chat/Conversation.tsx`: while mapping over messages, track `lastUserId`; for each assistant message, look up cards via `cardsByPromptMessage.get(lastUserId)`.
   - Reference: commit `9f43f34` (reverted) shows exactly these changes.

2. **Verify end-to-end** after the fix: send "create a goal called X" → card appears under Claude's message → Accept → goal shows up in Goals tab. Same flow for `propose_create_entry` → narrative entry shows up in Narrative tab.

3. **If tool calls still don't render correctly**, the next diagnostic to add is logging `ctx` keys at the start of `requireThreadAndMessage` to confirm what fields the agent SDK actually passes. The version we have is `@convex-dev/agent@0.6.1`.

4. **Continue narrative feature work** as Kyle directs once cards work. He's explicitly punted on direct-edit UI in the Narrative tab and a manual `+ New entry` button — both are in the out-of-scope list. The next likely surfaces are mobile UX polish, longer body handling in Claude's context window (currently full body sent), and possibly a settings surface for the "about Kyle" blurb (currently hardcoded in `convex/chatConstants.ts`).

5. **If Kyle wants to migrate to Anthropic API direct** (skipping Vercel AI Gateway) to use his Anthropic console credits instead of Gateway billing, the swap is small: `npm i @ai-sdk/anthropic`, change two `gateway("anthropic/claude-...")` lines in `convex/chatAgent.ts` and `convex/chat.ts` to `anthropic("claude-...-...")`, swap the env var name from `AI_GATEWAY_API_KEY` to `ANTHROPIC_API_KEY` on the Convex deployments. Same pay-per-token pricing, one less middleman.

## Key Files

- `convex/schema.ts` — tables: `goals`, `longTermGoals`, `proposalCards`, `narrativeEntries`.
- `convex/chatAgent.ts` — Agent definition, all tool declarations (10 total: 2 lookup + 8 propose). **Contains the messageId/promptMessageId bug.**
- `convex/chat.ts` — public `createThread`, `listThreads`, `renameThread`, `listMessages`, `sendMessage` action, `maybeGenerateTitle` internal action, `buildDynamicContext` helper. **Diagnostic step logging is here.**
- `convex/chatProposals.ts` — proposal card CRUD + the `applyProposal` switch that mutates the underlying entity on Accept.
- `convex/chatLookups.ts` — internal queries Claude uses for context (`listActiveLtgs`, `listCurrentGoals`, `listEntriesInContextWindow`).
- `convex/chatConstants.ts` — `ABOUT_KYLE_SYSTEM`, `SYSTEM_INSTRUCTIONS`, `CHAT_MODEL`, `TITLE_MODEL`. **The "about Kyle" blurb is a placeholder Kyle will write at some point.**
- `convex/proposalValidator.ts` — shared discriminated-union validator for the 8 proposal kinds. Imported by both `schema.ts` and `chatProposals.ts`.
- `src/App.tsx` — section state, drawer state, current-thread state. Top-level shell.
- `src/components/AppShell.tsx` — drawer nav (desktop sidebar / mobile slide-out), section switcher, chat list embedded.
- `src/components/chat/Conversation.tsx` — message list + input + cards. **The card-lookup logic needs the fix when we re-apply.**
- `src/components/chat/ProposalCard.tsx` — renders all 8 proposal kinds with Accept/Dismiss, plus accepted/stale markers.
- `documentation/2026-05-17-*.md` — all four review docs (functional + technical for chat + narrative).

## Project Context

- **User**: Kyle Pomykala (`pomykalakyle` on GitHub, `kyle@lakesail.com`). LakeSail engineer. Doesn't want LakeSail's "Sail" product referenced in this repo.
- **Working directory**: `/Users/kylepomykala/Documents/projects/Life Tracking App`.
- **App is single-user by design.** No auth in v1; gated by URL obscurity + AI Gateway spend cap (Kyle to configure if he hasn't).
- **Kyle's collaboration preferences** (also in `~/.claude/projects/.../memory/`):
  - Push to prod and verify on Vercel — don't propose local testing.
  - Review docs go in `documentation/` with `YYYY-MM-DD-` filename prefix.
  - Run interactive CLIs himself (background mode); only loop him in for browser OAuth steps.
  - Tight responses, no excessive structure.
  - Don't apply fixes without explicit go-ahead — confirm understanding first.

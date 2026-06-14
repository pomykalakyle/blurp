# Claude Chat — Functional Review

Date: 2026-05-17
Status: Draft for review

---

## 1. Summary

A conversational surface for Claude inside Blurp. the user opens a Chat section, starts or returns to a thread, and talks freely with Claude about his goals, his long-term goals, and how he's thinking about his life. Claude can see the user's current goals and long-term goals on every turn and can look up older information when relevant. When Claude wants to make a change — add a goal, archive a long-term goal, mark something done — it doesn't act directly; it surfaces a proposal card that the user taps to accept or ignore. The chat works equally well on phone and desktop, syncs across both, and is structured so Claude can eventually be granted more autonomy without rebuilding it.

---

## 2. Navigation

Chat is a top-level section of the app, accessed from the same primary navigation as Goals (and the future Weeks / History / Ideas sections as they're built). The nav follows the dominant pattern used by Claude.ai, ChatGPT, and most chat products: a single navigation drawer that holds both the app's section switcher and the list of conversations.

- **Desktop (≥768px)**: the drawer is always visible as a persistent left sidebar. Top of the sidebar holds the section switcher (Goals, Chat, …); below it, when Chat is the active section, sits the chat list with a "+ New chat" button at the top of that list. The right side of the screen renders the active section — in Chat, that's the active conversation.
- **Mobile (<768px)**: the same drawer slides out from the left, opened by a menu button at the top-left of the screen. It contains the same content as desktop. Tapping a chat or a section selects it and closes the drawer automatically so the conversation has the full screen.

Tap targets are at least 44px on mobile. The chat input sits above the iOS keyboard without being clipped.

---

## 3. Chat list

Every thread the user has ever had appears in the list, sorted by most-recent activity, descending. Each row shows the title, a short preview snippet from the most recent message, and a relative time ("2h", "Yesterday", "May 11"). the user can open a chat or rename it; deletion is not in v1.

Titles are generated automatically after the first user→assistant exchange, summarized into 3–6 words and saved to the thread. Until that completes, the row reads "Untitled." the user can rename a chat at any time, and once he renames it manually, auto-titling never overwrites that title.

A "+ New chat" affordance is always visible. The first time the user opens Chat with no existing threads, the app drops him straight into a new empty conversation rather than showing an empty-state screen — the first message he sends creates the thread.

Threads, messages, titles, and renames sync across devices in near-real-time. A conversation started on desktop continues seamlessly on phone.

---

## 4. Conversation

The active conversation fills the right pane on desktop and the screen on mobile.

### 4.1 The chat surface

Top to bottom, the conversation contains a header with the chat title and a rename affordance; a scrollable message list with user messages right-aligned and Claude messages left-aligned; and an input row pinned to the bottom with a multiline textarea and a send button. While a response is streaming, the send button becomes a stop-generating button that cancels in place.

Claude's responses stream in as they're generated. Markdown is rendered in Claude's messages — paragraphs, lists, code blocks, bold/italic, inline links. Long messages wrap and remain readable on phone.

If the user navigates away to another section (or another chat) while a response is still streaming, the response keeps generating in the background. When he returns to the conversation, the completed message is there. The navigation itself shows no in-progress indicator.

### 4.2 Proposal cards — Claude's write surface

Claude cannot mutate the user's data directly. When Claude wants to make a change, it surfaces a structured proposal card inline beneath its message. the user is the one who applies it.

**Lifetime.** A card is live only until the user's next message in the same thread. Sending another message implicitly dismisses any unaccepted cards from prior turns — they collapse out of view and are not recoverable. Accepting or explicitly dismissing a card before the next message removes it immediately. Accepted cards leave behind a small in-message marker ("Added goal: Workout 3x") so the conversation record honestly reflects what was applied.

**What Claude can propose.**

1. Create a weekly goal — title, type (achievement / avoidance), optional long-term parent, optional end date, optional note.
2. Create a long-term goal — title, optional description.
3. Edit an existing goal or long-term goal — title, parent, end date, notes, with a before/after view.
4. Archive a long-term goal — shows the LTG title with an Archive action.
5. Toggle goal state — mark an achievement done, or flag an avoidance slip.

Every card has Accept and Dismiss buttons. Accept applies the change immediately and stamps the in-message marker.

**Stale proposals.** If the underlying goal or long-term goal that a card targets has changed (renamed, archived, deleted) since Claude proposed the action, the card visually marks itself stale and Accept is disabled. the user would have to ask Claude again with the current state in mind.

**Constraints.** In v1, Claude cannot delete goals or long-term goals, reorder them, change drag positions, modify anything outside the goals / long-term goals domain (chat metadata, app preferences, etc.), or act without the user's tap. There is no agent mode.

### 4.3 What Claude knows — Claude's read surface

**On every turn (implicit).** Each turn, the context Claude receives includes today's date, a short personal-context paragraph about the user, all active long-term goals (title, description), and all current weekly goals (title, type, state, long-term parent if any, end date, notes). This is refreshed every turn so Claude never reasons from stale state.

**By looking it up (tools).** When a conversation calls for it, Claude can fetch archived long-term goals, past or ended weekly goals, and — forward-compatible — past weeks and weekly narratives once those parts of the app exist. These lookups happen mid-turn and inform the same response; looked-up content is not stored back into the chat record. Each tool call surfaces as a small inline indicator in the assistant's message ("Looking up archived goals…") so the user can see what Claude is doing without the raw inputs and outputs cluttering the conversation.

**Persona and personal context.** For v1, Claude's instructions and the user's personal-context paragraph live in code, not in the app's UI. the user tunes them over time. There is no in-app settings screen for editing these.

**What Claude does not see.** Other chat threads — each conversation is independent and Claude has no cross-thread memory. Anything outside the app — no calendar, email, Slack, files.

---

## 5. Out of scope for v1

- Deleting chats.
- Editing past user messages, regenerating Claude's responses, or deleting individual messages.
- Voice input or text-to-speech in the chat.
- File or image attachments in messages.
- Cross-chat memory ("Claude remembers things from your other conversations").
- Search across chats; pinning chats.
- Per-chat model selection.
- Full agent mode (Claude acting without confirmation).
- Reading or writing data outside the goals / long-term goals domain — weeks, narratives, ideas, and any other future tables are off-limits to chat in v1, even after they're built, until they're explicitly added to the implicit seed or tool list.
- Multi-user / sharing chats.
- Cost dashboards or in-app spend controls.
- A Settings screen of any kind.

---

End of v1 functional review.

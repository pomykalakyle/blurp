# Narrative — Functional Review

Date: 2026-05-17
Status: Draft for review

---

## 1. Summary

A narrative is the user's running record of what's happening in his life — events, decisions, thoughts, things he's working through — captured as discrete entries that each have a title, a body, a start date, and an optional end date. Entries are created and edited through chat: as the user talks with Claude, Claude proposes new entries and edits to existing ones, surfaced as accept/dismiss cards the same way goal proposals work. A new Narrative section lists every entry on a chronological timeline so the user can scroll back through what's been happening. Recently-relevant entries are part of Claude's context on every turn so the chat naturally stays current with his life, without Claude being told to talk about them.

---

## 2. Entries

A narrative entry has:

- **Title** — short, descriptive ("Considering a job change", "Started lifting again").
- **Body** — free-form text, can be one sentence or several paragraphs. Reflections the user adds later via chat live in the body too.
- **Start date** — when the event began.
- **End date** — when it ended. Can be the same as the start date (a one-day event), a later date (a span), or **null** for ongoing things that haven't resolved yet.

The Narrative section is a new top-level destination alongside Goals and Chat, surfaced from the same nav drawer. Inside, entries are listed chronologically by start date, most recent first. Each row shows the title, the date range, and a short preview of the body. Tapping a row expands it to show the full body. Ongoing entries (no end date) are marked visually so the user can see at a glance what's still in progress.

---

## 3. Working with entries through chat

Chat is the only way to create or edit entries in v1. the user never types into the Narrative section directly.

Narrative cards behave **identically to goal proposal cards** — see the [chat functional review §5](./2026-05-17-claude-chat-functional-review.md): they appear inline beneath the assistant message that produced them, sit at the bottom of the conversation since the latest assistant message is always at the bottom, stay live only until the user sends his next message, and get implicitly dismissed when he moves on. Same Accept and Dismiss buttons, same stale-detection rules, same in-message marker after Accept.

### Creating an entry

As the user is talking with Claude, when something he says reads as an event worth recording, Claude surfaces a proposal card with the proposed entry: title, body, start date, end date (or "ongoing"). Accept adds it to the narrative; Dismiss ignores it; sending another message before either expires it.

A single chat can produce many entries. Claude is encouraged to propose granularly — three small entries are better than one entry mashing three things together.

### Editing an entry

Claude can also propose edits to entries that already exist. An edit-proposal card shows which entry is being changed and what the change is — a new title, modified body, updated start or end date, or "close this entry" (setting end_date on something that was previously ongoing).

The most common edit is appending a reflection: the user revisits something in chat and a new thought belongs at the bottom of an existing entry's body. That's just an edit proposal that modifies the body.

---

## 4. Claude's awareness

On every chat turn, Claude's context includes entries from a 2-week window plus everything that's still open:

- Any entry whose **end_date** falls within the last 14 days.
- Any entry whose **end_date is null** (ongoing), regardless of when it started.

For each included entry, Claude sees the title, the date range, and the body.

There is no instruction either direction about whether to reference entries in conversation. They're just available in Claude's context. Sometimes Claude will naturally pull from them, sometimes it won't — both are fine.

---

## 5. Out of scope for v1

- Editing entries directly inside the Narrative section (no inline editing UI). All edits happen via chat.
- A manual "+ New entry" button in the Narrative section. Chat is the only entry point.
- Deleting entries.
- Tags or categories on entries.
- Search across entries.
- Linking entries to specific goals or long-term goals (no foreign-key relationships; if an entry mentions a goal, it does so in its body text).
- Auto-generation of entries without the user's tap (Claude always proposes; never writes silently).
- Visual timeline beyond a chronological list — no Gantt-style overlap rendering, no grouping by month, no calendar view.
- Voice input or text-to-speech for entries.
- Exporting the narrative.

---

End of v1 functional review.

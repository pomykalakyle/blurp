# Claude Chat — Technical Review

Date: 2026-05-17
Status: Draft for review
Companion to: [2026-05-17-claude-chat-functional-review.md](./2026-05-17-claude-chat-functional-review.md)

---

## 1. Summary

The chat feature uses Convex as the single data layer for both persistence and streaming, the Vercel AI Gateway as the model provider, and the AI SDK as the calling library. Streaming chunks land directly on Convex and the React client renders them reactively — no separate SSE pipe, no dual data path.

---

## 2. Streaming architecture

We use the `@convex-dev/agent` Convex component. It runs the AI SDK's `streamText` inside a Convex action, batches streaming deltas (throttled so we don't write per-token), and exposes React hooks that render the in-progress message reactively. This is the pattern Convex officially recommends for AI chat in 2026 and gets us cross-device sync of in-progress responses for free.

Reference: [Convex Agent docs](https://docs.convex.dev/agents) · [streaming guide](https://docs.convex.dev/agents/streaming).

---

## 3. AI calls

- **Provider**: all Anthropic calls go through the Vercel AI Gateway via `@ai-sdk/gateway`. The gateway key is a server-side Convex env var.
- **Models**: Sonnet 4.6 for chat turns; Haiku 4.5 for auto-title.
- **Read tools**: Claude's lookups (archived LTGs, ended goals) are AI SDK tools that the Agent runs server-side. Tool calls are persisted so the UI can render the "Looking up archived goals…" indicator.
- **Write surface (proposal cards)**: cards are *not* tools. Claude emits them as structured output and the server persists them in a `live` state. When the user sends the next message in a thread, any prior `live` cards flip to `expired`. When the user taps Accept, the server re-verifies the target hasn't changed; if it has, the card flips to `stale` with Accept disabled; otherwise the change applies and the card flips to `accepted`.

---

## 4. Deployment and cost protection

No auth in v1; the deployment is gated by the URL being unguessable. To bound the risk of someone finding it:

- A hard monthly spend cap on the Vercel AI Gateway project.
- Per-IP rate limiting at the gateway.

---

## 5. Post-build passes

After the feature is working end-to-end, two cleanup passes run before we consider it done:

1. **Deduplication** across the whole codebase — repeated logic, duplicated UI components, scattered prompts or model IDs.
2. **Long-term maintainability** — remove `@ts-nocheck`, consolidate env-var reads, ensure internal Convex functions are registered as `internal*`, audit tool wrappers against their underlying queries.

---

End of v1 technical review.

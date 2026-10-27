# Gmail Bulk Archiver — Design

2026-10-27

## Why

Airmail's native MCP server (`airmail-mcp`) has a confirmed bug: `move_messages` and related actions silently route mail to Trash regardless of destination, independent of anything the calling agent does — verified via `list_operations` and Gmail's own API directly. Rules built on top of it have also been observed to silently revert their destinations over time. This script talks to Gmail's API directly via Apps Script's Advanced Gmail Service, bypassing Airmail's native app entirely for any further bulk inbox cleanup.

## What

A rule-driven, resumable, reversible Gmail inbox archiver, run from script.google.com under the user's own Google OAuth consent (unavoidable one-time human click — no tool can perform this step on the user's behalf).

## Decisions (from brainstorming)

1. **Rule philosophy:** generic Gmail-category rules (Promotions/Social/Updates/Newsletters by age), not sender-specific rules — those are already handled separately by the Airmail rules already in place (DoorDash, Hostinger, LinkedIn, PayPal, utility bills, etc.), despite that layer's own reliability problems.
2. **Stripe payment-failure emails** (Cursor, Grok xAI — active unresolved billing issue): no special exclusion added. They're unread and recent; the age-gated rules (`>7d`, `>30d`, `>1y`) won't reach them until the underlying billing issue would already be stale news.
3. **Broadest rule** (`Read & unlabeled >1y`, no sender/category match required): kept as-is. Safety comes from the script's existing `DRY_RUN: true` default — the per-rule count report is reviewed before anything is flipped to live.

## Architecture

- `appsscript.json` — manifest enabling the Gmail Advanced Service (`gmail` v1) and minimal OAuth scopes (`gmail.modify`, `gmail.labels`, `script.scriptapp`, `script.send_mail`).
- `Code.gs` — single-file engine:
  - `RULES[]` — ordered list of `{name, query}`; first match wins since archived mail leaves the inbox.
  - `CFG.PROTECT` — appended to every rule query: excludes starred, `label:keep`, chats, snoozed.
  - `engine_()` — pages through `Gmail.Users.Messages.list`, archives via `batchModify` (500/call) under `DRY_RUN` gating, checkpoints to Script Properties every batch, self-reschedules via a one-shot trigger when nearing the 6-minute Apps Script execution limit.
  - Every live-mode run tags archived messages with a per-run undo label (`Cleanup/Archived/<runId>`); `undoRun(runId)` restores them to Inbox and removes the label.
  - `withRetry_()` — exponential backoff with jitter on rate-limit/5xx errors.

## Workflow

1. Paste `appsscript.json` + `Code.gs` into script.google.com (manual — Google requires the owning account to authorize).
2. Run `start()` with the default `DRY_RUN: true`. Emailed report shows per-rule match counts, nothing changes.
3. Review counts, especially the `Read & unlabeled >1y` rule.
4. Set `DRY_RUN: false`, run `start()` again. Self-resumes automatically if it exceeds one execution window.
5. If needed: `listRuns()` to find a run ID, `undoRun('<runId>')` to fully reverse that run.

## Out of scope

- No changes to the script's default `RULES` array — the brainstorm concluded the defaults already match the decisions above.
- Not integrated with Airmail in any way; operates purely via Gmail's own API.

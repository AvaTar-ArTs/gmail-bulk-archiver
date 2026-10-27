# Gmail Bulk Archiver

Rule-driven, resumable, reversible Gmail inbox cleanup. Talks directly to Gmail's API via Apps Script's Advanced Gmail Service — does not go through Airmail or any third-party bridge.

Design rationale: `docs/plans/2026-10-27-gmail-bulk-archiver-design.md`

## Why this exists

Airmail's `move_messages` tool was found to silently route mail to Trash regardless of requested destination, confirmed independently via Gmail's own API. This script is a separate, safer path for bulk inbox cleanup that never touches Airmail's native app.

## Setup — step by step

This part cannot be automated: Google requires the account owner to personally click through the OAuth consent screen. Nothing can do that step on your behalf.

### 1. Create the Apps Script project

1. Go to **script.google.com**
2. Click **New project**
3. You'll see a blank `Code.gs` already open in the editor

### 2. Paste in the engine code

1. Select everything in the default `Code.gs` editor (⌘A) and delete it
2. Open this repo's `Code.gs`, copy the full contents, paste into the editor
3. Press ⌘S (or the save icon) to save

### 3. Enable the manifest file

1. Click the **gear icon** (Project Settings) in the left sidebar
2. Check the box **"Show appsscript.json manifest file in editor"**
3. Click the **< >** (Editor) icon in the left sidebar to go back to the code view
4. You'll now see a new file, `appsscript.json`, in the file list — click it

### 4. Paste in the manifest

1. Select everything in that editor (⌘A) and delete it
2. Open this repo's `appsscript.json`, copy the full contents, paste into the editor
3. Press ⌘S to save

At this point your project has two files: `Code.gs` and `appsscript.json`, matching this repo exactly.

### 5. Run it for the first time (dry run)

1. At the top of the editor, there's a function dropdown (next to the Run/Debug buttons) — select **`start`**
2. Click **Run** (▶)

### 6. The one unavoidable manual step: OAuth consent

The first time you run anything, Google interrupts with an authorization flow:

1. A dialog titled **"Authorization required"** appears — click **Review permissions**
2. A Google account picker appears — choose the Gmail account this script should clean up (`sjchaplinski@gmail.com`)
3. You may see a screen saying **"Google hasn't verified this app"** — this is expected for a script you wrote yourself and only you run. Click **Advanced**, then **Go to [project name] (unsafe)**. ("Unsafe" here just means Google hasn't put it through their formal verification review, not that anything is actually wrong — this is the standard flow for any personal Apps Script that touches Gmail.)
4. A permissions screen lists exactly what the script can do — matching the four scopes in `appsscript.json` (read/modify your mail, manage labels, run as scheduled triggers, send mail as you). Review it, then click **Allow**
5. You're returned to the editor. The function that was waiting now actually runs.

### 7. Check the result

1. Click the **Execution log** icon (or View → Logs) to see console output
2. Check your email — you'll receive a message titled **"Gmail cleanup finished: DRY RUN (nothing changed)"** with a per-rule count breakdown
3. Nothing in your mailbox has changed yet — `DRY_RUN: true` is the default

### 8. Review the dry-run numbers

Look especially at the **`Read & unlabeled >1y`** count — it's the broadest rule (any read, unlabeled inbox mail older than a year, no sender/category match required). If that number looks too large, you can edit the `RULES` array in `Code.gs` before going live — e.g. remove that rule entirely, or add `-older_than:2y` style constraints.

### 9. Go live

1. In the `Code.gs` editor, find the line `DRY_RUN: true,` near the top
2. Change it to `DRY_RUN: false,`
3. Save (⌘S)
4. Select `start` from the function dropdown again, click **Run**
5. No new consent prompt should appear (you already granted the scopes in step 6) — it runs immediately
6. If the run is large, it will pause and auto-resume via a scheduled trigger every ~60 seconds until done (this shows up as "Paused at rule... Auto-resuming" in the log and as scheduled triggers under the clock icon in the left sidebar)
7. A final email arrives titled **"Gmail cleanup finished: LIVE"** with the real counts and an `undoRun(...)` command to copy if needed

### 10. Undo, if needed

1. Select `listRuns` from the function dropdown, click Run, check the log for the run ID (format `Cleanup/Archived/YYYYMMDD-HHMM`)
2. In the function dropdown, you can't pass arguments directly — instead, temporarily add a one-line wrapper at the bottom of `Code.gs`:
   ```javascript
   function doUndo() { undoRun('20261027-1405'); } // use your actual run ID
   ```
3. Save, select `doUndo` from the dropdown, click Run
4. Everything that run archived moves back to your Inbox

## Reference: entry points

| Function | What it does |
|---|---|
| `start()` | Resets state and begins a fresh run |
| `run()` | Resumes an in-progress run (called automatically by the self-scheduling trigger) |
| `status()` | Logs the current saved run state |
| `reset()` | Clears saved state and any pending triggers, without running anything |
| `listRuns()` | Logs all undo-label run IDs |
| `undoRun(runId)` | Restores every message archived in that run back to Inbox |

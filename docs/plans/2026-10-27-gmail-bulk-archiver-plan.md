# Gmail Bulk Archiver Implementation Plan

**Goal:** Produce a ready-to-paste Apps Script project (`appsscript.json` + `Code.gs`) implementing the approved design, plus a README with manual setup steps.

**Architecture:** Single-file Apps Script engine talking directly to Gmail's API via the Advanced Gmail Service. No local execution is possible — Apps Script only runs under the owning Google account's OAuth consent in script.google.com.

**Tech Stack:** Google Apps Script (V8 runtime), Gmail API v1 (Advanced Service).

**Verification approach:** No TDD cycle applies — there is no local Gmail API to test against. Each file gets a syntax check (`node --check` for `Code.gs`, `python3 -m json.tool` for `appsscript.json`) as the closest available automated verification. Functional correctness was established during the brainstorm's code review, not re-derived here.

---

### Task 1: Write appsscript.json

**Objective:** Manifest enabling the Gmail Advanced Service with minimal required scopes.

**Files:**
- Create: `/Users/steven/github/gmail-bulk-archiver/appsscript.json`

**Step 1: Write the file** — exact content from the approved design (the pasted script content from the conversation, enabledAdvancedServices Gmail v1, the 4 oauthScopes).

**Step 2: Verify valid JSON**

Run: `python3 -m json.tool /Users/steven/github/gmail-bulk-archiver/appsscript.json`
Expected: pretty-printed JSON echoed back, no error.

**Step 3: Commit**

```bash
cd /Users/steven/github/gmail-bulk-archiver
git add appsscript.json
git commit -m "Add Apps Script manifest"
```

---

### Task 2: Write Code.gs

**Objective:** The full engine — entry points, rule engine, undo mechanism, retry helper — unmodified from the design (RULES array kept at its defaults per the brainstorm decision).

**Files:**
- Create: `/Users/steven/github/gmail-bulk-archiver/Code.gs`

**Step 1: Write the file** — exact content as reviewed during brainstorming.

**Step 2: Verify valid JavaScript syntax**

Run: `node --check /Users/steven/github/gmail-bulk-archiver/Code.gs`
Expected: no output, exit code 0. (Apps Script globals like `Gmail`, `PropertiesService`, `ScriptApp` are undefined in plain Node — `--check` only parses syntax, it does not execute, so this is safe and sufficient as a syntax gate.)

**Step 3: Commit**

```bash
cd /Users/steven/github/gmail-bulk-archiver
git add Code.gs
git commit -m "Add Gmail bulk archiver engine"
```

---

### Task 3: Write README with setup steps

**Objective:** Manual setup instructions, since execution requires the user's own one-time OAuth consent click that no tool can perform on their behalf.

**Files:**
- Create: `/Users/steven/github/gmail-bulk-archiver/README.md`

**Step 1: Write the file**, covering:
1. Go to script.google.com → New Project
2. Paste `Code.gs` content into the default file
3. Project Settings → check "Show appsscript.json manifest file in editor"
4. Open the newly visible `appsscript.json`, replace with this repo's content
5. Save
6. Select `start` from the function dropdown, click Run
7. First run: Google shows an OAuth consent screen — review the requested scopes, click Allow (this is the one step that must be done by the account owner, not automatable)
8. Check the emailed dry-run report
9. Flip `DRY_RUN` to `false` in `Code.gs`, run `start()` again
10. `listRuns()` / `undoRun('<runId>')` if a run needs reversing

**Step 2: Commit**

```bash
cd /Users/steven/github/gmail-bulk-archiver
git add README.md
git commit -m "Add setup README"
```

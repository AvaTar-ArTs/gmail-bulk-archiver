/**
 * Gmail Bulk Archiver: rule-driven, resumable, reversible.
 * Entry points: start(), status(), undoRun('<runId>'), listRuns(), reset()
 */
const CFG = {
  DRY_RUN: true,                     // flip to false after reviewing the dry-run report
  NOTIFY: true,                      // email a summary when finished
  UNDO_PREFIX: 'Cleanup/Archived',   // each run gets <prefix>/<runId>
  TIME_BUDGET_MS: 5 * 60 * 1000,     // stop before the 6-min hard limit
  RESUME_AFTER_SEC: 60,              // delay before the next self-scheduled run
  PAGE_SIZE: 500,                    // messages.list max
  // Appended to EVERY rule. Anything matching these is never touched.
  PROTECT: ' -is:starred -label:keep -in:chats -is:snoozed',
  // Rules run in order. First match wins because archived mail leaves the inbox.
  RULES: [
    { name: 'Promotions >7d',  q: 'in:inbox category:promotions older_than:7d' },
    { name: 'Social/Forums >7d', q: 'in:inbox (category:social OR category:forums) older_than:7d' },
    { name: 'Read updates >30d', q: 'in:inbox category:updates older_than:30d -is:unread -has:userlabels' },
    { name: 'Newsletters >30d', q: 'in:inbox (unsubscribe OR "view in browser") older_than:30d -is:unread -is:important' },
    { name: 'Read & unlabeled >1y', q: 'in:inbox older_than:1y -is:unread -is:important -has:userlabels' },
  ],
};

/* ---------------- entry points ---------------- */

function start() { reset(); run(); }

function run() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { console.log('Another run is active; exiting.'); return; }
  try { clearTriggers_(); engine_(); }
  finally { lock.releaseLock(); }
}

function status() { console.log(JSON.stringify(loadState_(), null, 2)); }

function reset() {
  clearTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('STATE');
}

/** Lists undo labels so you can pick a runId. */
function listRuns() {
  const labels = withRetry_(() => Gmail.Users.Labels.list('me')).labels || [];
  labels.filter(l => l.name.indexOf(CFG.UNDO_PREFIX + '/') === 0)
        .forEach(l => console.log(l.name));
}

/** Restores every message archived in a given run back to the inbox. */
function undoRun(runId) {
  if (!runId) throw new Error("Pass a runId, e.g. undoRun('20261027-1405')");
  const name = CFG.UNDO_PREFIX + '/' + runId;
  const label = (withRetry_(() => Gmail.Users.Labels.list('me')).labels || [])
    .filter(l => l.name === name)[0];
  if (!label) throw new Error('No such label: ' + name);
  const t0 = Date.now(); let restored = 0;
  while (Date.now() - t0 < CFG.TIME_BUDGET_MS) {
    // Always re-query page 1: processed messages drop out of the result set.
    const res = withRetry_(() => Gmail.Users.Messages.list('me', {
      labelIds: [label.id], maxResults: CFG.PAGE_SIZE, fields: 'messages/id'
    }));
    const ids = (res.messages || []).map(m => m.id);
    if (!ids.length) {
      withRetry_(() => Gmail.Users.Labels.remove('me', label.id));
      console.log('Undo complete. Restored ' + restored + ' messages; label removed.');
      return;
    }
    withRetry_(() => Gmail.Users.Messages.batchModify(
      { ids: ids, addLabelIds: ['INBOX'], removeLabelIds: [label.id] }, 'me'));
    restored += ids.length;
  }
  console.log('Time budget hit after ' + restored + '. Run undoRun again to continue.');
}

/* ---------------- engine ---------------- */

function engine_() {
  const t0 = Date.now();
  const st = loadState_();
  const undoLabelId = CFG.DRY_RUN ? null : ensureLabel_(CFG.UNDO_PREFIX + '/' + st.runId);

  while (st.ruleIdx < CFG.RULES.length) {
    const rule = CFG.RULES[st.ruleIdx];
    const q = rule.q + CFG.PROTECT;

    while (true) {
      if (Date.now() - t0 > CFG.TIME_BUDGET_MS) {
        saveState_(st);
        ScriptApp.newTrigger('run').timeBased().after(CFG.RESUME_AFTER_SEC * 1000).create();
        console.log('Paused at rule "' + rule.name + '". Auto-resuming in ' + CFG.RESUME_AFTER_SEC + 's.');
        return;
      }
      // Live mode: always page 1 (results shrink as we archive).
      // Dry run: nothing changes, so we must follow pageToken to avoid looping forever.
      const params = { q: q, maxResults: CFG.PAGE_SIZE, fields: 'messages/id,nextPageToken' };
      if (CFG.DRY_RUN && st.pageToken) params.pageToken = st.pageToken;
      const res = withRetry_(() => Gmail.Users.Messages.list('me', params));
      const ids = (res.messages || []).map(m => m.id);
      if (!ids.length) break;

      if (!CFG.DRY_RUN) {
        withRetry_(() => Gmail.Users.Messages.batchModify(
          { ids: ids, removeLabelIds: ['INBOX'], addLabelIds: [undoLabelId] }, 'me'));
      }
      st.counts[rule.name] = (st.counts[rule.name] || 0) + ids.length;
      st.total += ids.length;

      if (CFG.DRY_RUN) {
        st.pageToken = res.nextPageToken || null;
        if (!st.pageToken) break;
      }
      saveState_(st); // cheap checkpoint after every batch
    }
    st.ruleIdx++; st.pageToken = null; saveState_(st);
  }
  finish_(st);
}

function finish_(st) {
  const mode = CFG.DRY_RUN ? 'DRY RUN (nothing changed)' : 'LIVE';
  const lines = CFG.RULES.map(r => '  ' + r.name + ': ' + (st.counts[r.name] || 0));
  const body = mode + ' | run ' + st.runId + '\nMessages matched/archived: ' + st.total +
    '\n' + lines.join('\n') +
    (CFG.DRY_RUN ? '' : '\n\nUndo with: undoRun("' + st.runId + '")');
  console.log(body);
  if (CFG.NOTIFY) {
    MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Gmail cleanup finished: ' + mode, body);
  }
  PropertiesService.getScriptProperties().deleteProperty('STATE');
  clearTriggers_();
}

/* ---------------- helpers ---------------- */

function loadState_() {
  const raw = PropertiesService.getScriptProperties().getProperty('STATE');
  if (raw) return JSON.parse(raw);
  return {
    runId: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm'),
    ruleIdx: 0, pageToken: null, counts: {}, total: 0,
  };
}

function saveState_(st) {
  PropertiesService.getScriptProperties().setProperty('STATE', JSON.stringify(st));
}

function ensureLabel_(name) {
  const existing = (withRetry_(() => Gmail.Users.Labels.list('me')).labels || [])
    .filter(l => l.name === name)[0];
  if (existing) return existing.id;
  return withRetry_(() => Gmail.Users.Labels.create(
    { name: name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }, 'me')).id;
}

function clearTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'run')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

/** Exponential backoff with jitter for rate limits (429/403 rateLimit) and 5xx. */
function withRetry_(fn, attempts) {
  attempts = attempts || 6;
  for (let i = 0; ; i++) {
    try { return fn(); }
    catch (e) {
      const msg = String(e && e.message || e);
      const transient = /rate|quota|limit|backend|50\d|timed out|unavailable|try again/i.test(msg);
      if (!transient || i >= attempts - 1) throw e;
      Utilities.sleep(Math.min(32000, 1000 * Math.pow(2, i)) + Math.random() * 500);
    }
  }
}

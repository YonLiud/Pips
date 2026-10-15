import { db, root, claim, event, runtime } from '../../packages/storage/index.ts';
import { Codex } from '../../packages/codex/index.ts';
import { mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Single worker only. Fail closed on a stale lock; operator reconciles it after a crash.
const lockPath = resolve(root, 'worker.lock');
let lock: number;
try { lock = openSync(lockPath, 'wx'); } catch { throw new Error('Worker lock exists. Stop other workers and reconcile interrupted work before removing data/worker.lock.'); }
let stopping = false;
const codex = new Codex();
let active: any = null;
let turnId: string | null = null;
let done: ((status: string) => void) | null = null;
let fatal: Error | null = null;
codex.on('offline', e => { fatal = e; done?.('interrupted'); });
codex.on('notice', msg => {
  if (!active || (msg.params?.threadId && msg.params.threadId !== active.thread_id)) return;
  if (msg.method === 'item/agentMessage/delta') {
    const text = msg.params.delta || '';
    db.prepare('UPDATE runs SET output=output || ? WHERE id=?').run(text, active.id);
    event(active.id, 'delta', { text });
  }
  if (msg.method === 'pips/requestRejected') event(active.id, 'tool_request_rejected', msg.params);
  if (msg.method === 'error' || (msg.method === 'turn/completed' && msg.params.turn.error)) {
    const error = msg.params?.turn?.error?.message || msg.params?.error?.message || msg.params?.message || 'Runtime error';
    db.prepare('UPDATE runs SET error=? WHERE id=?').run(error, active.id);
    event(active.id, 'runtime_error', { message: error });
  }
  if (msg.method === 'turn/started') turnId = msg.params.turn.id;
  if (msg.method === 'turn/completed') done?.(msg.params.turn.status);
});
function shutdown() { stopping = true; codex.close(); done?.('interrupted'); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
try {
  db.prepare("UPDATE runs SET status='interrupted',error='Worker restarted; review before retry' WHERE status IN ('running','cancelling')").run();
  runtime('connecting');
  await codex.start();
  try {
    const catalog: any = await codex.rpc('model/list', { limit: 100, includeHidden: false });
    const replace = (models: any[]) => {
      db.exec('BEGIN IMMEDIATE');
      try {
      db.prepare('DELETE FROM runtime_models').run();
      const insert = db.prepare('INSERT INTO runtime_models(model,display_name,description,is_default,position) VALUES(?,?,?,?,?)');
      models.forEach((item, position) => insert.run(item.model, item.displayName || item.model, item.description || '', Number(Boolean(item.isDefault)), position));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    };
    replace(Array.isArray(catalog?.data) ? catalog.data : []);
  } catch (e: any) { console.error(`Model catalog unavailable: ${e.message}`); }
  runtime('ready');
  let lastHeartbeat = 0;
  while (!stopping && !fatal) {
    if (Date.now() - lastHeartbeat > 5000) { runtime('ready'); lastHeartbeat = Date.now(); }
    const run: any = claim();
    if (!run) { await delay(250); continue; }
    active = run; turnId = null;
    const pip: any = db.prepare('SELECT * FROM pips WHERE id=?').get(run.pip_id);
    try {
      const cwd = resolve(root, 'workspaces', pip.id); mkdirSync(cwd, { recursive: true });
      const settings = { cwd, approvalPolicy: 'never', sandbox: 'read-only', ...(run.model ? { model: run.model } : {}), ...(pip.instructions ? { developerInstructions: pip.instructions } : {}) };
      const thread = pip.thread_id
        ? await codex.rpc('thread/resume', { threadId: pip.thread_id, ...settings })
        : await codex.rpc('thread/start', settings);
      active.thread_id = thread.thread.id;
      db.prepare('UPDATE pips SET thread_id=? WHERE id=?').run(active.thread_id, pip.id);
      const completion = new Promise<string>(resolve => { done = resolve; });
      if (stopping || fatal) throw new Error('Runtime unavailable');
      const beforeStart: any = db.prepare('SELECT status FROM runs WHERE id=?').get(run.id);
      if (beforeStart.status === 'cancelling') {
        db.prepare("UPDATE runs SET status='cancelled' WHERE id=?").run(run.id);
        event(run.id, 'cancelled', {});
        continue;
      }
      const started = await codex.rpc('turn/start', { threadId: active.thread_id, input: [{ type: 'text', text: run.prompt }] });
      turnId = started.turn.id;
      let cancelSent = false;
      let timedOut = false;
      const watchdog = setTimeout(() => { timedOut = true; codex.close(); done?.('interrupted'); }, 10 * 60 * 1000);
      const poll = setInterval(() => {
        if (Date.now() - lastHeartbeat > 5000) { runtime('ready'); lastHeartbeat = Date.now(); }
        const state: any = db.prepare('SELECT status FROM runs WHERE id=?').get(run.id);
        if (state.status === 'cancelling' && turnId && !cancelSent) {
          cancelSent = true;
          codex.rpc('turn/interrupt', { threadId: active.thread_id, turnId }).catch(() => { codex.close(); done?.('interrupted'); });
        }
      }, 250);
      let status: string;
      try { status = await completion; } finally { clearInterval(poll); clearTimeout(watchdog); }
      const final = status === 'completed' ? 'succeeded' : status === 'interrupted' && cancelSent && !fatal && !timedOut ? 'cancelled' : status === 'failed' ? 'failed' : 'interrupted';
      db.prepare('UPDATE runs SET status=? WHERE id=?').run(final, run.id); event(run.id, final, {});
    } catch (e: any) {
      db.prepare("UPDATE runs SET status='failed',error=? WHERE id=?").run(e.message, run.id);
      event(run.id, 'failed', { message: e.message });
    } finally { active = null; done = null; }
  }
      if (fatal && !stopping) throw fatal;
} catch (e: any) { runtime('unavailable'); console.error(e.message); process.exitCode = 1; }
finally {
  codex.close();
  if (stopping) runtime('stopped');
  closeSync(lock!); unlinkSync(lockPath);
}

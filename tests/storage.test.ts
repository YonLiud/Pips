import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('queue claims once, separates Pip histories and persists across connections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pips-test-'));
  process.env.PIPS_DATA_DIR = dir;
  const { db, createPip, enqueue, claim, event } = await import('../packages/storage/index.ts');
  try {
    const a: any = createPip('A'); const b: any = createPip('B');
    const profile: any = createPip('Scout', 'Investigate evidence', 'violet', 'hex');
    assert.equal(profile.instructions, 'Investigate evidence'); assert.equal(profile.color, 'violet'); assert.equal(profile.shape, 'hex'); assert.equal(profile.archived, 0);
    const first: any = enqueue(a.id, 'Task A'); const second: any = enqueue(b.id, 'Task B');
    const claimed: any = claim(); const other: any = claim();
    assert.equal(claimed.id, first.id); assert.equal(other.id, second.id); assert.equal(claim(), undefined);
    const retried: any = enqueue(a.id, 'Only once', 'request-1');
    assert.equal(enqueue(a.id, 'Only once', 'request-1').id, retried.id);
    assert.throws(() => enqueue(b.id, 'Different input', 'request-1'), /different input/);
    const rows = db.prepare('SELECT * FROM runs WHERE pip_id=?').all(a.id);
    assert.equal(rows.length, 2); assert.equal(rows[0].id, first.id);
    event(second.id, 'delta', { text: 'hello' });
    const { DatabaseSync } = await import('node:sqlite');
    db.prepare('UPDATE pips SET thread_id=? WHERE id=?').run('thread-recovery-proof', a.id);
    const reopened = new DatabaseSync(join(dir, 'pips.sqlite'));
    assert.equal(reopened.prepare('SELECT count(*) AS n FROM events WHERE run_id=?').get(second.id)?.n, 2);
    assert.equal(reopened.prepare('SELECT thread_id FROM pips WHERE id=?').get(a.id)?.thread_id, 'thread-recovery-proof');
    assert.equal(reopened.prepare('SELECT status FROM runs WHERE id=?').get(first.id)?.status, 'running');
    reopened.close();
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

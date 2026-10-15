import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('local API enforces origin checks and connects Pip/profile/queue/archive flows', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pips-api-'));
  process.env.PIPS_DATA_DIR = dir; process.env.PIPS_UNAUTHENTICATED = 'true'; process.env.NODE_ENV = 'test'; process.env.PIPS_HOST = '127.0.0.1';
  const { app } = await import('../../apps/api/index.ts'); const { db } = await import('../../packages/storage/index.ts');
  const headers = { 'x-pips-local': '1' };
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/app.js' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/pips', headers: { host: '[::1]:3000' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/pips', headers: { host: 'attacker.test' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/pips', payload: { name: 'Blocked' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/pips', headers: { ...headers, origin: 'https://attacker.test' }, payload: { name: 'Blocked' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/pips', headers, payload: { name: '   ' } })).statusCode, 400);
    const created = await app.inject({ method: 'POST', url: '/api/pips', headers, payload: { name: 'Scout', instructions: 'Research carefully', color: 'violet' } });
    assert.equal(created.statusCode, 201); const pip = created.json();
    db.prepare('INSERT INTO runtime_models(model,display_name,description,is_default,position) VALUES(?,?,?,?,?)').run('test-model', 'Test Model', 'For integration tests', 1, 0);
    const models = (await app.inject({ method: 'GET', url: '/api/models' })).json();
    assert.equal(models.catalog_ready, true); assert.equal(models.models[0].model, 'test-model');
    assert.equal((await app.inject({ method: 'POST', url: `/api/pips/${pip.id}/runs`, headers, payload: { prompt: 'No', model: 'unknown-model' } })).statusCode, 400);
    const request = { method: 'POST' as const, url: `/api/pips/${pip.id}/runs`, headers: { ...headers, 'idempotency-key': 'once' }, payload: { prompt: 'Hello' } };
    const a = await app.inject(request); const b = await app.inject(request);
    assert.equal(a.statusCode, 202); assert.equal(a.json().id, b.json().id);
    const selectedModel = await app.inject({ method: 'POST', url: `/api/pips/${pip.id}/runs`, headers, payload: { prompt: 'Use selected model', model: 'test-model' } });
    assert.equal(selectedModel.statusCode, 202); assert.equal(selectedModel.json().model, 'test-model');
    await app.inject({ method: 'POST', url: `/api/runs/${selectedModel.json().id}/cancel`, headers, payload: {} });
    db.prepare("UPDATE runs SET status='running' WHERE id=?").run(a.json().id);
    const cancelling = await app.inject({ method: 'POST', url: `/api/runs/${a.json().id}/cancel`, headers, payload: {} });
    assert.equal(cancelling.json().status, 'cancelling');
    assert.equal(db.prepare('SELECT kind FROM events WHERE run_id=? ORDER BY id DESC LIMIT 1').get(a.json().id)?.kind, 'cancelling');
    db.prepare("UPDATE runs SET status='queued' WHERE id=?").run(a.json().id);
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/pips/${pip.id}`, headers, payload: { archived: true } })).statusCode, 409);
    const cancelled = await app.inject({ method: 'POST', url: `/api/runs/${a.json().id}/cancel`, headers, payload: {} });
    assert.equal(cancelled.json().status, 'cancelled');
    assert.equal(db.prepare('SELECT kind FROM events WHERE run_id=? ORDER BY id DESC LIMIT 1').get(a.json().id)?.kind, 'cancelled');
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/pips/${pip.id}`, headers, payload: { archived: true } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/api/pips/${pip.id}/runs`, headers, payload: { prompt: 'No' } })).statusCode, 409);
    const runs = (await app.inject({ method: 'GET', url: `/api/pips/${pip.id}/runs` })).json();
    assert.equal(runs.length, 2); assert.ok(runs.every((run: any) => run.status === 'cancelled'));
  } finally { await app.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Pocket ID mode protects APIs and requires CSRF for mutations', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pips-oidc-'));
  process.env.PIPS_DATA_DIR = dir;
  process.env.PIPS_UNAUTHENTICATED = 'false';
  process.env.PIPS_ALLOWED_HOSTS = 'pips.test';
  process.env.PIPS_PUBLIC_URL = 'https://pips.test';
  process.env.PIPS_OIDC_ISSUER = 'https://id.test';
  process.env.PIPS_OIDC_CLIENT_ID = 'pips-client';
  process.env.PIPS_OIDC_CLIENT_SECRET = 'test-secret';
  process.env.PIPS_OWNER_SUBJECT = 'owner-subject';
  process.env.NODE_ENV = 'test';
  const { app } = await import('../../apps/api/index.ts');
  const { db } = await import('../../packages/storage/index.ts');
  const token = 'test-session-token'; const csrf = 'test-csrf-token'; const now = new Date();
  const digest = createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO auth_sessions(token_hash,issuer,subject,email,name,csrf_token,created,last_seen,expires) VALUES(?,?,?,?,?,?,?,?,?)').run(digest, 'https://id.test', 'owner-subject', 'owner@example.test', 'Owner', csrf, now.toISOString(), now.toISOString(), new Date(now.getTime() + 60000).toISOString());
  const host = { host: 'pips.test' }; const authenticated = { ...host, cookie: `__Host-pips-session=${token}` };
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/pips', headers: host })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/api/session', headers: authenticated })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/pips', headers: authenticated, payload: { name: 'Blocked' } })).statusCode, 403);
    const created = await app.inject({ method: 'POST', url: '/api/pips', headers: { ...authenticated, 'x-pips-csrf': csrf, origin: 'https://pips.test' }, payload: { name: 'Authorized' } });
    assert.equal(created.statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: '/auth/logout', headers: { ...authenticated, 'x-pips-csrf': csrf }, payload: {} })).statusCode, 204);
    assert.equal((await app.inject({ method: 'GET', url: '/api/session', headers: authenticated })).statusCode, 401);
  } finally { await app.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

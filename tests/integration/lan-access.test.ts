import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('LAN mode requires allowed hosts and retains exact origin checks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pips-lan-'));
  process.env.PIPS_DATA_DIR = dir;
  process.env.PIPS_UNAUTHENTICATED = 'true';
  process.env.PIPS_ALLOW_LAN = 'true';
  process.env.PIPS_ALLOWED_HOSTS = 'pipsbox.local,192.168.1.50';
  process.env.NODE_ENV = 'test';
  const { app } = await import('../../apps/api/index.ts');
  const { db } = await import('../../packages/storage/index.ts');
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/pips', headers: { host: 'pipsbox.local:3000', origin: 'http://pipsbox.local:3000' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/pips', headers: { host: '192.168.1.50:3000' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/pips', headers: { host: 'other.local:3000' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/pips', headers: { host: 'pipsbox.local:3000', origin: 'http://192.168.1.50:3000', 'x-pips-local': '1' }, payload: { name: 'Blocked' } })).statusCode, 403);
  } finally {
    await app.close(); db.close(); rmSync(dir, { recursive: true, force: true });
  }
});

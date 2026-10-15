import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { Codex } from '../packages/codex/index.ts';

function fixture(authType: string) {
  const process: any = new EventEmitter(); process.stdout = new PassThrough();
  const sent: any[] = [];
  process.stdin = new Writable({ write(bytes, _, cb) {
    const msg = JSON.parse(bytes.toString()); sent.push(msg);
    if (msg.method && msg.id !== undefined) queueMicrotask(() => process.stdout.write(JSON.stringify({ id: msg.id, result: msg.method === 'account/read' ? { account: { type: authType } } : {} }) + '\n'));
    cb();
  } });
  process.kill = () => process.emit('exit', 0);
  return { process, sent };
}
test('subscription handshake, API key stripping, notifications and rejection of server requests', async () => {
  const f = fixture('chatgpt'); let env: any;
  process.env.OPENAI_API_KEY = 'test-only';
  const client = new Codex(((_bin: any, _args: any, options: any) => { env = options.env; return f.process; }) as any);
  const notices: any[] = []; client.on('notice', msg => notices.push(msg));
  try {
    await client.start(); assert.equal(env.OPENAI_API_KEY, undefined);
    assert.equal(f.sent[0].method, 'initialize'); assert.equal(f.sent[1].method, 'initialized');
    f.process.stdout.write(JSON.stringify({ method: 'item/agentMessage/delta', params: { delta: 'hello' } }) + '\n');
    f.process.stdout.write(JSON.stringify({ id: 99, method: 'item/commandExecution/requestApproval', params: {} }) + '\n');
    assert.equal(notices[0].params.delta, 'hello');
    assert.equal(f.sent.at(-1).id, 99); assert.ok(f.sent.at(-1).error);
  } finally { delete process.env.OPENAI_API_KEY; client.close(); }
});
test('API-key account cannot execute as a subscription session', async () => {
  const f = fixture('apiKey'); const client = new Codex((() => f.process) as any);
  try { await assert.rejects(client.start(), /ChatGPT subscription login required/); } finally { client.close(); }
});

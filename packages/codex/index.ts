import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { EventEmitter } from 'node:events';

export class Codex extends EventEmitter {
  proc: any;
  pending = new Map<number, any>();
  sequence = 0;
  launch: any;
  constructor(launch = spawn) { super(); this.launch = launch; }
  async start() {
    const env = { ...process.env };
    env.RUST_LOG ||= 'warn';
    delete env.OPENAI_API_KEY;
    delete env.CODEX_API_KEY;
    // Windows developers can supply the absolute native Codex executable.
    this.proc = this.launch(process.env.PIPS_CODEX_BIN || 'codex', ['-c', 'forced_login_method="chatgpt"', '-c', 'cli_auth_credentials_store="file"', 'app-server'], { env, stdio: ['pipe', 'pipe', 'inherit'] });
    this.proc.on('error', (e: Error) => this.fail(e));
    this.proc.on('exit', () => this.fail(new Error('Codex runtime exited')));
    this.proc.stdin.on('error', (e: Error) => this.fail(e));
    readline.createInterface({ input: this.proc.stdout }).on('line', (line: string) => {
      let msg: any;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.method && msg.id !== undefined) {
        // No unattended permission grants in this PoC. Fail unknown server requests promptly.
        this.send({ id: msg.id, error: { code: -32601, message: 'Interactive tool requests are not enabled in this PoC' } });
        this.emit('notice', { method: 'pips/requestRejected', params: { method: msg.method } });
      } else if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer); this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message || 'Codex request failed')) : p.resolve(msg.result);
      } else if (msg.method) this.emit('notice', msg);
    });
    await this.rpc('initialize', { clientInfo: { name: 'pips', title: 'Pips local', version: '0.1.0' } });
    this.send({ method: 'initialized' });
    const auth: any = await this.rpc('account/read', { refreshToken: false });
    if (auth.account?.type !== 'chatgpt') throw new Error('ChatGPT subscription login required; API keys are not supported');
  }
  send(msg: unknown) { this.proc.stdin.write(JSON.stringify(msg) + '\n'); }
  rpc(method: string, params: unknown): Promise<any> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex request timed out: ${method}`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  fail(err: Error) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear(); this.emit('offline', err);
  }
  close() { this.proc?.kill(); }
}

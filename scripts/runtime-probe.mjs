import { spawn } from 'node:child_process';
import readline from 'node:readline';

// Probe protocol connectivity only. Real turns and recovery are the next milestone.
const proc = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'inherit'] });
const timer = setTimeout(() => finish('Runtime handshake timed out', 1), 15000);
let ended = false;
function finish(message, code) {
  if (ended) return;
  ended = true;
  clearTimeout(timer);
  console.log(message);
  proc.stdin.end();
  proc.kill();
  process.exitCode = code;
}
proc.on('error', err => finish(`Cannot start Codex: ${err.message}`, 1));
proc.on('exit', code => { if (!ended) finish(`Codex exited before handshake (${code})`, 1); });
readline.createInterface({ input: proc.stdout }).on('line', line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id !== 1) return;
  if (msg.error) return finish('Runtime rejected initialization; inspect the pinned protocol version.', 1);
  proc.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  finish('App-server handshake succeeded. Subscription inference is not yet verified.', 0);
});
proc.stdin.on('error', () => finish('Runtime input closed', 1));
proc.stdin.write(JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'pips_probe', title: 'Pips runtime probe', version: '0.1.0' } } }) + '\n');

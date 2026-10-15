import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const root = resolve(process.env.PIPS_DATA_DIR || './data');
mkdirSync(root, { recursive: true });
export const db = new DatabaseSync(resolve(root, 'pips.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS pips(id TEXT PRIMARY KEY,name TEXT NOT NULL,thread_id TEXT,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,pip_id TEXT NOT NULL,prompt TEXT NOT NULL,status TEXT NOT NULL,output TEXT NOT NULL DEFAULT '',error TEXT,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runtime(id INTEGER PRIMARY KEY CHECK(id=1),status TEXT NOT NULL,updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runtime_models(model TEXT PRIMARY KEY,display_name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',is_default INTEGER NOT NULL DEFAULT 0,position INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auth_flows(state_hash TEXT PRIMARY KEY,code_verifier TEXT NOT NULL,nonce TEXT NOT NULL,return_to TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,issuer TEXT NOT NULL,subject TEXT NOT NULL,email TEXT,name TEXT,csrf_token TEXT NOT NULL,created TEXT NOT NULL,last_seen TEXT NOT NULL,expires TEXT NOT NULL);
`);
const columns = new Set(db.prepare('PRAGMA table_info(pips)').all().map((c: any) => c.name));
for (const [name, definition] of [['instructions', "TEXT NOT NULL DEFAULT ''"], ['color', "TEXT NOT NULL DEFAULT 'violet'"], ['shape', "TEXT NOT NULL DEFAULT 'round'"], ['archived', 'INTEGER NOT NULL DEFAULT 0']]) {
  if (!columns.has(name)) db.exec(`ALTER TABLE pips ADD COLUMN ${name} ${definition}`);
}
if (!db.prepare('PRAGMA table_info(runs)').all().some((c: any) => c.name === 'request_id')) db.exec('ALTER TABLE runs ADD COLUMN request_id TEXT');
if (!db.prepare('PRAGMA table_info(runs)').all().some((c: any) => c.name === 'model')) db.exec('ALTER TABLE runs ADD COLUMN model TEXT');
if (!db.prepare('PRAGMA table_info(runs)').all().some((c: any) => c.name === 'commentary')) db.exec("ALTER TABLE runs ADD COLUMN commentary TEXT NOT NULL DEFAULT ''");
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS runs_request_id ON runs(request_id) WHERE request_id IS NOT NULL; CREATE INDEX IF NOT EXISTS runs_pip_created ON runs(pip_id,created); CREATE INDEX IF NOT EXISTS events_run_id ON events(run_id,id);');
export function event(runId: string, kind: string, payload: unknown) {
  db.prepare('INSERT INTO events(run_id,kind,payload) VALUES(?,?,?)').run(runId, kind, JSON.stringify(payload));
}
export function runtime(status: string) {
  db.prepare('INSERT INTO runtime VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated=excluded.updated').run(status, new Date().toISOString());
}
export function createPip(name: string, instructions = '', color = 'violet', shape = 'round') {
  const id = randomUUID();
  db.prepare('INSERT INTO pips(id,name,thread_id,created,instructions,color,shape) VALUES(?,?,NULL,?,?,?,?)').run(id, name, new Date().toISOString(), instructions, color, shape);
  return db.prepare('SELECT * FROM pips WHERE id=?').get(id);
}
export function enqueue(pipId: string, prompt: string, requestId: string | null = null, model: string | null = null) {
  if (requestId) {
    const existing: any = db.prepare('SELECT * FROM runs WHERE request_id=?').get(requestId);
    if (existing) {
      if (existing.pip_id !== pipId || existing.prompt !== prompt || existing.model !== model) throw new Error('Request ID already used for different input');
      return existing;
    }
  }
  const id = randomUUID();
  db.prepare('INSERT INTO runs(id,pip_id,prompt,status,created,request_id,model) VALUES(?,?,?,?,?,?,?)').run(id, pipId, prompt, 'queued', new Date().toISOString(), requestId, model);
  event(id, 'queued', {});
  return db.prepare('SELECT * FROM runs WHERE id=?').get(id);
}
export function claim() {
  return db.prepare("UPDATE runs SET status='running' WHERE id=(SELECT id FROM runs WHERE status='queued' ORDER BY created,rowid LIMIT 1) RETURNING *").get();
}

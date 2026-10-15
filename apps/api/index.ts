import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import * as oidc from 'openid-client';
import { db, createPip, enqueue, event } from '../../packages/storage/index.ts';

const unauthenticated = process.env.PIPS_UNAUTHENTICATED === 'true';
const host = process.env.PIPS_HOST || '127.0.0.1';
const allowLan = process.env.PIPS_ALLOW_LAN === 'true';
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
const configuredHosts = (process.env.PIPS_ALLOWED_HOSTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
if (unauthenticated && !allowLan && !['127.0.0.1', '::1'].includes(host) && process.env.PIPS_CONTAINER_LOCAL !== 'true') throw new Error('Unauthenticated mode must bind to loopback unless PIPS_ALLOW_LAN=true');
if (unauthenticated && allowLan && configuredHosts.length === 0) throw new Error('PIPS_ALLOWED_HOSTS must list the LAN hostnames or IP addresses when PIPS_ALLOW_LAN=true');
const oidcRequired = ['PIPS_PUBLIC_URL', 'PIPS_OIDC_ISSUER', 'PIPS_OIDC_CLIENT_ID', 'PIPS_OIDC_CLIENT_SECRET', 'PIPS_OWNER_SUBJECT'];
if (!unauthenticated) {
  const missing = oidcRequired.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Pocket ID configuration missing: ${missing.join(', ')}`);
  if (configuredHosts.length === 0) throw new Error('PIPS_ALLOWED_HOSTS must list the public Pips hostname');
}
const allowedHosts = new Set(unauthenticated && !allowLan ? loopbackHosts : [...loopbackHosts, ...configuredHosts]);
const publicUrl = unauthenticated ? null : new URL(process.env.PIPS_PUBLIC_URL!);
const issuer = unauthenticated ? null : new URL(process.env.PIPS_OIDC_ISSUER!);
if (!unauthenticated && (publicUrl!.protocol !== 'https:' || issuer!.protocol !== 'https:')) throw new Error('Pocket ID and the public Pips URL must use HTTPS');
const sessionCookie = '__Host-pips-session';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
let oidcConfiguration: Promise<oidc.Configuration> | null = null;
function configuration() {
  oidcConfiguration ||= oidc.discovery(issuer!, process.env.PIPS_OIDC_CLIENT_ID!, undefined, oidc.ClientSecretPost(process.env.PIPS_OIDC_CLIENT_SECRET!));
  return oidcConfiguration;
}
function requestHostname(authority: string) {
  try { return new URL(`http://${authority}`).hostname.replace(/^\[|\]$/g, '').toLowerCase(); }
  catch { return null; }
}
export const app = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 65536 });
await app.register(cookie);
app.addHook('onRequest', async (req, reply) => {
  const authority = req.headers.host || '';
  const hostname = requestHostname(authority);
  if (!hostname || !allowedHosts.has(hostname)) return reply.code(403).send({ error: unauthenticated && !allowLan ? 'Local access only' : 'Host not allowed' });
  if (req.headers.origin) {
    let origin: URL;
    try { origin = new URL(req.headers.origin); } catch { return reply.code(403).send({ error: 'Invalid origin' }); }
    if (origin.host.toLowerCase() !== authority.toLowerCase()) return reply.code(403).send({ error: 'Cross-origin access denied' });
  }
  reply.header('Cache-Control', 'no-store');
  reply.header('X-Content-Type-Options', 'nosniff');
  const publicPath = req.url === '/' || req.url === '/landing.css' || req.url === '/landing.js' || req.url === '/healthz' || req.url.startsWith('/auth/login') || req.url.startsWith('/auth/oidc/callback');
  if (unauthenticated) {
    if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-pips-local'] !== '1') return reply.code(403).send({ error: 'Missing local request header' });
    (req as any).pipsSession = { subject: 'local-owner', csrf_token: null };
    return;
  }
  if (publicPath) return;
  const token = req.cookies[sessionCookie];
  const session: any = token ? db.prepare('SELECT * FROM auth_sessions WHERE token_hash=? AND last_seen>? AND expires>?').get(hash(token), new Date(Date.now() - 30 * 60 * 1000).toISOString(), new Date().toISOString()) : null;
  if (!session) {
    if (req.url.startsWith('/api/')) return reply.code(401).send({ error: 'Authentication required' });
    return reply.redirect('/auth/login');
  }
  (req as any).pipsSession = session;
  db.prepare('UPDATE auth_sessions SET last_seen=? WHERE token_hash=?').run(new Date().toISOString(), session.token_hash);
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-pips-csrf'] !== session.csrf_token) return reply.code(403).send({ error: 'Invalid CSRF token' });
});
app.get('/auth/login', async (req: any, reply) => {
  if (unauthenticated) return reply.redirect('/');
  const state = randomToken(); const verifier = oidc.randomPKCECodeVerifier(); const nonce = randomToken();
  const challenge = await oidc.calculatePKCECodeChallenge(verifier);
  const returnTo = typeof req.query?.return_to === 'string' && req.query.return_to.startsWith('/') && !req.query.return_to.startsWith('//') ? req.query.return_to : '/app';
  db.prepare('DELETE FROM auth_flows WHERE created<?').run(new Date(Date.now() - 10 * 60 * 1000).toISOString());
  db.prepare('INSERT INTO auth_flows(state_hash,code_verifier,nonce,return_to,created) VALUES(?,?,?,?,?)').run(hash(state), verifier, nonce, returnTo, new Date().toISOString());
  const url = oidc.buildAuthorizationUrl(await configuration(), { redirect_uri: new URL('/auth/oidc/callback', publicUrl!).href, scope: 'openid profile email', response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state, nonce });
  return reply.redirect(url.href);
});
app.get('/auth/oidc/callback', async (req: any, reply) => {
  if (unauthenticated) return reply.redirect('/');
  const state = typeof req.query?.state === 'string' ? req.query.state : '';
  const flow: any = state ? db.prepare('DELETE FROM auth_flows WHERE state_hash=? AND created>=? RETURNING *').get(hash(state), new Date(Date.now() - 10 * 60 * 1000).toISOString()) : null;
  if (!flow) return reply.code(400).send({ error: 'Invalid or expired login state' });
  try {
    const callback = new URL(req.raw.url || '', publicUrl!);
    const tokens = await oidc.authorizationCodeGrant(await configuration(), callback, { pkceCodeVerifier: flow.code_verifier, expectedState: state, expectedNonce: flow.nonce });
    const claims: any = tokens.claims();
    if (!claims?.sub || claims.sub !== process.env.PIPS_OWNER_SUBJECT) return reply.code(403).send({ error: 'This Pocket ID account is not authorized for Pips' });
    const token = randomToken(); const csrf = randomToken(); const now = new Date(); const expires = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    db.prepare('INSERT INTO auth_sessions(token_hash,issuer,subject,email,name,csrf_token,created,last_seen,expires) VALUES(?,?,?,?,?,?,?,?,?)').run(hash(token), claims.iss, claims.sub, claims.email || null, claims.name || claims.preferred_username || null, csrf, now.toISOString(), now.toISOString(), expires.toISOString());
    reply.setCookie(sessionCookie, token, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', expires });
    return reply.redirect(flow.return_to);
  } catch (error: any) { return reply.code(400).send({ error: 'Pocket ID callback failed', detail: process.env.NODE_ENV === 'development' ? error.message : undefined }); }
});
app.get('/api/session', async (req: any) => ({ authenticated: true, authentication: unauthenticated ? 'disabled' : 'pocket-id', subject: req.pipsSession.subject, email: req.pipsSession.email || null, name: req.pipsSession.name || null, csrf_token: req.pipsSession.csrf_token }));
app.post('/auth/logout', async (req: any, reply) => {
  if (!unauthenticated) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(req.pipsSession.token_hash);
    reply.clearCookie(sessionCookie, { path: '/', secure: true, httpOnly: true, sameSite: 'lax' });
  }
  return reply.code(204).send();
});
for (const [path, file, type] of [['/', 'landing.html', 'text/html'], ['/landing.css', 'landing.css', 'text/css'], ['/landing.js', 'landing.js', 'text/javascript'], ['/app', 'index.html', 'text/html'], ['/app.js', 'app.js', 'text/javascript'], ['/style.css', 'style.css', 'text/css']]) {
  app.get(path, async (_, reply) => reply.type(type).send(readFileSync(new URL('../web/' + file, import.meta.url), 'utf8')));
}
app.get('/healthz', async () => ({ status: 'ok', authentication: unauthenticated ? (allowLan ? 'disabled-lan-allowlist' : 'disabled-local-only') : 'pocket-id' }));
app.get('/api/runtime', async () => {
  const state: any = db.prepare('SELECT status,updated FROM runtime WHERE id=1').get() || { status: 'not_started' };
  if (state.status === 'ready' && Date.now() - Date.parse(state.updated) > 20000) state.status = 'offline';
  return { ...state, authentication: unauthenticated ? (allowLan ? 'disabled-lan-allowlist' : 'disabled-local-only') : 'pocket-id', backend: 'codex', execution: 'read-only', concurrency: 1 };
});
app.get('/api/models', async () => {
  const models = db.prepare('SELECT model,display_name,description,is_default FROM runtime_models ORDER BY position').all();
  return { models, catalog_ready: models.length > 0 };
});
app.get('/api/pips', async () => db.prepare(`SELECT pips.*,
  (SELECT status FROM runs WHERE pip_id=pips.id ORDER BY created DESC,rowid DESC LIMIT 1) AS last_status,
  (SELECT count(*) FROM runs WHERE pip_id=pips.id) AS run_count FROM pips ORDER BY created DESC`).all());
const profileProperties = { name: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' }, instructions: { type: 'string', maxLength: 8000 }, color: { type: 'string', enum: ['mint', 'violet', 'peach', 'blue'] } };
app.post('/api/pips', { schema: { body: { type: 'object', required: ['name'], additionalProperties: false, properties: profileProperties } } }, async (req: any, reply) => reply.code(201).send(createPip(req.body.name.trim(), req.body.instructions || '', req.body.color || 'mint')));
app.patch('/api/pips/:id', { schema: { body: { type: 'object', additionalProperties: false, properties: { ...profileProperties, archived: { type: 'boolean' } } } } }, async (req: any, reply) => {
  const pip: any = db.prepare('SELECT * FROM pips WHERE id=?').get(req.params.id);
  if (!pip) return reply.code(404).send({ error: 'Pip not found' });
  if (db.prepare("SELECT id FROM runs WHERE pip_id=? AND status IN ('queued','running','cancelling') LIMIT 1").get(pip.id)) return reply.code(409).send({ error: 'Finish or cancel queued work before changing this Pip' });
  db.prepare('UPDATE pips SET name=?,instructions=?,color=?,archived=? WHERE id=?').run(req.body.name?.trim() || pip.name, req.body.instructions ?? pip.instructions, req.body.color ?? pip.color, req.body.archived === undefined ? pip.archived : Number(req.body.archived), pip.id);
  return db.prepare('SELECT * FROM pips WHERE id=?').get(pip.id);
});
app.get('/api/pips/:id/runs', async (req: any) => db.prepare('SELECT * FROM runs WHERE pip_id=? ORDER BY created').all(req.params.id));
app.post('/api/pips/:id/runs', { schema: { body: {
  type: 'object', required: ['prompt'], additionalProperties: false,
  properties: { prompt: { type: 'string', minLength: 1, maxLength: 32000 }, model: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] } },
} } }, async (req: any, reply) => {
  const pip: any = db.prepare('SELECT * FROM pips WHERE id=?').get(req.params.id);
  if (!pip) return reply.code(404).send({ error: 'Pip not found' });
  if (pip.archived) return reply.code(409).send({ error: 'Restore this Pip before sending a message' });
  const key = req.headers['idempotency-key'];
  if (key && (typeof key !== 'string' || key.length > 100)) return reply.code(400).send({ error: 'Invalid request key' });
  const model = req.body.model || null;
  if (model && !db.prepare('SELECT 1 FROM runtime_models WHERE model=?').get(model)) return reply.code(400).send({ error: 'Selected model is not in the worker catalog' });
  try { return reply.code(202).send(enqueue(req.params.id, req.body.prompt, key || null, model)); }
  catch (e: any) { return reply.code(409).send({ error: e.message }); }
});
app.get('/api/runs/:id/events', async (req: any) => db.prepare('SELECT id,kind,payload FROM events WHERE run_id=? AND id>? ORDER BY id LIMIT 500').all(req.params.id, Math.max(0, Number(req.query.after) || 0)));
app.post('/api/runs/:id/cancel', async (req: any, reply) => {
  const run: any = db.prepare('SELECT * FROM runs WHERE id=?').get(req.params.id);
  if (!run) return reply.code(404).send({ error: 'Run not found' });
  db.prepare("UPDATE runs SET status=CASE WHEN status='queued' THEN 'cancelled' WHEN status='running' THEN 'cancelling' ELSE status END WHERE id=?").run(run.id);
  const updated: any = db.prepare('SELECT * FROM runs WHERE id=?').get(run.id);
  if (updated.status !== run.status) event(run.id, updated.status, {});
  return updated;
});
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await app.listen({ host, port: Number(process.env.PIPS_PORT || 3000) });

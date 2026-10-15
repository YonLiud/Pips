const $ = id => document.getElementById(id);
const state = { pips: [], selected: localStorage.getItem('pips:selected') || '', archived: false, runs: [], models: [], csrf: null, editing: null, loading: false, sending: false, chatSignature: '', navSignature: '', detailsSignature: '' };
const activeStatuses = new Set(['queued', 'running', 'cancelling']);
const templates = {
  Builder: { name: 'Chip', color: 'mint', instructions: 'Help me design and build software. Explain tradeoffs clearly, inspect evidence, and keep changes focused. Ask when a consequential requirement is unclear.' },
  Researcher: { name: 'Scout', color: 'violet', instructions: 'Help me investigate ideas. Separate evidence from assumptions, identify gaps, and give concise, well-supported answers. Never invent sources.' },
  Planner: { name: 'Sprout', color: 'peach', instructions: 'Help me turn projects into clear, achievable next steps. Track constraints, surface dependencies, and favor useful progress over unnecessary complexity.' },
};
function element(tag, className = '', text = '') { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
function button(text, fn) { const node = element('button', '', text); node.type = 'button'; node.addEventListener('click', fn); return node; }
function requestKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function hashString(value) { let hash = 2166136261; for (const char of value) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function avatar(pip, status = pip.last_status) {
  const seed = hashString(pip.id || pip.name); const node = element('div', `avatar creature creature-${seed % 6}${activeStatuses.has(status) ? ' is-working' : ''}`);
  node.style.setProperty('--pip-color', `var(--${['mint', 'violet', 'peach', 'blue'].includes(pip.color) ? pip.color : 'mint'})`);
  node.style.setProperty('--tilt', `${(seed % 9) - 4}deg`); node.setAttribute('aria-hidden', 'true');
  const face = element('span', 'creature-face'); face.append(element('i', 'eye eye-left'), element('i', 'eye eye-right'), element('i', 'mouth'));
  node.append(element('i', 'creature-ear ear-left'), element('i', 'creature-ear ear-right'), face, element('i', 'work-ring')); return node;
}
function showError(error) { $('error').hidden = false; $('error').querySelector('span').textContent = error.message || 'Something went wrong'; }
function applyTheme(theme) {
  const choice = ['light', 'dark', 'system'].includes(theme) ? theme : 'system';
  if (choice === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = choice;
  localStorage.setItem('pips:theme', choice);
  document.querySelectorAll('[data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === choice)));
}
async function api(path, { method = 'GET', body, key } = {}) {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-Pips-Local': '1', ...(state.csrf ? { 'X-Pips-CSRF': state.csrf } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  let result; try { result = await response.json(); } catch { throw Error('The server returned an unreadable response'); }
  if (!response.ok) throw Error(result.error || result.message || `Request failed (${response.status})`);
  return result;
}
function selectedPip() { return state.pips.find(p => p.id === state.selected); }
function selectPip(id) {
  if (state.selected) localStorage.setItem('pips:draft:' + state.selected, $('prompt').value);
  state.selected = id; state.runs = []; state.chatSignature = ''; state.detailsSignature = ''; state.navSignature = '';
  localStorage.setItem('pips:selected', id); $('prompt').value = localStorage.getItem('pips:draft:' + id) || '';
  $('sidebar').classList.remove('open'); render(); refresh();
}
function openEditor(pip = null, template = null) {
  state.editing = pip?.id || null;
  const profile = pip || template || { name: '', instructions: '', color: 'mint' };
  $('pip-name').value = profile.name; $('pip-instructions').value = profile.instructions; $('pip-color').value = profile.color;
  $('dialog-label').textContent = pip ? 'Your Pip' : 'New Pip';
  $('dialog-title').textContent = pip ? 'Tune this conversation' : 'Give your Pip a purpose';
  $('save-pip').textContent = pip ? 'Save changes' : 'Create Pip'; $('form-error').textContent = '';
  $('pip-dialog').showModal();
}
function renderNav() {
  const visible = state.pips.filter(p => Boolean(p.archived) === state.archived && p.name.toLowerCase().includes($('search').value.toLowerCase()));
  const signature = JSON.stringify([visible, state.selected, state.archived]); if (signature === state.navSignature) return; state.navSignature = signature;
  $('list-label').textContent = state.archived ? 'Archived' : 'Conversations'; $('show-archived').textContent = state.archived ? 'Active' : 'Archived';
  const nodes = visible.map(pip => {
    const node = button('', () => selectPip(pip.id)); node.className = 'pip-nav' + (pip.id === state.selected ? ' selected' : ''); node.setAttribute('aria-current', pip.id === state.selected ? 'page' : 'false');
    const text = element('div', 'nav-text'); text.append(element('b', '', pip.name), element('small', '', pip.last_status ? pip.last_status.replaceAll('_', ' ') : 'Ready for an idea'));
    node.append(avatar(pip), text); return node;
  });
  $('pip-list').replaceChildren(...(nodes.length ? nodes : [element('p', 'pip-list-empty', state.archived ? 'No archived Pips here.' : $('search').value ? 'No matching Pips.' : 'Your team starts here. Create your first Pip above.')]));
}
function renderDetails(pip) {
  const signature = JSON.stringify(pip || null); if (signature === state.detailsSignature) return; state.detailsSignature = signature;
  if (!pip) { const empty = element('div', 'empty-details'); empty.append(element('span', '', '✦'), element('h3', '', 'Small team, big ideas.'), element('p', '', 'Each Pip has its own purpose, conversation, and workspace.')); $('pip-details').replaceChildren(empty); return; }
  const profile = element('div', 'profile'); profile.append(avatar(pip), element('h2', '', pip.name), element('p', '', pip.instructions || 'An open mind and a fresh conversation. Add instructions to give this Pip a focus.'));
  const actions = element('div', 'profile-actions');
  actions.append(button('Edit Pip', () => openEditor(pip)), button(pip.archived ? 'Restore' : 'Archive', async () => {
    try { await api('/api/pips/' + pip.id, { method: 'PATCH', body: { archived: !pip.archived } }); await refresh(); } catch (e) { showError(e); }
  }));
  profile.append(actions, element('div', 'session-label', `${pip.run_count || 0} messages · ${pip.archived ? 'Archived' : 'Personal Pip'}`), element('div', 'session-label', pip.thread_id ? 'Session: ' + pip.thread_id : 'A Codex thread will be created on the first run.'));
  $('pip-details').replaceChildren(profile);
}
function renderModels() {
  const selected = $('model').value || localStorage.getItem('pips:model') || '';
  const options = [new Option('Default model', '')];
  state.models.forEach(item => options.push(new Option(item.display_name + (item.is_default ? ' · default' : ''), item.model)));
  $('model').replaceChildren(...options);
  $('model').value = state.models.some(item => item.model === selected) ? selected : '';
}
function formattedOutput(text) {
  const node = element('div', 'run-output');
  // Render only fenced code specially; all model content remains text, never executable HTML.
  const chunks = text.split('```');
  chunks.forEach((chunk, i) => {
    if (i % 2) { const newline = chunk.indexOf('\n'); node.append(element('pre', '', newline >= 0 ? chunk.slice(newline + 1) : chunk)); }
    else node.append(document.createTextNode(chunk));
  }); return node;
}
function renderChat(pip) {
  const signature = JSON.stringify([pip?.id, pip?.name, pip?.color, state.runs]); if (signature === state.chatSignature) return; state.chatSignature = signature;
  const chat = $('chat'); const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 100;
  if (!pip) return;
  const nodes = state.runs.map(run => {
    const node = element('article', 'message'); node.append(element('div', 'user-message', run.prompt));
    const heading = element('div', 'assistant-heading'); heading.append(avatar(pip, run.status), element('b', '', pip.name), element('span', 'run-badge', [run.model, run.status.replaceAll('_', ' ')].filter(Boolean).join(' · '))); node.append(heading);
    if (run.output) node.append(formattedOutput(run.output));
    else { const pending = element('div', 'run-output'); pending.append(element('span', 'pending', run.status === 'queued' ? 'In the queue. Your Pip will pick this up when the worker is ready.' : run.status === 'running' ? 'Thinking it through…' : run.status === 'cancelling' ? 'Waiting for the runtime to stop…' : 'No response was recorded.')); node.append(pending); }
    if (run.error) node.append(element('div', 'run-error', run.error));
    const actions = element('div', 'run-actions');
    if (activeStatuses.has(run.status)) actions.append(button(run.status === 'queued' ? 'Cancel queued run' : 'Stop run', async () => { try { await api('/api/runs/' + run.id + '/cancel', { method: 'POST', body: {} }); await refresh(); } catch (e) { showError(e); } }));
    if (run.output) actions.append(button('Copy response', async () => { try { await navigator.clipboard.writeText(run.output); } catch { showError(Error('Clipboard unavailable in this browser')); } }));
    if (['failed', 'interrupted', 'cancelled'].includes(run.status)) actions.append(button('Use prompt again', () => { $('prompt').value = run.prompt; $('prompt').focus(); }));
    actions.append(button('Activity', () => showActivity(run))); node.append(actions); return node;
  });
  if (!nodes.length) { const intro = element('div', 'chat-intro'); intro.append(avatar(pip), element('h2', '', `A fresh start with ${pip.name}.`), element('p', '', 'Share a question, a rough idea, or the task you want to work through. This conversation stays here when you leave.')); nodes.push(intro); }
  chat.replaceChildren(...nodes); if (nearBottom) chat.scrollTop = chat.scrollHeight;
}
async function showActivity(run) {
  try {
    const events = await api('/api/runs/' + run.id + '/events');
    const dialog = document.createElement('dialog'); const close = button('Close', () => dialog.close()); close.className = 'text-button';
    dialog.append(element('h2', '', 'Run activity'), element('p', 'muted', run.id), element('pre', '', events.filter(e => e.kind !== 'delta').map(e => `${e.kind}\n${e.payload}`).join('\n\n') || 'No lifecycle events yet. Output updates are shown in the conversation.'), close);
    dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal();
  } catch (e) { showError(e); }
}
function render() {
  const pip = selectedPip(); $('welcome').hidden = Boolean(pip); $('chat').hidden = !pip; $('composer-wrap').hidden = !pip || Boolean(pip.archived);
  $('current-name').textContent = pip?.name || 'Pips'; $('conversation-subtitle').textContent = pip ? 'Your private conversation' : 'Your private AI team'; document.title = pip ? `${pip.name} · Pips` : 'Pips — Your private AI team';
  renderNav(); renderDetails(pip); renderChat(pip);
}
async function refresh() {
  if (state.loading) return; state.loading = true;
  try {
    const [pips, runtime, catalog, session] = await Promise.all([api('/api/pips'), api('/api/runtime'), api('/api/models'), api('/api/session')]); state.pips = pips; state.models = catalog.models || []; state.csrf = session.csrf_token || null; renderModels();
    $('worker-status').textContent = runtime.status.replaceAll('_', ' ');
    $('runtime-help').textContent = runtime.status === 'ready' ? 'Ready for work. All Pips share your subscription allowance.' : runtime.status === 'unavailable' ? 'Start the worker and check its logs. Codex may need subscription login.' : 'Start the worker to process queued messages. Your conversations stay saved.';
    const requested = state.selected;
    if (requested) { const runs = await api('/api/pips/' + requested + '/runs'); if (requested === state.selected) state.runs = runs; }
    render();
  } catch (e) { showError(e); }
  finally { state.loading = false; }
}
$('new-pip').onclick = () => openEditor();
document.querySelectorAll('[data-template]').forEach(node => { node.onclick = () => openEditor(null, templates[node.dataset.template]); });
$('close-dialog').onclick = () => $('pip-dialog').close();
$('settings').onclick = () => $('workspace-dialog').showModal(); $('close-workspace').onclick = () => $('workspace-dialog').close();
$('error').querySelector('button').onclick = () => { $('error').hidden = true; };
$('search').oninput = renderNav;
$('show-archived').onclick = () => { state.archived = !state.archived; renderNav(); };
$('menu').onclick = () => $('sidebar').classList.toggle('open');
$('sidebar-scrim').onclick = () => $('sidebar').classList.remove('open');
$('details-toggle').onclick = () => { $('details').classList.toggle('open'); $('details').classList.toggle('collapsed'); };
$('close-details').onclick = () => $('details').classList.remove('open');
$('model').onchange = () => localStorage.setItem('pips:model', $('model').value);
document.querySelectorAll('[data-theme]').forEach(button => { button.onclick = () => applyTheme(button.dataset.theme); });
$('pip-form').onsubmit = async event => {
  event.preventDefault(); $('save-pip').disabled = true;
  try {
    const body = { name: $('pip-name').value.trim(), instructions: $('pip-instructions').value.trim(), color: $('pip-color').value };
    if (!body.name) throw Error('Give your Pip a name');
    const pip = await api(state.editing ? '/api/pips/' + state.editing : '/api/pips', { method: state.editing ? 'PATCH' : 'POST', body });
    $('pip-dialog').close(); state.archived = Boolean(pip.archived); state.pips = state.pips.filter(p => p.id !== pip.id).concat(pip); selectPip(pip.id);
  } catch (e) { $('form-error').textContent = e.message; } finally { $('save-pip').disabled = false; }
};
$('composer').onsubmit = async event => {
  event.preventDefault(); const prompt = $('prompt').value.trim(); const pipId = state.selected;
  if (!prompt || !pipId || state.sending) return;
  state.sending = true; $('send').disabled = true;
  // Reuse the key if the same request has an uncertain network result.
  let stored = null; try { stored = JSON.parse(sessionStorage.getItem('pips:pending') || 'null'); } catch { sessionStorage.removeItem('pips:pending'); }
  const model = $('model').value || null;
  const pending = stored?.pipId === pipId && stored?.prompt === prompt && stored?.model === model ? stored : { pipId, prompt, model, key: requestKey() };
  sessionStorage.setItem('pips:pending', JSON.stringify(pending));
  try {
    await api('/api/pips/' + pipId + '/runs', { method: 'POST', body: { prompt, model }, key: pending.key });
    sessionStorage.removeItem('pips:pending'); localStorage.removeItem('pips:draft:' + pipId);
    if (pipId === state.selected) { $('prompt').value = ''; $('prompt').style.height = ''; }
    await refresh();
  } catch (e) { showError(e); } finally { state.sending = false; $('send').disabled = false; }
};
$('prompt').oninput = () => { localStorage.setItem('pips:draft:' + state.selected, $('prompt').value); $('prompt').style.height = 'auto'; $('prompt').style.height = Math.min($('prompt').scrollHeight, 200) + 'px'; };
$('prompt').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('composer').requestSubmit(); } };
document.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); openEditor(); } });
$('prompt').value = localStorage.getItem('pips:draft:' + state.selected) || '';
applyTheme(localStorage.getItem('pips:theme') || 'system');
setInterval(() => { if (!document.hidden) refresh(); }, 1000); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); }); refresh();

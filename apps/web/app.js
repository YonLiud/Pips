const $ = id => document.getElementById(id);
const state = { pips: [], selected: '', archived: false, runs: [], models: [], csrf: null, user: null, editing: null, loading: false, sending: false, chatSignature: '', navSignature: '', detailsSignature: '', homeSignature: '' };
const activeStatuses = new Set(['queued', 'running', 'cancelling']);
const pipColors = ['peach', 'rose', 'orange', 'mint', 'teal', 'blue', 'violet', 'slate'];
const pipShapes = ['round', 'pebble', 'square', 'capsule', 'triangle', 'hex'];
let modelMenuTimer = 0;
const linkPreviewCache = new Map();
const templates = {
  Builder: { name: 'Chip', color: 'mint', instructions: 'Help me design and build software. Explain tradeoffs clearly, inspect evidence, and keep changes focused. Ask when a consequential requirement is unclear.' },
  Researcher: { name: 'Scout', color: 'violet', instructions: 'Help me investigate ideas. Separate evidence from assumptions, identify gaps, and give concise, well-supported answers. Never invent sources.' },
  Planner: { name: 'Sprout', color: 'peach', instructions: 'Help me turn projects into clear, achievable next steps. Track constraints, surface dependencies, and favor useful progress over unnecessary complexity.' },
};
function element(tag, className = '', text = '') { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
function button(text, fn) { const node = element('button', '', text); node.type = 'button'; node.addEventListener('click', fn); return node; }
function svgIcon(path, className = '') { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); if (className) svg.setAttribute('class', className); const shape = document.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d', path); svg.append(shape); return svg; }
function requestKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function hashString(value) { let hash = 2166136261; for (const char of value) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function avatar(pip, status = pip.last_status) {
  const seed = hashString(pip.id || pip.name); const shape = pipShapes.includes(pip.shape) ? pip.shape : pipShapes[seed % pipShapes.length]; const node = element('div', `avatar creature creature-${pipShapes.indexOf(shape)} shape-${shape}${activeStatuses.has(status) ? ' is-working' : ''}`);
  node.style.setProperty('--pip-color', `var(--${pipColors.includes(pip.color) ? pip.color : 'violet'})`);
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
function showHome() {
  if (state.selected) localStorage.setItem('pips:draft:' + state.selected, $('prompt').value);
  state.selected = ''; state.runs = []; state.chatSignature = ''; state.detailsSignature = ''; state.navSignature = '';
  localStorage.removeItem('pips:selected'); $('sidebar').classList.remove('open'); $('details').classList.remove('open'); render();
}
function selectPip(id) {
  if (state.selected) localStorage.setItem('pips:draft:' + state.selected, $('prompt').value);
  state.selected = id; state.runs = []; state.chatSignature = ''; state.detailsSignature = ''; state.navSignature = '';
  localStorage.setItem('pips:selected', id); $('prompt').value = localStorage.getItem('pips:draft:' + id) || '';
  $('sidebar').classList.remove('open'); render(); refresh();
}
function openEditor(pip = null, template = null) {
  state.editing = pip?.id || null;
  const profile = pip || template || { name: 'New Pip', instructions: '', color: 'violet', shape: 'round' };
  $('pip-name').value = profile.name || 'New Pip'; $('pip-instructions').value = profile.instructions || ''; $('pip-color').value = pipColors.includes(profile.color) ? profile.color : 'violet'; $('pip-shape').value = pipShapes.includes(profile.shape) ? profile.shape : 'round';
  $('dialog-label').textContent = pip ? 'Your Pip' : 'New Pip';
  $('dialog-title').textContent = pip ? 'Edit your Pip' : 'Make it yours';
  $('save-pip').textContent = pip ? 'Save changes' : 'Create Pip'; $('form-error').textContent = '';
  $('pip-dialog').querySelector('.advanced').open = Boolean(profile.instructions && pip);
  updateCreatorPreview();
  $('pip-dialog').showModal();
  requestAnimationFrame(() => setTimeout(() => { $('pip-name').focus(); $('pip-name').select(); }, 0));
}
function updateCreatorPreview() {
  const color = $('pip-color').value; const shape = $('pip-shape').value;
  document.querySelectorAll('[data-color-choice]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.colorChoice === color)));
  document.querySelectorAll('[data-shape-choice]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.shapeChoice === shape)));
  const preview = avatar({ id: 'creator-preview', name: $('pip-name').value || 'New Pip', color, shape }); preview.classList.add('preview-avatar');
  $('pip-preview').replaceChildren(preview);
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
  if (!pip) { const empty = element('div', 'empty-details'); empty.append(element('h3', '', 'Small team, big ideas.'), element('p', '', 'Each Pip has its own purpose, conversation, and workspace.')); $('pip-details').replaceChildren(empty); return; }
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
  const choices = [{ model: '', display_name: 'Default model', is_default: true }, ...state.models];
  $('model-menu').replaceChildren(...choices.map(item => {
    const option = button('', () => chooseModel(item.model)); option.className = 'model-option'; option.setAttribute('role', 'option'); option.dataset.model = item.model;
    option.setAttribute('aria-selected', String(item.model === $('model').value));
    const copy = element('span'); copy.append(element('b', '', item.display_name), element('small', '', item.model ? (item.is_default ? 'Recommended for this workspace' : item.model) : 'Use the workspace recommendation'));
    option.append(copy, svgIcon('m5 12 4 4L19 6', 'model-check')); return option;
  }));
  updateModelLabel();
}
function updateModelLabel() { const selected = [...$('model').options].find(option => option.value === $('model').value); $('model-label').textContent = selected?.textContent?.replace(' · default', '') || 'Default model'; document.querySelectorAll('.model-option').forEach(option => option.setAttribute('aria-selected', String(option.dataset.model === $('model').value))); }
function closeModelMenu() {
  const menu = $('model-menu'); if (menu.hidden || menu.classList.contains('is-closing')) return;
  $('model-trigger').setAttribute('aria-expanded', 'false'); menu.classList.add('is-closing');
  clearTimeout(modelMenuTimer); modelMenuTimer = setTimeout(() => { menu.hidden = true; menu.classList.remove('is-closing'); }, 130);
}
function chooseModel(value) { $('model').value = value; localStorage.setItem('pips:model', value); updateModelLabel(); closeModelMenu(); $('prompt').focus(); }
function dismissDialog(dialog) {
  if (!dialog?.open || dialog.dataset.closing) return;
  dialog.dataset.closing = 'true'; dialog.classList.add('is-closing');
  setTimeout(() => { dialog.close(); dialog.classList.remove('is-closing'); delete dialog.dataset.closing; }, 160);
}
function renderHome() {
  const active = state.pips.filter(pip => !pip.archived).slice(0, 4);
  const signature = JSON.stringify([active, state.user?.name]); if (signature === state.homeSignature) return; state.homeSignature = signature;
  const hour = new Date().getHours(); const time = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = state.user?.name?.trim().split(/\s+/)[0]; $('home-greeting').textContent = `${time}${firstName ? `, ${firstName}` : ''}`;
  $('recent').hidden = active.length === 0;
  $('recent-list').replaceChildren(...active.map(pip => {
    const node = button('', () => selectPip(pip.id)); node.className = 'recent-pip';
    const copy = element('span', 'recent-copy'); copy.append(element('b', '', pip.name), element('small', '', pip.last_status ? pip.last_status.replaceAll('_', ' ') : 'Ready for an idea'));
    const arrow = element('span', 'recent-arrow'); arrow.append(svgIcon('M5 12h14M14 7l5 5-5 5')); node.append(avatar(pip), copy, arrow); return node;
  }));
}
function safeUrl(raw, image = false) {
  try {
    const url = new URL(raw, location.href);
    if (url.protocol === 'https:' || url.protocol === 'http:' || (!image && url.protocol === 'mailto:')) return url.href;
  } catch {}
  return '';
}
async function loadLinkPreview(wrapper, url) {
  if (wrapper.dataset.loaded) return; wrapper.dataset.loaded = 'true';
  try {
    let data = linkPreviewCache.get(url);
    if (!data) { data = await api('/api/link-preview?url=' + encodeURIComponent(url)); linkPreviewCache.set(url, data); }
    const preview = wrapper.querySelector('.link-preview'); const copy = preview.querySelector('.link-preview-copy');
    copy.replaceChildren(element('strong', '', data.title), element('small', '', data.siteName), element('span', '', data.description || new URL(data.url).pathname));
    if (data.image) { const image = document.createElement('img'); image.src = data.image; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; preview.prepend(image); }
  } catch { wrapper.classList.add('preview-unavailable'); }
}
function inlineMarkdown(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /(!?\[[^\]]*\]\([^\s)]+(?:\s+"[^"]*")?\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    fragment.append(document.createTextNode(text.slice(offset, match.index)));
    const token = match[0];
    const link = token.match(/^(!?)\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/);
    if (link) {
      const isImage = link[1] === '!'; const url = safeUrl(link[3], isImage);
      if (!url) fragment.append(document.createTextNode(token));
      else if (isImage) {
        const img = document.createElement('img'); img.src = url; img.alt = link[2]; img.loading = 'lazy'; img.decoding = 'async';
        if (link[4]) img.title = link[4]; fragment.append(img);
      } else {
        const wrapper = element('span', 'link-with-preview');
        const anchor = document.createElement('a'); anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.append(inlineMarkdown(link[2]));
        if (link[4]) anchor.title = link[4];
        const destination = new URL(url); const preview = element('span', 'link-preview'); preview.setAttribute('aria-hidden', 'true');
        preview.append(element('span', 'link-preview-icon', destination.hostname.slice(0, 1).toUpperCase()), element('span', 'link-preview-copy'));
        preview.lastChild.append(element('strong', '', link[2] || destination.hostname), element('small', '', destination.hostname), element('span', '', `${destination.pathname}${destination.search}`));
        wrapper.append(anchor, preview); anchor.addEventListener('mouseenter', () => loadLinkPreview(wrapper, url), { once: true }); anchor.addEventListener('focus', () => loadLinkPreview(wrapper, url), { once: true }); fragment.append(wrapper);
      }
    } else if (token.startsWith('`')) fragment.append(element('code', '', token.slice(1, -1)));
    else {
      const strong = token.startsWith('**') || token.startsWith('__');
      const mark = element(strong ? 'strong' : 'em'); mark.append(inlineMarkdown(token.slice(strong ? 2 : 1, strong ? -2 : -1))); fragment.append(mark);
    }
    offset = match.index + token.length;
  }
  fragment.append(document.createTextNode(text.slice(offset))); return fragment;
}
function formattedOutput(text, className = '') {
  const node = element('div', `run-output markdown-body${className ? ` ${className}` : ''}`); const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim(); const code = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      if (i < lines.length) i++;
      const pre = document.createElement('pre'); pre.append(element('code', language ? `language-${language}` : '', code.join('\n'))); node.append(pre); continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { const h = document.createElement(`h${heading[1].length}`); h.append(inlineMarkdown(heading[2])); node.append(h); i++; continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { node.append(document.createElement('hr')); i++; continue; }
    if (/^>\s?/.test(line)) {
      const quote = []; while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      const block = document.createElement('blockquote'); block.append(...formattedOutput(quote.join('\n')).childNodes); node.append(block); continue;
    }
    const listMatch = line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]); const list = document.createElement(ordered ? 'ol' : 'ul');
      while (i < lines.length) {
        const item = lines[i].match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/); if (!item || Boolean(item[2]) !== ordered) break;
        const li = document.createElement('li'); li.append(inlineMarkdown(item[3])); list.append(li); i++;
      }
      node.append(list); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+|^```|^>\s?|^\s*(?:[-+*]|\d+\.)\s+/.test(lines[i])) paragraph.push(lines[i++]);
    const p = document.createElement('p'); p.append(inlineMarkdown(paragraph.join('\n'))); node.append(p);
  }
  return node;
}
function commentarySection(text, active) {
  const section = document.createElement('details'); section.className = 'commentary-section';
  const summary = document.createElement('summary');
  summary.append(element('span', 'commentary-chevron', '›'), element('span', '', active ? 'Live work notes' : 'Work notes'));
  section.append(summary, formattedOutput(text, 'commentary-content')); return section;
}
function renderChat(pip) {
  const signature = JSON.stringify([pip?.id, pip?.name, pip?.color, state.runs]); if (signature === state.chatSignature) return; state.chatSignature = signature;
  const chat = $('chat'); const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 100;
  if (!pip) return;
  const nodes = state.runs.map(run => {
    const node = element('article', 'message'); node.append(element('div', 'user-message', run.prompt));
    const heading = element('div', 'assistant-heading'); heading.append(avatar(pip, run.status), element('b', '', pip.name), element('span', 'run-badge', [run.model, run.status.replaceAll('_', ' ')].filter(Boolean).join(' · '))); node.append(heading);
    if (run.output) node.append(formattedOutput(run.output));
    else if (!run.commentary) { const pending = element('div', 'run-output'); pending.append(element('span', 'pending', run.status === 'queued' ? 'In the queue. Your Pip will pick this up when the worker is ready.' : run.status === 'running' ? 'Thinking it through…' : run.status === 'cancelling' ? 'Waiting for the runtime to stop…' : 'No response was recorded.')); node.append(pending); }
    if (run.commentary) node.append(commentarySection(run.commentary, activeStatuses.has(run.status)));
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
    const dialog = document.createElement('dialog'); const close = button('Close', () => dismissDialog(dialog)); close.className = 'text-button';
    dialog.append(element('h2', '', 'Run activity'), element('p', 'muted', run.id), element('pre', '', events.filter(e => e.kind !== 'delta').map(e => `${e.kind}\n${e.payload}`).join('\n\n') || 'No lifecycle events yet. Output updates are shown in the conversation.'), close);
    dialog.addEventListener('click', event => { if (event.target === dialog) dismissDialog(dialog); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismissDialog(dialog); });
    dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal();
  } catch (e) { showError(e); }
}
function render() {
  const pip = selectedPip(); $('welcome').hidden = Boolean(pip); $('chat').hidden = !pip; $('composer-wrap').hidden = !pip || Boolean(pip.archived);
  $('details-toggle').hidden = !pip;
  $('current-name').textContent = pip?.name || 'Home'; $('conversation-subtitle').textContent = pip ? 'Your private conversation' : 'Your Pips, in one place'; document.title = pip ? `${pip.name} · Pips` : 'Home · Pips';
  renderNav(); renderDetails(pip); renderChat(pip); renderHome();
}
async function refresh() {
  if (state.loading) return; state.loading = true;
  try {
    const [pips, runtime, catalog, session] = await Promise.all([api('/api/pips'), api('/api/runtime'), api('/api/models'), api('/api/session')]); state.pips = pips; state.models = catalog.models || []; state.csrf = session.csrf_token || null; state.user = session; renderModels();
    $('worker-status').textContent = runtime.status.replaceAll('_', ' ');
    $('runtime-help').textContent = runtime.status === 'ready' ? 'Ready for work. All Pips share your subscription allowance.' : runtime.status === 'unavailable' ? 'Start the worker and check its logs. Codex may need subscription login.' : 'Start the worker to process queued messages. Your conversations stay saved.';
    const requested = state.selected;
    if (requested) { const runs = await api('/api/pips/' + requested + '/runs'); if (requested === state.selected) state.runs = runs; }
    render();
  } catch (e) { showError(e); }
  finally { state.loading = false; }
}
$('new-pip').onclick = () => openEditor();
$('home-brand').onclick = event => { event.preventDefault(); showHome(); };
document.querySelectorAll('[data-template]').forEach(node => { node.onclick = () => openEditor(null, templates[node.dataset.template]); });
document.querySelectorAll('[data-color-choice]').forEach(node => { node.onclick = () => { $('pip-color').value = node.dataset.colorChoice; updateCreatorPreview(); }; });
document.querySelectorAll('[data-shape-choice]').forEach(node => { node.onclick = () => { $('pip-shape').value = node.dataset.shapeChoice; updateCreatorPreview(); }; });
$('pip-name').oninput = updateCreatorPreview;
$('close-dialog').onclick = () => dismissDialog($('pip-dialog'));
$('settings').onclick = () => $('workspace-dialog').showModal(); $('close-workspace').onclick = () => dismissDialog($('workspace-dialog'));
$('error').querySelector('button').onclick = () => { $('error').hidden = true; };
$('search').oninput = renderNav;
$('show-archived').onclick = () => { state.archived = !state.archived; renderNav(); };
$('menu').onclick = () => $('sidebar').classList.toggle('open');
$('sidebar-scrim').onclick = () => $('sidebar').classList.remove('open');
$('details-toggle').onclick = () => { $('details').classList.toggle('open'); $('details').classList.toggle('collapsed'); };
$('close-details').onclick = () => $('details').classList.remove('open');
$('model-trigger').onclick = event => {
  event.stopPropagation(); const menu = $('model-menu'); const willOpen = menu.hidden || menu.classList.contains('is-closing');
  clearTimeout(modelMenuTimer); menu.classList.remove('is-closing'); menu.hidden = !willOpen; $('model-trigger').setAttribute('aria-expanded', String(willOpen));
  if (willOpen) menu.querySelector('[aria-selected="true"]')?.focus();
};
$('model-menu').onclick = event => event.stopPropagation();
document.querySelectorAll('[data-theme]').forEach(button => { button.onclick = () => applyTheme(button.dataset.theme); });
$('pip-form').onsubmit = async event => {
  event.preventDefault(); $('save-pip').disabled = true;
  try {
    const body = { name: $('pip-name').value.trim(), instructions: $('pip-instructions').value.trim(), color: $('pip-color').value, shape: $('pip-shape').value };
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
document.addEventListener('click', event => {
  closeModelMenu();
  if ($('details').classList.contains('open') && !$('details').contains(event.target) && !$('details-toggle').contains(event.target)) $('details').classList.remove('open');
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => { if (event.target === dialog) dismissDialog(dialog); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismissDialog(dialog); });
});
$('prompt').value = localStorage.getItem('pips:draft:' + state.selected) || '';
applyTheme(localStorage.getItem('pips:theme') || 'system');
setInterval(() => { if (!document.hidden) refresh(); }, 1000); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); }); refresh();

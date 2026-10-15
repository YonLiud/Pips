fetch('/api/session', { headers: { 'X-Pips-Local': '1' } }).then(response => {
  if (!response.ok) return;
  for (const id of ['open-pips', 'hero-cta']) { const link = document.getElementById(id); link.href = '/app'; link.firstChild.textContent = id === 'open-pips' ? 'Open Pips ' : 'Enter your workspace '; }
}).catch(() => {});

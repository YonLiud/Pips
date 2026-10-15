fetch('/api/session', { headers: { 'X-Pips-Local': '1' } }).then(response => {
  if (!response.ok) return;
  for (const id of ['open-pips', 'hero-cta']) { const link = document.getElementById(id); link.href = '/app'; link.firstChild.textContent = id === 'open-pips' ? 'Open Pips ' : 'Enter your workspace '; }
}).catch(() => {});

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion-ready');
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
}

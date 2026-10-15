# Local implementation checkpoint

2026-10-15. This page supersedes stack/scope proposals in earlier design drafts.

Implemented: TypeScript Fastify API, SQLite-backed Pip records/queue/activity, one worker with an exclusive process lock, Codex stdio adapter, account-type check requiring ChatGPT, persistent thread mapping, per-Pip directories, cancellation and runtime status. Docker Compose persists application data and a worker-only Codex home. `.env.example` documents explicit `PIPS_UNAUTHENTICATED=true`; that flag bypasses only web auth.

The minimal browser interface uses plain HTML/JS and one-second polling, pending React and cursor-based SSE. It provides create Pip, select Pip, submit prompt, inspect stored output and cancel. No automatic delegation, user-configured tools, approval grants, public auth or scheduling yet. Tool approval server requests are rejected promptly; runtime is read-only. Do not treat different working directories as proven isolation.

Two internal processes are implemented, not container-per-Pip. SQLite claims serialize worker dispatch; worker lock requires manual reconciliation after a hard crash. Worker runtime failure stops processing; restart/relogin is an operator action. Auth/quota errors during a turn are not yet normalized into dedicated blocked states. Concurrency remains one active turn globally.

Verification completed: queue claiming and independent histories with a real temporary SQLite file; persistence through a separate database connection; simulated subscription handshake, API-key rejection and unknown-request rejection; syntax checks and Compose configuration parsing. Actual Codex 0.149.1 generated schemas confirmed sandbox values. A real native app-server initialization/account check with an empty dedicated Codex home reached the expected login-required error.

Not verified: real subscription inference, API dependency installation/HTTP behavior, running Docker containers, cancellation/recovery against a real model, runtime sandbox isolation or TypeScript static type checking. npm/GitHub DNS resolution and Docker engine access were blocked in this session. Do not report end-to-end success until those checks pass. No dependency lockfile exists yet; generate and review it after network access is available.

Next: install dependencies, initialize the dedicated worker login, start both services, execute two Pips and verify separate histories after worker recreation. Before public VPS deployment add Pocket ID, controlled proxy trust, authenticated events, resource limits and stricter isolation. Existing ingress configuration remains untouched.

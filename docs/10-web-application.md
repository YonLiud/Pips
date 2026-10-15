# Web application checkpoint

Implemented 2026-10-15 on local `dev`. Deployment target remains Docker Compose; Kubernetes is out of scope.

## Experience

Three-panel desktop layout with mobile sidebar/details drawers, a muted green palette, named Pip avatars and empty states. Search and archived filters operate over persisted profiles. Creation dialog supports name, instructions and color, with three optional instruction templates. Profile panel exposes edits, archive/restore, provider thread reference and message count. The workspace dialog explains local runtime setup and deferred web auth.

The conversation renders user text, output and fenced code without inserting model HTML. It displays queued/running/cancelling/terminal states and provider errors. Controls send, cancel, copy response, inspect lifecycle activity and reuse a failed/interrupted prompt. Composer supports Enter, Shift+Enter, draft retention and uncertain-request retry with the same idempotency key. Polling updates partial output once per second and avoids replacing unchanged conversation DOM. This is polling, not SSE.

## Backend additions

Additive SQLite migrations add profile instructions/color/archive metadata and request keys. Unique request keys prevent accidental duplicate queue entries; reusing a key for a different payload is rejected. Archived Pips reject new runs. Active/queued work prevents profile mutation. Worker applies instructions through the protocol's developerInstructions field when starting/resuming a thread. Worker heartbeat distinguishes stale ready state from a live worker. Runtime errors are persisted alongside output. Single-worker execution and Codex subscription authentication remain unchanged.

## Frontend choice

HTML/CSS/browser ES modules for this first app. React/Vite was proposed earlier but is not implemented. Fastify remains the only application dependency. This decision avoids claiming an unbuilt framework frontend or requiring additional downloads just for styling. API and worker boundaries allow a later frontend replacement.

## Validation and limits

Passed: syntax checks including browser JavaScript; three storage/protocol tests covering profile metadata, idempotency, FIFO claims and persisted thread mappings; and Fastify injection integration tests for access checks, CRUD/archival, queue cancellation and idempotency. Subscription-backed inference has produced a real Pip response. A live Compose probe confirmed that persisted thread mapping plus queued and cancelled records survive forced web-container recreation via the named `app-data` volume; the probe stack and volume were removed afterward. Browser visual/interactivity QA and recovery against a real resumed provider thread remain unverified in this checkpoint.

Neither this UI nor tests provide mocked model responses in the real application. Worker offline/unavailable is shown honestly. Pocket ID and public ingress remain deferred; local unauthenticated mode binds host access to loopback. No changes have been pushed to GitHub or made to the original repository outside this workspace.

## LAN access checkpoint

Unauthenticated LAN access is explicit and off by default. `PIPS_ALLOW_LAN=true` additionally requires a comma-separated `PIPS_ALLOWED_HOSTS` allowlist. Loopback names remain valid, unlisted Host headers are rejected, and requests carrying Origin must exactly match the request host and port. Docker Compose publishes port 3000 so an enabled allowlist can be reached; the application gate remains closed to LAN hosts while the flag is false. This does not replace Pocket ID and is intended only for trusted-LAN testing.

## Desktop chat and model selection checkpoint

The interface now follows a familiar desktop AI-chat structure: conversation sidebar, restrained header, centered empty state, bottom composer and an on-demand details drawer. Light and dark tokens come from the `yonliud-site` palette, with a persisted Light, Dark or System choice. This is a structural and visual reference, not a pixel-for-pixel copy of ChatGPT, OpenWebUI or Claude.

After Codex authentication, the worker calls `model/list` and stores the visible catalog for the API. The composer exposes that catalog, the API rejects model identifiers absent from it, and the selected model is stored on the run and supplied to `thread/start` or `thread/resume`. The catalog is discovery rather than proof of entitlement; successful inference remains the access check for a selected model.

## Pocket ID checkpoint

Pocket ID authentication is implemented for non-development operation. The backend uses discovery plus Authorization Code flow with PKCE S256, state and nonce, and then enforces `PIPS_OWNER_SUBJECT` independently of Pocket ID client group access. Login flows are single-use and expire after ten minutes. Sessions are opaque, stored by SHA-256 token hash, carried in a Secure/HttpOnly/SameSite=Lax `__Host-pips-session` cookie, and have a 30-minute idle and 12-hour absolute lifetime. Mutating authenticated requests require a per-session CSRF token while the existing exact-origin and Host allowlist checks remain active. Logout deletes the server-side session before clearing the cookie.

`PIPS_UNAUTHENTICATED=true` remains an explicit local-development bypass and retains its local mutation header. Authenticated startup fails closed when the public URL, issuer, client credentials, owner subject or allowed host configuration is absent. Both the public Pips URL and issuer must use HTTPS.

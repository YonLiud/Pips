# Delivery, VPS deployment and operations

## Gate 0: verify the central assumption

Before a polished frontend or scheduling engine, pin a Codex release on the actual VPS, log in using ChatGPT and prove a minimal app-server client can initialize, create a thread, send a turn, stream output, surface an approval, interrupt and resume. Inspect generated schemas rather than copying historical payloads. Test auth expiry and quota error handling. The HTTP app remains provider-independent through the adapter.

This project assumes personal use of the owner's existing subscription. Do not describe it as unlimited inference or a substitute entitlement for Dots. Document any limitation found in the spike. If the required subscription flow is unsupported, stop that implementation path and discuss alternatives; do not silently add API billing.

## Phases and acceptance

| Phase | Deliverable | Exit condition |
| --- | --- | --- |
| 0 | Runtime compatibility spike | Real subscription session, stream/approval/cancel verified |
| 1 | Pocket ID + persisted web chat | Owner-only access, reconnect, auth failures shown |
| 2 | Durable tasks and worker recovery | Crash/restart does not silently duplicate side effects |
| 3 | Bounded scheduler + explicit memory | DST/missed-run policy and quota blocking verified |
| 4 | Scoped VPS integrations | Named read capability, then audited approved write action |
| 5 | PWA and optional Codex plugin | Same domain APIs; no separate task engine |

## Proposed host deployment

Use Docker Compose as the primary deployment mechanism, behind existing Traefik. Confirmed routing conventions from the supplied Pocket ID Compose: external network `proxy`, entrypoint `websecure`, TLS resolver `letsencrypt`. Verify the actual Docker network name before deployment. Proposed origin `https://pips.yonliud.dev`; domain is not configured yet. App-server uses worker-owned stdio, with no public port.

Use separate API and worker containers with non-root users, pinned images, restart policies and bounded shutdown. Docker may itself be systemd-managed; no additional systemd unit is required for each Pips service. Only the web/API gateway joins `proxy`; the worker has outbound connectivity for OpenAI without a published listener. See the PoC document for storage and network boundaries. No second reverse proxy and no duplicate Pocket ID service.

Use image-built release files and named persistent volumes for app data, Codex home and workspaces. Codex home mounts only into the worker. Keep app state on local disk; SQLite WAL requires compatible filesystem locking across the API/worker mounts. Final permissions and mounts must match the chosen isolation model. Never mount the host Docker socket or grant runtime write access to application release files.

Start with one run at a time. Measure API, worker, runtime and browser memory before setting resource limits; reserve headroom for existing VPS services. Browser automation is deferred and separately budgeted. Bound log size, artifact storage, event history, task duration and retry counts.

## Operations

Liveness checks process health. Readiness checks schema/storage; show model authentication and quota separately so a temporary quota block does not trigger restart loops. Track queue depth, oldest queued age, active run, runtime restarts, approval wait and storage usage. Avoid high-cardinality logs containing prompts or tokens by default.

Backup SQLite with its backup API or a coordinated snapshot, not a raw copy of an active WAL database. Include artifacts, configuration and required Codex thread state. Handle Codex auth material as a separate encrypted secret backup or require re-login. Test restore before relying on backups. Backups containing conversations must be private and encrypted.

Upgrade: stop accepting dispatch, drain/interrupt worker, back up state, apply migrations, deploy pinned release, restart and verify. Rollback requires schema compatibility or restore; changing binaries alone may not reverse migrations. No automatic CLI upgrades in production.

## GitHub preparation

Keep runtime state, auth caches, `.env`, database files, logs, uploads and backups untracked. Include example configuration with placeholders, a license decision, reproducible dependency lockfiles and setup/recovery docs. CI runs domain checks and fake-runtime protocol tests without personal credentials; real subscription validation is a manual private integration check. Repository visibility and publication are still undecided. No GitHub push is implied by drafting these docs.

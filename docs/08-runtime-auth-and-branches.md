# Runtime authentication and branch workflow

Discussion update: 2026-10-15.

## Branches

User requested local `main` renamed to `prod`, with a new `dev` branch checked out. User will rename the GitHub default branch separately. Do not push, change GitHub settings, or overwrite an existing branch implicitly.

The current session could inspect a local `main` reference and origin `https://github.com/YonLiud/pips`, but could not obtain working-tree status. The repository is outside the session's writable roots. No branch mutation has been performed. Open the repository as the active writable workspace, inspect status and branches, rename `main` to `prod` if no `prod` exists, and create/check out `dev` from it. Handle existing branches without force operations. Verify the current branch and tracking after the remote rename; local upstream metadata may still name `origin/main` until fetched/reconfigured.

## Orchestration

Docker Compose remains the deployment mechanism. One application worker acts as the dispatcher/orchestrator and owns one Codex app-server process for the PoC. It is ordinary application logic, not a model-powered master agent. Pips are persistent profiles/conversations with distinct thread mappings, not individual containers. Start with one active turn globally; queue other requests. Native model delegation remains future scope.

## Persistent login, not an authentication bypass

Perform device-code login once inside the worker container as the runtime UID. Set `CODEX_HOME=/var/lib/pips/codex` and mount a dedicated persistent named volume there. For a headless container use explicit file credential storage and force ChatGPT authentication:

```toml
cli_auth_credentials_store = "file"
forced_login_method = "chatgpt"
```

The volume stores credentials, configuration and provider thread state; it must remain writable for normal credential refresh. Only the worker mounts it. Keep it out of images, Git, frontend responses and regular logs. Restrict permissions to the runtime UID. Do not share it with independent refresh-owning replicas or clone auth caches into per-Pip containers as the default design. One runtime owner avoids unnecessary concurrent credential writers.

Once the Compose worker exists, the setup flow will be:

```bash
docker compose exec worker codex login --device-auth
docker compose exec worker codex login status
```

These are planned commands, not runnable against an existing Pips deployment yet. A setup-only worker mode must stay running without starting app-server until login completes, then switch to normal execution. Alternatively use a one-off Compose setup command mounting the same volume, with the normal worker stopped.

Codex caches subscription login and refreshes tokens during normal use. Container recreation therefore need not require login if the same volume and UID are retained. Revoked/invalid credentials can still require another login. Surface `authentication_required` and pause affected work; never retry login indefinitely or silently use an API key. `docker compose down -v` deletes named volumes and can remove the login and history; ordinary deployment must retain volumes.

Pocket ID authentication is separate: web sessions can expire while the worker continues a permitted run. Reauthenticating to Pocket ID does not renew Codex credentials.

## Verification gate

Confirm subscription authentication, run a prompt, recreate the worker without deleting volumes, verify login status, and resume the recorded provider thread. Then test explicit logout/revocation handling. Do not claim perpetual login or uninterrupted quota.

Reference: https://developers.openai.com/codex/auth (checked 2026-10-15).

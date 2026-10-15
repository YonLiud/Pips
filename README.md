# Pips

Local-first proof of concept for a private ChatGPT-subscription-backed Codex session manager.

## The application

Responsive desktop-chat workspace with a searchable Pip sidebar, focused conversation surface and on-demand profile/runtime drawer. Its light and dark palettes follow the visual language of `yonliud-site`; Light, Dark and System choices persist in the browser. Create Pips with names, instructions and colors; edit or archive/restore them when idle. Send prompts, choose from the live Codex model catalog, see partial output, cancel queued/active runs, copy replies, inspect activity and bring unsuccessful prompts back into the composer. Drafts and selected Pip persist in browser storage; conversation/run state and each run's selected model persist in SQLite. Starter profiles offer Builder, Researcher and Planner instructions without inventing sample conversations.

The frontend is currently dependency-free HTML/CSS/JavaScript served by Fastify, rather than React/Vite. This keeps the first app small and avoids additional build dependencies while registry access is unavailable. The API and worker remain TypeScript, independently modular, and deployed with Docker Compose. No Kubernetes configuration or dependency is present.

Development happens on `dev`; `prod` retains the initial scaffold. See `/docs/` for the design and `docs/09-local-implementation.md` for current limitations.

## Local development, without Docker

Requires Node >=22.21 and Codex CLI 0.149.1. Built-in SQLite and TypeScript stripping are experimental Node features in this version. Install dependencies once. In one terminal:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

In another terminal, from the same directory:

```powershell
npm run worker
```

Open http://localhost:3000. Create a Pip and send a prompt. The minimal UI polls persisted output; it is not yet React or SSE. `PIPS_UNAUTHENTICATED=true` explicitly skips web login; missing/false refuses startup until Pocket ID is implemented. It does not skip Codex authentication.

LAN access is disabled at the application boundary by default. To enable it intentionally, set `PIPS_ALLOW_LAN=true` and put every accepted hostname or IP address in the comma-separated `PIPS_ALLOWED_HOSTS` value, for example `PIPS_ALLOWED_HOSTS=pipsbox.local,192.168.1.50`. Then browse to one of those exact names or addresses. Loopback remains accepted. Requests with any other `Host` are rejected, and browser requests with an `Origin` must exactly match the requested host and port. This unauthenticated mode is for a trusted LAN only.

## Pocket ID login

For deployment, remove `PIPS_UNAUTHENTICATED=true` and create a confidential OIDC client in Pocket ID. Enable PKCE, allow only the intended Pocket ID group, and register this exact callback:

```text
https://pips.yonliud.dev/auth/oidc/callback
```

Configure the container with:

```env
PIPS_UNAUTHENTICATED=false
PIPS_ALLOWED_HOSTS=pips.yonliud.dev
PIPS_PUBLIC_URL=https://pips.yonliud.dev
PIPS_OIDC_ISSUER=https://id.yonliud.dev
PIPS_OIDC_CLIENT_ID=<Pocket ID client ID>
PIPS_OIDC_CLIENT_SECRET=<Pocket ID client secret>
PIPS_OWNER_SUBJECT=<your immutable Pocket ID subject ID>
```

The backend uses Authorization Code flow with PKCE, state and nonce validation. It additionally requires the configured immutable owner subject, stores only a hash of the opaque session token, uses a Secure/HttpOnly/SameSite=Lax `__Host-` cookie, enforces a 30-minute idle timeout and 12-hour absolute timeout, and requires a per-session CSRF token for mutations. The client secret stays in environment configuration and must not enter the repository or browser.

For native Windows, set `PIPS_CODEX_BIN` to the absolute native `codex.exe` if `codex` resolves to a PowerShell/cmd shim. Use a dedicated writable `CODEX_HOME` for local testing, and log into that same home before starting the worker. Do not copy personal auth caches into the repository.

## Docker runtime setup

Copy `.env.example` to `.env`. CLI 0.149.1 matches the locally inspected protocol schema. Docker engine access and registry access are required:

```powershell
docker compose build
docker compose run --rm --no-deps worker codex -c 'cli_auth_credentials_store="file"' -c 'forced_login_method="chatgpt"' login --device-auth
docker compose run --rm --no-deps worker codex login status
docker compose up -d
docker compose logs -f worker
```

Complete device login in your browser. Stop any existing worker before the setup command. The worker volume preserves credentials and provider state across container recreation. Never delete it with `down -v` unless you intend to remove those records. Never commit or share auth caches. Compose publishes port 3000, but the API accepts only loopback hosts unless the explicit LAN settings above are enabled. This Compose file is for local development, without Traefik.

The worker checks ChatGPT account type before claiming queued work. It uses a read-only sandbox, rejects interactive permission requests, and runs one turn globally. Each Pip retains its thread mapping and has a separate working directory. After a clean restart, uncertain runs are marked interrupted. After a hard crash, the exclusive `data/worker.lock` deliberately blocks restart: confirm the previous worker and runtime are stopped, review uncertain work, then remove that lock from the app-data volume and restart. No automatic replay or API-key fallback.

## Verification

```powershell
npm test
npm run check
npm run test:api
docker compose config --quiet
```

Tests use a simulated runtime for protocol handling and temporary real SQLite databases. Subscription-backed inference has also produced a real Pip response. The API integration suite now executes locally. Persisted thread mappings, FIFO claiming, cancellation transitions and reopening state from a separate database connection are covered. A live Compose check confirmed that a provider thread mapping and queued/cancelled records survive forced web-container recreation through `app-data`; the probe stack and test volume were removed afterward. Recovery against a real resumed provider thread still needs end-to-end validation.

`test:api` exercises local and explicitly allowlisted LAN access, exact origin checks, asset delivery, validation, create/edit/archive operations, duplicate-request protection and queued/active cancellation using Fastify injection.

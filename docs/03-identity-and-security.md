# Identity and execution security

## Two independent identities

Pocket ID authenticates the human to Pips. Codex authenticates to OpenAI using the owner's ChatGPT subscription. A successful Pocket ID login does not grant or refresh model access. Pips must not substitute Pocket ID tokens for Codex credentials.

## Proposed Pocket ID flow

Backend OIDC Authorization Code flow with PKCE S256, state and nonce. Register a confidential client and enable PKCE. Confirmed issuer base URL: `https://id.yonliud.dev`; validate the discovery document and its issuer during setup. Proposed callback: `https://pips.yonliud.dev/auth/oidc/callback`. Final subdomain remains undecided. Reuse the existing Pocket ID deployment; create a separate Pips OIDC client. Pips never needs Pocket ID's encryption key or access to its data volume.

The backend exchanges codes and validates signature, issuer, audience, expiry and nonce through a maintained OIDC library. Identify users by `(issuer, sub)`, not mutable email. Configure allowed access in Pocket ID and additionally require the owner subject in Pips. Bootstrap the owner explicitly; the first public visitor must never become owner automatically.

Issue a random opaque server-side session cookie: Secure, HttpOnly, SameSite=Lax, Path=/, preferably a `__Host-` name. Rotate on login; enforce idle and absolute expiration. Authenticate event streams and file downloads. Protect mutations with CSRF tokens and origin checks. Never store provider tokens or client secrets in browser localStorage. Invalidate the local session on logout; upstream logout is optional and must be discovery-supported. Disabling a user upstream is not assumed to immediately revoke an existing local session; use short lifetimes and local revocation.

## Subscription access

Owner performs Codex device-code login on the VPS as the runtime account, outside the web UI for v1. The worker receives a dedicated Codex home/credential directory. Secrets do not enter the repository, frontend, application logs or database event payloads. Never copy browser cookies or turn subscription tokens into a public proxy.

The adapter reports authenticated, authentication_required, quota_blocked, unavailable or incompatible states. Expose safe status, not credentials. No API-key fallback, no automatic credit purchase, and no account rotation. Clear inherited API-key variables and verify effective runtime auth is ChatGPT. Any later scheduled subscription execution requires a successful compatibility spike; interactive support alone is insufficient evidence for all automation modes.

## Execution boundary

The public API process must not hold Codex credentials or privileged integration credentials. Deploy API and worker under separate unprivileged service accounts, sharing only deliberate app-state access. Worker commands run under its UID: same-UID access to credentials is a residual risk that a working-directory setting does not solve.

Treat an isolated runtime or a verified Codex sandbox as a deployment gate. Test actual read/write boundaries, credential visibility and network behavior on Ubuntu before enabling tools. An allowlisted `cwd` is useful validation, not an OS security boundary. Containers alone do not guarantee isolation either; host mounts and privileges determine access.

Allow only registered workspace roots, resolve paths canonically and constrain symlinks. Artifacts are served by validated IDs, with size limits and attachment disposition for active content. No broad home-directory mounts, unrestricted sudo, host Docker socket or host root filesystem.

Approvals bind actor, run, provider request ID, proposed operation and policy version. They expire and are single use; stale RPC requests cannot be approved after runtime restart. Browser absence leaves the run waiting. Local policy can require more approval but cannot override a provider denial. Agent output, repository instructions and fetched pages cannot grant capabilities.

## Concrete abuse cases to test

- Unauthorized owner subject; wrong OIDC issuer/audience; replayed callback; CSRF.
- Cross-workspace object access and artifact path traversal/symlink escape.
- Duplicate approval submission and old approval after process replacement.
- Prompt injection requesting credential reads or wider host access.
- Logging credentials through tool output; raw output retention needs redaction and limits.
- MCP task creation triggering itself recursively.

Keep audit metadata even when raw output is trimmed. Full command output can contain secrets: access restrict, cap and redact it; redaction is not guaranteed secret detection.

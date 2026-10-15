# Current target: subscription-backed sessions and subagents

Status: narrowed proposal for joint review, 2026-10-15. Planning only.

## What the PoC proves

From a private web app, Yon can create named Codex sessions, submit prompts, watch streamed output, handle approvals, cancel work and resume conversation history. Every model request uses the owner's existing ChatGPT subscription through Codex. No OpenAI API key, token scraping, generic inference proxy or paid fallback.

Proposed interpretation of subagents: Pips-managed child sessions assigned a task by the user, linked to a parent in the UI. These are independent Codex threads, not a claim that every thread is a native Codex subagent. Automatic planner/worker delegation and native subagent control are deferred until their runtime support and lifecycle are verified.

## User experience

1. Pocket ID login.
2. Sessions list with runtime login/limit status.
3. New session: name, prompt, optional profile and parent.
4. Session screen: messages, activity, approval requests, stop and resume.
5. Spawn child: supply an explicit brief; child receives that brief, not the complete parent history by default.
6. Inspect child result and explicitly return a summary to the parent. No automatic model-powered aggregation in v1.

Initial implementation keeps one active turn globally. Multiple saved sessions and queued prompts prove session management without assuming simultaneous throughput. Then validate a configurable concurrency of two on the VPS; both sessions share one account allowance. One active turn per thread regardless of global limit. UI distinguishes queued, active, waiting approval, blocked, interrupted and complete.

## Authentication and protocol

Owner logs into Codex inside the worker container via device-code authentication, using the same UID and Codex home as runtime execution. Use a one-off command in that container during setup; never ask for credentials in web chat. Persist auth and thread state across container replacement. Disable API-key fallback and fail clearly if subscription auth is missing.

Worker supervises `codex app-server` using stdio. Use initialize/initialized, thread/start, turn/start, thread/resume and turn interruption through the version-checked adapter. Separate sessions start fresh threads. A later explicit fork feature may use thread/fork to copy history; a Pips parent/child link alone does not fork provider history. Persist actual provider thread/session identifiers returned by the runtime instead of deriving them.

Before UI work, verify a real subscription-backed turn in the worker container, then two independent saved threads, restart/resume, approval handling and cancellation. Concurrency and sandbox behavior are separate tests. Do not present unlimited/fully autonomous operation as established by a successful single prompt.

## Compose topology

| Service or dependency | Network / exposure | Persistent access |
| --- | --- | --- |
| Existing Traefik | Existing `proxy`; public HTTPS | Existing configuration |
| Existing Pocket ID | Existing independent Compose | Its existing data only |
| pips-api, serving built web assets | `proxy` plus app-private network; internal port proposed 8000, no host port | App-state volume; no Codex home |
| pips-worker, including Codex CLI | App-private network with outbound internet; no published ports | App-state, Codex-home and workspace volumes |

Docker's app-private network must permit outbound model access; do not blindly mark it `internal: true` without an egress path. Sharing app-state is an intentional API/worker trust boundary. Worker credential isolation from its own executed commands still requires a verified sandbox; a volume boundary between API and worker does not solve same-worker credential access.

Proposed Traefik labels, matching the supplied deployment conventions:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.docker.network=proxy"
  - "traefik.http.routers.pips.rule=Host(`pips.yonliud.dev`)"
  - "traefik.http.routers.pips.entrypoints=websecure"
  - "traefik.http.routers.pips.tls=true"
  - "traefik.http.routers.pips.tls.certresolver=letsencrypt"
  - "traefik.http.routers.pips.service=pips"
  - "traefik.http.services.pips.loadbalancer.server.port=8000"
```

Illustrative labels only, not a runnable deployment. Confirm the actual external network name and chosen hostname before creating Compose. Backend sessions remain necessary even though Traefik routes HTTPS. Trust only verified proxy hops; do not copy Pocket ID's broad TRUST_PROXY range into Pips automatically.

## Pocket ID configuration

Existing issuer: `https://id.yonliud.dev`. Create a new confidential OIDC client for Pips with authorization code + PKCE, exact callback `https://pips.yonliud.dev/auth/oidc/callback` if that hostname is selected, and explicit permitted owner/group. Store the Pips client secret server-side. Do not reuse Pocket ID's ENCRYPTION_KEY. Pips validates identity and maintains its own owner-only session.

## Minimal domain model

For this PoC use sessions, messages, runs, events and approvals, plus owner/session auth and workspace records. A Pips session has its own ID, optional parent Pips ID, provider thread ID and actual provider session ID. No generic task/scheduler/memory subsystem is required now. The broader design docs reserve those extension boundaries for later.

Each new independent session gets a dedicated workspace directory. A fresh directory does not establish a security boundary: verify runtime sandbox enforcement. Parent-child sessions do not share writable files automatically. Sharing a project later requires explicit workspace selection, per-session Git worktrees or a defined write lock.

## PoC acceptance

- Deploy through Compose and existing Traefik; authenticate through existing Pocket ID.
- Verify effective model auth is ChatGPT and no API key is configured or used.
- Create two distinct Codex threads and retrieve their separate histories.
- Link a child session with a scoped brief; confirm unrelated parent history is omitted.
- Stream, reconnect, approve/reject, cancel and handle quota/auth blocks visibly.
- Recreate worker container with retained volumes; recover stored sessions and mark uncertain live work interrupted rather than replaying it.
- Run a workspace-only file action and verify it cannot escape the configured sandbox; if not enforceable, keep the PoC text-only until the boundary is resolved.

## Still to decide together

1. Confirm user-created child sessions are the intended meaning of subagents, or choose automatic delegation as the next milestone.
2. Confirm `pips.yonliud.dev` as the application hostname.
3. Pick backend after the protocol spike: Python/FastAPI versus all TypeScript. Deployment choice does not force a language choice.

Future scope remains a separate decision: recurring jobs, persistent agent memory, host administration, integrations, automatic delegation and a Codex plugin.

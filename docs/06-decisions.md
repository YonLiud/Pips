# Decisions and discussion

Requirements confirmed on 2026-10-15: Docker Compose is primary; existing Traefik provides ingress; Pocket ID is `https://id.yonliud.dev`; current target is a PoC spawning sessions/subagents using the ChatGPT subscription, without an API key. Remaining choices below are proposals. See [07-session-poc.md](07-session-poc.md).

| ID | Proposal | Why / tradeoff |
| --- | --- | --- |
| D01 | Single owner in v1 | Matches personal subscription and avoids credential pooling |
| D02 | Modular monolith + separate worker | Small deployment with durable execution; extraction remains possible |
| D03 | Codex app-server over stdio | Structured integration without exposing runtime ports |
| D04 | Subscription authentication only | User requirement; quota/auth interruptions become product states |
| D05 | Pocket ID OIDC in backend | Existing identity provider; browser receives only app session |
| D06 | SQLite + persisted event/queue tables | Appropriate initial footprint; local disk and write discipline required |
| D07 | React/TypeScript + FastAPI/Python | Familiar UI and automation ecosystem; two languages to maintain |
| D08 | Confirmed: Docker Compose + existing Traefik | Reuse proxy network, websecure entrypoint and letsencrypt resolver |
| D09 | One active run; workspace scope first | Predictable initial resource/side-effect behavior |
| D10 | VPS operations via named adapters | Add capabilities without granting a generic privileged shell |
| D11 | Future MCP interface before plugin polish | Reuse core APIs and prevent parallel implementations |

## First discussion round

1. Resolved: both systemd and Compose exist; Pips uses Compose primarily, with existing Traefik.
2. Resolved: Pocket ID is `https://id.yonliud.dev`; its existing Compose remains independent.
3. Scope narrowed: session/subagent PoC first. Propose user-created sessions with optional child sessions, not autonomous recursive delegation. Workspace access stays in dedicated Pips volumes initially; confirm this interpretation together.

## Next decisions, after the first round

- Public URL: propose `pips.yonliud.dev` rather than assume `agent.yonliud.dev`.
- Backend preference: Python/FastAPI or all TypeScript; decide after the runtime spike if no strong preference.
- First useful autonomous job and its schedule/permissions.
- Explicit memory scope, transcript retention and artifact limits.
- Existing backup destination and desired restore target.
- Repository visibility, license and GitHub owner/repository.
- Whether native mobile functionality is needed beyond a responsive/installable web app.

## Known gaps

No VPS SSH session, DNS/proxy inventory, Pocket ID client, runtime spike or application code exists in this work session. No deployment has been performed. The architecture is deliberately contingent on real subscription compatibility and execution-boundary validation.

## Review discipline

When a decision is accepted, record date, rationale and consequences here; split substantial choices into `/docs/adr/` as needed. Update the affected design page in the same change. Keep assumptions visible; do not turn proposed infrastructure into deployment facts.

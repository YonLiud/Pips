# Pips design workspace

Status: draft for discussion, 2026-10-15. No implementation or deployment is authorized by these proposed decisions alone.

Implementation has now been authorized for the local runtime PoC. See [09-local-implementation.md](09-local-implementation.md) for actual implemented scope, stack and verification limits; earlier pages retain future design proposals.

The next implementation checkpoint is [10-web-application.md](10-web-application.md): functional web UI and profile/queue additions. It supersedes the minimal-UI description in checkpoint 09.

Latest scope: a subscription-backed session/subagent PoC, deployed primarily with Docker Compose behind existing Traefik. Pocket ID issuer is `https://id.yonliud.dev`. [PoC design](07-session-poc.md) takes precedence over the broader future roadmap below.

Pips is a private, self-hosted agent application for Yon. Its web interface controls durable work on a VPS using Codex authenticated with an existing ChatGPT subscription. Pocket ID provides application authentication. No OpenAI API key or automatic paid fallback is part of this design.

## Read in order

1. [Product and scope](01-product.md)
2. [Architecture and boundaries](02-architecture.md)
3. [Identity and execution security](03-identity-and-security.md)
4. [Data and execution lifecycle](04-data-and-lifecycle.md)
5. [Delivery and operations](05-delivery.md)
6. [Decisions and discussion](06-decisions.md)
7. [Session/subagent PoC](07-session-poc.md) — current implementation target
8. [Runtime auth and branches](08-runtime-auth-and-branches.md) — persistent login and requested branch workflow

Confirmed requirements are distinguished from proposals. Resolve the decisions in the last document together before application implementation. Domain names, paths and resource limits below are proposals, not inspected VPS configuration.

## Evidence

Verified official documentation on 2026-10-15:

- [Codex app-server](https://developers.openai.com/codex/app-server): structured client integration, stdio transport, threads and turns, and approval messages. TCP WebSocket transport is described as experimental and unsupported; prefer stdio.
- [Codex authentication](https://developers.openai.com/codex/auth): ChatGPT subscription authentication, device-code login, credential storage and headless operation. API authentication is separate. OpenAI recommends API keys for programmatic automation, so subscription-backed scheduled operation must be validated explicitly rather than assumed equivalent to interactive usage.
- [Codex plan access](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan): plan limits apply to subscription-backed work.
- [Pocket ID application setup](https://pocket-id.org/docs/setup/connect-an-app): OIDC clients, discovery, confidential backend clients and allowed user groups.

Architecture, endpoints, schemas and operational policies in these documents are Pips proposals, not claims about existing product behavior. Exact runtime methods and payloads must be checked against the pinned Codex release before implementation.

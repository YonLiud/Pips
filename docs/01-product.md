# Product and scope

## Confirmed

- Project: Pips, local repository at `C:\Users\yon\Documents\pips`; GitHub intended.
- Ubuntu 26.04.1 VPS: 4 vCPUs, 8 GiB RAM, approximately 150 GiB filesystem.
- Domain available: `yonliud.dev`; Pocket ID already used.
- Primary interface: website/app; no Telegram dependency.
- Existing ChatGPT subscription must provide model access. No API key.
- Modular integration with the VPS; future Codex plugin is desirable.
- Plan and review first; documentation belongs in repository `/docs/`.

## Proposed product model

Current priority is the session/subagent PoC in [07-session-poc.md](07-session-poc.md). Scheduling, memory, host administration and autonomous orchestration are future scope. Deployment is Docker Compose with existing Traefik; Pocket ID is `https://id.yonliud.dev`.

A workspace contains conversations, tasks, files and explicitly saved memories. A conversation can launch durable work; a task records a goal and one or more execution attempts. A run executes a bounded unit of work and produces activity and artifacts. An agent profile selects instructions, model preferences and an execution policy; it is not a separate OpenAI account or an unlimited compute allocation.

Always on means the service accepts requests, retains state and dispatches eligible work while the browser is closed. It does not mean uninterrupted inference, unlimited quota, or guaranteed completion without human decisions.

## First vertical slice

1. Sign in through Pocket ID; only the configured owner is allowed.
2. See whether the VPS Codex runtime is authenticated with ChatGPT.
3. Create a conversation and send a message.
4. Stream output and display execution/approval status.
5. Disconnect the browser, reconnect and recover stored activity.
6. Approve or reject an execution request and cancel a run.
7. Restart services and recover history without silently repeating side effects.

Initial UI: conversation sidebar, chat pane, activity/approval panel and runtime status. Task details and artifacts can start as simple panels. Mobile-responsive first; installable PWA metadata can follow. Background work belongs to the server, independent of browser/PWA lifecycle.

## Subsequent phases

- Tasks and bounded recurring schedules; timezone-aware scheduling.
- Explicit editable memory and artifact browser.
- VPS adapters: service status/logs first, named service actions next.
- Additional workspaces and bounded agent profiles/subagents.
- Codex-facing MCP integration and optional plugin packaging.

## Deferred

Public signup, multiple users sharing Yon's subscription, arbitrary plugin uploads, unrestricted host administration, automatic spending, Kubernetes, a vector database, browser desktop streaming, and broad integrations before the core run lifecycle works.

## Success criteria

No API credential is required; login is restricted to the owner; closing a browser does not terminate a task; expired authentication and exhausted quota are visible states; pending approvals survive UI reconnects; a worker crash never silently replays an uncertain action; a fresh VPS installation can follow documented steps.

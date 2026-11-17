# Private access and local launch — requirements

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. A feature under the shared [PRD](../../PRD.md). Sources and owner's decisions: [PRD](../../PRD.md#sources-and-document-responsibilities). Technical design: [solution-design.md](solution-design.md). Terminology: [glossary](../../../../../GLOSSARY.md).

## Scope and dependencies

This document owns requirements R-27, R-28 and their ACs. Related: no additional domain module as a condition of the design. It does not take over the rules of other features. The actor is the owner; the scenarios are future criteria, not test results.

### R-27 — private access and AI data

The owner's latest decision (2026-10-31): the application needs no login and no accounts. Available locally through loopback, on a future VPS through an SSH tunnel. This replaces the earlier requirement for an owner session. Service keys and credentials stay on the server, outside the repository and logs. The AI input does not include contacts from the CV.

**AC-27:** the UI/API work without login over private network access. The services do not expose public application/database ports. A control CV sample with a phone number and an e-mail does not carry them into the AI input or the logs. The browser does not receive the service key. There is no registration of further users.

### R-28 — local launch and durability

WWW, the worker and PostgreSQL run in Docker Compose with durable data independent of the container lifetime. Local autostart after login requires a running container environment. Backups are made by an external service.

**AC-28:** recreating the containers while keeping the volume keeps the profile, offers, history, applications, research and budget. The application contains no backup panel or schedule. Closing the tab does not end the worker. The launch documentation clearly states the dependency on the container runtime; it does not assume that copying an active volume is a consistent backup.

## Open questions

Related: O-06. Details, consequences and how to close them: [shared register](../../open-decisions.md). We consider open questions when taking up this feature; the draft alone does not mean the implementation is ready.

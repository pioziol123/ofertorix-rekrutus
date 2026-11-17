# Private access and local launch — solution design

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. Rationale: [this feature's requirements](requirements.md) → [PRD](../../PRD.md). Coverage: R-27/AC-27, R-28/AC-28.

## Boundaries and decisions

The confirmed choices D-01–D-06 and the proposed D-07–D-08 are maintained in the [shared architecture](../../architecture.md). The other mechanisms in this file are **SD proposals**, not approved owner's decisions. Entity and command names describe the plan, not existing code. The shared semantics of null, versions and commands apply by reference, not by copy.

## Access without login

The owner's decision of 2026-10-31 replaces the earlier account/session proposal: no login and no registration. UI/API available through loopback locally, on a VPS through an SSH tunnel. Service keys stay on the server side. The rules limiting CV data in the AI input remain for a future module.

## Services and durability

Compose exposes only the WWW port on `127.0.0.1`. PostgreSQL only on the internal network, the worker without host ports. Secrets in unversioned host configuration or secret files, never in Nuxt's public runtime config. The containers have a restart policy and readiness checks; on the Mac the runtime starts after login. At startup/on a periodic check the worker compares the last execution with the plan and atomically requests one overdue run.

Migrations of the application and of the pg-boss schema have a defined order before consumers start. Do not run competing migrators from WWW and the worker. Removing/recreating containers keeps the named volume; the startup procedure does not delete volumes. Recreating a container is not a backup restore test.

Proposed values for integration trials, **not confirmed production parameters**:

| Parameter | Starting point / condition |
| --- | --- |
| Concurrency | 1 import of a given source, 1 paid stage globally |
| Source HTTP timeout | 30 s per request |
| AI timeout | choose after measurement and API limits; lower than the job expiry |
| Heartbeat | 30 s, an active worker mechanism |
| Stage expiry | choose separately for import/AI, above the bounded working time |
| Retry | application counter: at most 1 additional automatic attempt, budget before each |
| Queue retention | explicit configuration after choosing the version; never the source of history or the only copy of a pending operation |
| Overdue check | at startup and periodically; operation uniqueness prevents duplication |

The exact versions of Node/Nuxt/Nuxt UI/PostgreSQL/SDK and the migration tool were not chosen. Before the first infrastructure implementation, choose compatible versions, pin them in the images and lockfile, and check the build and how pg-boss works with a shared transaction. This is a technical condition, not a need for a new product decision.

## Integration with other features

No additional domain module as a condition of the design. Execution status, reservations and retries are provided by the [operations contract](../operacje/solution-design.md); this module provides private access and durable launch. These dependencies are contracts, not a list of the order of implementation tickets.

## Feature verification

Local access without login, host/Compose network, no secrets in the bundle/logs, recreating containers without deleting the volume, runtime autostart and work after the tab is closed. Coverage includes all R/ACs listed at the start of the document. [Integration acceptance](../odbior/solution-design.md) checks how the modules work together; it does not replace their criteria. No product tests have been run yet.

## Open decisions and readiness

O-06 — [register and consequences](../../open-decisions.md). Before marking this pair as ready, settle the contracts that concern it and review conformance with the requirements. Creating the documents alone does not approve the proposals.

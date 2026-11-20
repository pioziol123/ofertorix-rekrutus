# Queues are created at the database migration step

Sending a queue job is part of the requesting module's transaction, so the queue must already exist when the first job is sent. The migration step is the one step that surely runs before the web application and the worker start, so it creates every queue (with its failure queue) and updates its settings there, and a configuration error stops the deployment instead of a running application.

## Considered options

- Creating a queue at its first send: it would change the database schema while a request is handled, two first sends would race, and a configuration error would surface only in the running application.

Decided by the owner on 2026-11-20 (epic `oferty-pracy-2ba`, decision B1-D05 in its [solution design](../specs/2ba-praca-w-tle/solution-design.md#b1)).

# Good practices

Practices to follow when in doubt. Unlike the [architecture and coding rules](moduly-i-zasady-kodu.md), they are not binding: a task may depart from one when it has a reason, and states that reason in its solution design.

1. **A migration does not depend on a module's code.** A database migration that imports a module's code, for example its definitions or constants, can change or break when the module later changes, although the migration has already run. When in doubt, a migration writes the values it needs in itself, as the queue migrations write the queue name and key mode ([ADR 0002](../adr/0002-kolejki-zakladane-przy-migracji.md)). A migration may call a module's operation when the change needs the module's rules, for example carrying unfinished work over to a new queue at deployment.

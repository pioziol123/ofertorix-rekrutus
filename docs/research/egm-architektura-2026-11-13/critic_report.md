# Stage 7 — Design, structure and style

Reviewer `/root/critics` read all three personas, feature-spec standard, all 934 input lines, context manifest, all architecture documents, module README files, glossary and product requirements. Read-only review, no tests or history.

## Design

**D1 — Major — AI transaction integration contract is incomplete.** `docs/architecture/moduly-i-zasady-kodu.md:14` requires public module operations to participate in the same transaction. Task `.11` requires atomic publication/accounting and whole-group reservation (`review-input.md:870–874`). The public AI operations (`modules/ai/README.md:20–23`) describe individual execution and control but not caller-accessible accounting or group reservation. Tasks `.9` and `.11` could independently create incompatible interfaces. Define the required collaboration operations, transaction context and ownership, including whether they are transitional until Batch/research orchestration moves.

## Structure

No substantive structural findings. Concatenated source headings and lack of a generic PRD template are not task defects.

## Style

No substantive style findings. Current C4 and target module contracts intentionally describe different states.

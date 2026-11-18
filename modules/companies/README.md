# Companies

Companies gathers information about companies and records their roles in recruitments. [Module map](../../docs/architecture/moduly.md)

Most of its code still lives in `lib/companies/` and moves here in task `oferty-pracy-0mq.12`. This directory holds what task `oferty-pracy-0mq.22` created: basic research of a company through the AI module.

## Data

| Data                | Meaning                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Research            | One request for basic research of a company: the target (name, kind, website, description) fixed when it was requested, and its outcome. Its state holds only Companies' meaning, `requested`. ASSUMPTION(oferty-pracy-0mq.22/ASM-1)                             |
| Link to the AI work | A research is the operation of its AI execution and keeps the execution's identifier. The stage and the cost of its AI work are read from AI, never stored in Companies.                                                                                         |
| Outcome             | The published report, or the owner's message when the AI work ended without a report or Companies did not accept it. A report is never removed: every published version stays available.                                                                         |
| Research commands   | Each command the owner sent, with the answer it got, so the same command gives the same answer and creates nothing more.                                                                                                                                         |
| Read-only history   | The attempt link and the price-list snapshot (`configuration`) of research made before `oferty-pracy-0mq.22`. No code reads them; a new research writes `'{}'` in the configuration, as AI keeps the settings of its work. ASSUMPTION(oferty-pracy-0mq.22/ASM-1) |

## Research through AI

[research-ai.ts](infrastructure/adapters/research-ai.ts) translates a research into agent work with web search under the settings key `research`: the instruction for the search, the instruction for writing the report from the gathered evidence units, the response schema (derived from the report draft contract) and the target as the input.

- **A request** ([request-research.ts](request-research.ts)) reuses the company's research still in progress in AI, and its latest published report unless the owner asks for a refresh. Requests of one company are decided one at a time under a transaction lock, so a company has at most one research in progress. Otherwise the research and its AI work are requested in one transaction: AI reserves the budget of both steps and the three searches, or the work waits for budget. Research that cannot be requested now (missing settings or secret) is refused before anything is saved.
- **The receiver** ([receive-research.ts](receive-research.ts)) runs in AI's delivery transaction. It validates the report draft against the evidence the agent gathered (every topic covered, each fact and opinion quoting an evidence unit exactly, only safe sources, at least one finding backed by a source) and publishes it, or rejects it with the owner's message; publication and settlement commit together. It accepts the same delivery again without publishing twice.
- **An end without a report** gets a message chosen from the public state and cause alone ([research-outcome.ts](domain/research-outcome.ts)). A search without cited material and a report without sourced findings keep their earlier messages; an HTTP error is named without the provider's status. ASSUMPTION(oferty-pracy-0mq.22/ASM-2)

The owner sees the state of a research from its execution: waiting for budget, queued, in progress (running or delivering), ready (completed), failed (failed, rejected, or retried: only research that was in progress when it moved to AI), or interrupted with its cost to check (uncertain). The cost is reserved while the work runs, then settled, or unknown while its reservation stays.

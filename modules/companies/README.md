# Companies

Companies gathers information about companies and records their roles in recruitments. [Module map](../../docs/architecture/moduly.md)

## Public operations

Routes, the worker and other modules import operations from `index.ts`. Views run in the browser, so they have a separate entry `view.ts`, which does not reach into server code.

| Operation                                                        | Entry      | Contract                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Company creation (`createCompany`)                               | `index.ts` | Takes a command identifier, the name, kind, website and description. The same command gives the same answer; a reused identifier with other content ends with `CompanyConflict`.                                                                       |
| Link change (`changeCompanyLink`)                                | `index.ts` | Links a company to an ad in a role, or removes the link, with the evidence and the expected current company; records the change with the ad version read. An unknown company or ad ends with `CompanyNotFound`, a changed link with `CompanyConflict`. |
| Company reads (`listCompanies`, `readCompany`, `offerCompanies`) | `index.ts` | The list with search, sort and pages of 25; a company with its offers, technologies and link history; the companies of an offer and suggestions by the offer's company name.                                                                           |
| Research (`requestResearch`, `readCompanyResearch`)              | `index.ts` | Described in Research through AI below.                                                                                                                                                                                                                |
| Labels for views                                                 | `view.ts`  | Company kinds and roles, research topics, kinds and scopes, and whether a report has sourced findings.                                                                                                                                                 |

## Directory layout

| Place                                                            | Contents                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `index.ts`, `view.ts`                                            | Public entries: for the server and other modules, and for views.                                          |
| `company-commands.ts`, `read-companies.ts`                       | Commands on companies and their links, and their reads.                                                   |
| `request-research.ts`, `read-research.ts`, `receive-research.ts` | Research request, read and receiver.                                                                      |
| `domain/`                                                        | Company and link commands, the research report and its validation, and the messages of research outcomes. |
| `infrastructure/persistence/`                                    | Companies, links and their history; research records.                                                     |
| `infrastructure/adapters/`                                       | The integration with the AI module.                                                                       |

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

The owner sees the state of a research from its execution: waiting for budget, queued, in progress (running or delivering), ready (completed), failed (failed, rejected, or retried: only research that was in progress when it moved to AI, shown with the message "Research przerwano przy zmianie wersji aplikacji, a rezerwację zwolniono. Ponowienie wymaga nowego żądania."), or interrupted with its cost to check (uncertain). The cost is reserved while the work runs, then settled, or unknown while its reservation stays.

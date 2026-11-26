# Recruitments

The Recruitments module keeps the owner's applications to job offers: which offers the owner considers, where the owner sent a CV and which recruitments ended in a rejection. This description gives the module's responsibility, the state of its implementation, the public operations, the directory layout and the dependencies. [Domain glossary](../../GLOSSARY.md) · [Module map](../../docs/architecture/moduly.md) · [Specification](../../docs/specs/lq3-lista-aplikacji/solution-design.md)

## Responsibility

An **application** is the owner's process of applying in response to one offer. An offer has at most one application, and an application is never deleted. The module owns:

- **the stage of an application**: one of "Do rozważenia" (`to_consider`), "CV wysłane" (`cv_sent`), "Odrzucone" (`rejected`) and "Zdjęta z listy" (`removed`), with the stage moment, the moment the owner moved the application into it;
- **the transition table**: the stages the owner may move an application to from each stage, and from no application, where the move creates it;
- **the history of stages**: one record of each move with its stage and moment; records are only added;
- **the note** of the application, a free text stored with it (used from task `oferty-pracy-lq3.2`);
- **the labels and refusal texts** every page shows for these states, as their one owner.

The module does not know offers: it trusts its caller that an offer exists. The Offers module checks that before the first move.

## Implementation state

- **Stages, transitions and the history** are implemented (task `oferty-pracy-lq3.1`). The stage field in offer details moves the application.
- **The note, the page "Moja lista" and the application details** come in task `oferty-pracy-lq3.2`; the note column exists and stays empty until then.
- **Applications point at ad IDs**, since offers are not grouped yet. When grouping arrives, applications must move to the grouped offer.

## Public operations

| Operation                                | Entry      | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create application (`createApplication`) | `index.ts` | For the Offers module's start application only. Takes the offer ID, the target stage and "now". The target must be allowed from no application. Inserts the application and its first history record in one transaction. When the offer already has an application, the same target succeeds without a write, and another one is refused as `StageChanged`; two parallel creates of one offer meet the same way.                                                                                                                   |
| Move application (`moveApplication`)     | `index.ts` | Takes the offer ID, the stage the page showed (expected), the target stage and "now". A pair outside the transition table is refused as `TransitionNotAllowed`. A conditional update applies the move only while the application is in the expected stage, and appends the history record in the same transaction. Otherwise: no application is `ApplicationMissing`, an application already in the target stage succeeds without a write (a retry, or the same choice from a second page), and any other stage is `StageChanged`. |
| Application details (`readApplication`)  | `index.ts` | Takes an offer ID and returns the stage, the stage moment, the note and the history of stages newest first, or nothing when the offer has no application or the ID is not a UUID.                                                                                                                                                                                                                                                                                                                                                  |
| Current stages (`readCurrentStages`)     | `index.ts` | No input. Returns the stage of every application by offer ID, `removed` included, in one query. For the offer list (task `oferty-pracy-lq3.3`).                                                                                                                                                                                                                                                                                                                                                                                    |
| Stages, labels and texts                 | `view.ts`  | The stage values, their labels, the label "Bez aplikacji", the stages allowed from each state (`allowedStages`), the texts of refusal codes (`refusalText`) and the messages of a stale page and of a note too long. Every other place reads them from here.                                                                                                                                                                                                                                                                       |
| HTTP handler                             | `index.ts` | `readApplicationOverHttp`, `moveApplicationOverHttp` and `answerRecruitmentRefusals` for the routes. They answer each refusal with its status and a stable code in the body `data.code`: `application_stage_changed` (409), `application_not_found` (404), `transition_not_allowed` (422) and `invalid_input` (422).                                                                                                                                                                                                               |

Each refusal is a named error with a machine-readable `reason`, one per broken rule; its message names the rule and never repeats the refused value. Commands take "now" from the caller and run in the shared transaction mechanism; a call inside a running transaction joins it. Reads take no locks.

## Directory layout

| Place                                                                  | Contents                                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`, `view.ts`                                                  | Public entries: for the server and other modules, and for views.                                                                           |
| `create-application.ts`, `move-application.ts`, `read-applications.ts` | Operations: each reads what it needs, asks the domain part, writes and returns the result.                                                 |
| `refusal-codes.ts`                                                     | The stable codes of refusals and the texts pages show for them.                                                                            |
| `domain/`                                                              | The stages, the transition table, the rule that choosing the current stage again is done, and the refusals; unit tests without a database. |
| `infrastructure/persistence/`                                          | The SQL of the tables `recruitment_applications` and `recruitment_stage_changes`.                                                          |
| `infrastructure/http/`                                                 | The HTTP handler, which talks to the operations only and alone maps refusals to responses.                                                 |

The test on an isolated database and the test of the routes on a running server are cross-cutting and live in the shared test directory.

## Dependencies

- **Shared infrastructure**: database access through the shared accessor and transaction.
- No other module. The Offers module depends on this one: its start application calls create application, and it reads the stage values from `view.ts`.

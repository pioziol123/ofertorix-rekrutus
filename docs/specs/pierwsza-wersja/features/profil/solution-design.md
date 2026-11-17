# Professional profile and criteria — solution design

Status: **local part and AI running; controlled provider trial completed successfully**, 2026-11-01. Rationale: [R-01/AC-01 and R-02/AC-02](requirements.md) → [PRD](../../PRD.md). The owner's decisions described in the requirements are confirmed. Below is the technical solution for the current profile. The real API trial was run on a fictitious CV; automated tests use controlled transport responses. Evidence of the local experiment: [CV extraction](../../../../research/profil-import-spike/README.md). The result of the provider trial is recorded in Beads `oferty-pracy-88x`.

## Scope and existing code

Running: Nuxt 4.6.3, Nuxt UI, Node 24.15.0, PostgreSQL and a separate pg-boss worker. The profile module adds the `/profile` page, its own API and a migration; it keeps the importer, the list and the absence of login. Local access through loopback, a future VPS through an SSH tunnel. The PHP Senior fetch scope stays in the existing `source_scopes`; the profile does not create a second copy of this configuration.

This stage covers the manual profile, CV PDF/DOCX/text, a proposal of professional data, the draft, the re-import comparison, approval and version history. Offer assessments and research remain later modules. Approval does not currently request assessments; future triage will receive an explicit `profile_version_id`.

## Flow and data boundaries

1. The owner can start manually or add a CV. The upload saves the original and a durable import record; the worker reads the text locally.
2. After reading, the source text and any order/completeness problem are visible. An empty result, a password or a parser error suggest pasting the text. The original remains available for download.
3. Preparing the AI proposal uses only the extracted professional text. The owner sees and can correct the text for analysis; contact details are removed by the local preparation step. An unresolved fragment can be skipped and added manually. The upload alone does not send the file or the whole raw CV to the service.
4. The result is a proposal of skills/experience with evidence. The owner reviews and corrects it. AI does not create pay expectations or preferences from previous jobs.
5. Expectations are completed separately. The draft can be saved and continued; approval shows a summary and creates the active version.

A missing key/model/price list or funds blocks only the AI preparation, with an explicit state. Local reading, CV download and the manual form still work. This does not replace the required AI import with a manual extraction pretending to be a finished result.

## Form model

The data document version has `schemaVersion: 1`. The form covers experience, skills, direction, and expectations and exclusions. Contact details are not part of the profile contract for assessment. Empty collections of professional data mean no saved data, not evidence of missing skills.

- Experience/project: a stable UUID, role, optional company/project name, a period with month or year precision, a description of responsibilities and achievements, technology links. An unknown start/end stays null; a current job has an explicit `ongoing`.
- Skill: UUID, name, a nullable level `basic/intermediate/advanced/expert`, an approximate duration `{amount: decimal-string, unit: months|years}`, last use `unknown/current/date` with year/month precision and a description of how it was applied. No level is not `basic`, no years is not zero. We do not automatically sum overlapping projects. The list of levels is a presentation decision of this SD; every value apart from the name is optional.
- Direction: roles/seniority, technologies to develop, type of company/project and a description of goals. It does not mean having these competences.
- Expectation: `unknown` (no answer), `no_preference` (explicit indifference) or `specified` with a value and `importance: required|preferred`. Exclusions are separate explicit criteria, not a synonym for a skipped answer.
- Pay: **one minimum for one contract**. An entered amount requires `contractType`, `currency`, `period`, `basis` and an exact decimal-string minimum >= 0. An ISO currency from the list supported by the form, period Month/Year/Day/Hour/Fixed, basis gross/net/net_plus_vat. We do not convert bases/periods/currencies. A contract change requires reviewing the amount basis; the form does not automatically carry B2B net over to UoP gross. Unknown/no_preference does not require an artificial amount or contract.

The other agreed conditions: location and the possibility of working from Poland, remote/hybrid/office and office days, working hours, languages, time zone/overlapping hours/on-call duty. The fields have a typed state and importance, and the value of a condition is descriptive text at this stage. Future matching requires explicit normalisation of these descriptions; it must not guess hard criteria. Pay has separate typed fields. Must-have requirements and exclusions will later be visible separately from the rating.

## Saving, versions and comparison

| Table | Contract |
| --- | --- |
| profile_head | One record, nullable `active_version_id`; a pointer only to an approved version. |
| profile_drafts | One current draft: UUID, revision, base active version, JSONB schemaVersion=1, update time. Saving does not activate the data. |
| profile_versions | UUID, sequential number, approval time, full JSONB data, source imports and field provenance. An immutable snapshot. |
| profile_imports | UUID, kind file/text, metadata and hash of the original, status, local text, selected professional text with a revision, the proposal and parser/model/prompt metadata. |

Provenance of a fact: manual, or import_id together with an evidence fragment from a specific text revision. A manual change takes precedence only after the owner's choice; we do not assume a later import is more true. A version can combine data from several imports, so the link is not limited to one file.

On a re-import the new proposal is compared with the current draft or the active version. Added/changed fields are visible; the owner chooses the changes. A field skipped by AI does not remove the previous value. Matching items by name is a suggestion, not an automatic merge of two workplaces or technologies. Manual expectations are not in the input or result of this mutation.

The empty state has revision 0; the first save creates a draft with revision 1. Saving the draft requires expectedRevision. Approval requires the draft's expectedRevision and expectedActiveVersionId; the transaction locks the head, validates the base, saves the snapshot and updates the head. A mismatch gives 409 with the current number, keeping the form's local text. Disallowed fields/types give 422. All questions can be skipped; unknowns do not block approval. A double approval of the same draft does not create two versions: it relies on a unique command identifier and returns the previous result.

## CV original and the local parser

A separate named volume `documents`, mounted in WWW and the worker at `/data/documents`; it is not part of public/, the code, the image or node_modules. The name on disk is assigned by the server (UUID). Download by import id, with Content-Disposition attachment and a safe name; a name supplied by the user does not control the path. The external backup covers the database and this volume, without implementing backups in the application.

Initial limit: one PDF/DOCX up to 10 MiB, PDF up to 30 pages, read/pasted text up to 120000 characters. The limits concern this implementation and are validated before paid work. Exceeding them shows the reason and the option to complete manually/use a shorter text, without silent truncation. HTTP accepts a binary body up to 10 MiB, no multipart; 413 when exceeded, 415 for an unsupported format. We verify the format's structure, not just the name/MIME. We do not support DOC, DOCM or OCR.

`pdfjs-dist@6.4.299` and `mammoth@1.13.0` were chosen. The [experiment](../../../../research/profil-import-spike/README.md) on Node 24.15.0 confirmed basic reading without changing the application's dependencies. PDF: legacy getDocument/getTextContent, standard fonts from the local package. Version 6 no longer exposes the isEvalSupported option; we use only the text API. DOCX: extractRawText with one argument, no HTML; access to external files is disabled by default in the library. CV formatting and the order of multiple columns require a review of the text. We do not run scripts from the document or fetch resources the CV points to. Extraction in a separate worker process: 30 s, Node heap 256 MiB; a timeout ends the process, keeping the file and the error state. The heap limit is not a guarantee of a limit on the whole RSS; measuring memory belongs to verifying the implementation.

The import record is first created as receiving; the body is buffered with an enforced 10 MiB limit; the temporary file and the hash are created before an atomic rename. This is a deliberate simplification compared to the planned streaming save. Then a transaction sets stored/queued and enqueues the pg-boss job on the same SQL client, following the working pattern of the offer importer. A failure between the file and the transaction gives a recoverable state, not a pretend filesystem+SQL transaction. Recovery checks the hash and the presence of the file; a missing file gives source_missing without changing the active profile. No automatic deletion of previous CVs.

## AI proposal: bounded contract

The provider and model from D-05 stay: OpenAI Responses API, a configurable profile stage, initially `gpt-6-luna`. Official sources read on 2026-11-01: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [model card](https://developers.openai.com/api/docs/models/gpt-6-luna), [data controls](https://developers.openai.com/api/docs/guides/your-data).

Native fetch to Responses, a single call per attempt, `store:false`, no tools, search, Files API or conversation chain. The professional text has a local revision and hash. Only this text (without the file name, phone/e-mail/address) and the versioned instruction/schema go into the request. A local filter removes recognised contacts; the preview and the choice of fragments are part of preparing the input. We do not promise that a regex alone will correctly recognise all personal data. The CV text is data, not an instruction to execute. `store:false` is not a promise of zero retention at the provider; the data controls documentation gives the details.

Format: JSON Schema strict, additionalProperties=false. All keys present, unknown values null or empty collections. The result is only experience/skills/languages and evidence fragments; no pay, preferences, contact details or rating. The local validator checks the schema and the exact occurrence of the evidence in the approved text. Missing evidence does not become a confirmed fact. A refusal, an incomplete result and a semantic error have the needs_attention state, without automatically saving part of the result as the active profile.

When the result arrives after the draft/text has changed, it stays a historical proposal of the specific import. It does not overwrite the new draft; applying it requires the current expectedRevision and the owner's choice.

## Cost and launching a paid attempt

The profile uses the shared [operations and budget](../operacje/solution-design.md) contract, not its own second counter. Before the first AI call a minimal part of that module is needed: atomic reservation, a durable attempt, usage settlement and an unknown cost after a timeout. No budget gives waiting_budget; a missing key/price list/conversion rate gives needs_configuration. We do not treat OPENAI_API_KEY alone as readiness for paid work.

Proposed execution limits: max_output_tokens=6000 (including reasoning), reasoning.effort=low, foreground, the standard service tier, a 90 s timeout. The worker calls the API outside the SQL transaction, at most one additional automatic attempt for a transient error, with a new reservation; pg-boss retryLimit=0 for this work. We do not repair JSON endlessly. A single paid job globally, manual before pending automatic. A historical attempt does not change its reservation month after the 1st day of the month.

The upper bound of the reservation uses the versioned model configuration: the whole maximum context as a conservative input bound, plus the output limit. The rates cover the most expensive matching input/cache write variant, long context and the relevant configuration surcharges. This is a larger reservation than the typical cost of a CV; after usage we settle the real tokens according to the saved configuration. We do not add another network call just to estimate tokens. A model/price list/conversion rate without complete data, or a model changed without an assigned configuration, cannot start an attempt. The PLN conversion rate is a versioned parameter of the application's accounting, not a guarantee of matching the invoice.

No paid attempts were made and account access was not checked in this session. The key is configured locally, outside the repository and logs. The first attempt is to check request conformance, real usage and quality; the integration must not be marked as verified before such a test. Missing configuration does not block implementing the form and the local import.

## API and module boundaries

| Endpoint / command | Result |
| --- | --- |
| GET /api/profile | The active version, the draft with its revision and history metadata; no profile is an empty state, not an error. |
| PUT /api/profile/draft | A full explicit snapshot of the draft and expectedRevision; missing selected fields are unknowns, not a rollback of the active version. |
| POST /api/profile/confirm | Command id, expectedRevision, expectedActiveVersionId; a new version or the previous idempotent result. |
| POST /api/profile/imports | A file or text, 202 + import_id after durable acceptance; does not activate the profile. |
| GET /api/profile/imports/:id | State, text and proposal of the specific import. |
| GET /api/profile/imports/:id/file | The original as an attachment; 404 for a text import, source_missing when the file is lost. |
| POST /api/profile/imports/:id/prepare | Revision of the selected professional text; requests the AI proposal after the configuration/cost check. |
| POST /api/profile/imports/:id/apply | Explicitly chosen changes to professional data + expectedRevision; does not mutate expectations or the head. |
| GET /api/profile/versions/:id | The immutable snapshot and its linked sources. |

Mutations check an Origin matching the local host and the Content-Type; no accounts or sessions. A list filter change still does not call any of these commands. The current source_scopes have their own history and are not modified by saving the profile.

## Verification and readiness

| Criterion | Evidence for accepting the implementation |
| --- | --- |
| R-01: import and original | Text/multi-column PDF, Polish DOCX, no text, corruption, password, limits and timeout. Hash of the downloaded original and recreating the container without losing the document. |
| R-01: profile and versions | Manual completion without CV/AI, all skips, unknown/no_preference, one minimum, optional levels/years. The draft does not change the head, a conflict between two tabs does not lose data, confirm is idempotent. |
| R-01: re-import | Proposal comparison, field choice, no removal of skipped facts and expectations, an old AI result does not overwrite a later edit. |
| R-01: AI | Transport test on controlled responses; no contacts/original/tools, schema/refusal/incomplete, evidence, configuration and cost/retry/timeout/month boundary. A separate controlled provider trial before AI is considered working. |
| R-02 | Saving the profile does not change the list filters or the PHP Senior import scope. An invalid or empty profile does not remove offers. |

Implemented: the form, versions, local import and the gated AI transport. The tester added 36 profile tests, including 5 HTTP tests on a separate Nitro server and isolated schemas. A controlled GPT-6 Luna trial on a fictitious CV returned HTTP 200 and a correct result: 306 input tokens, 325 output tokens, a conservative cost of 0.001525 PLN. Checked: the schema, exact evidence from the text and applying the proposal without guessing skill levels or pay. The test schemas were removed; the trial did not change the owner's profile. After web/worker were recreated, both processes loaded the configuration, and the profile API confirmed AI readiness.

The cost settled from usage is a conservative accounting estimate, not an invoice amount. Unknown costs stay reserved and are included in the visible budget. By the owner's decision of 2026-11-01 the interface for clarifying them manually was postponed to task `oferty-pracy-qld`; it does not block activation. The CV import still uses the Responses API directly. Future offer assessments and matching will use the Batch API, in line with task `oferty-pracy-8kt`.

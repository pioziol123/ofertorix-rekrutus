# Professional profile

Target architecture of the `modules/profile/` module. The module is responsible for the CV import, preparing a proposal of data from the CV, editing the draft, and confirming and reading professional profile versions. [Domain glossary](../../GLOSSARY.md) · [Module map](../../docs/architecture/moduly.md)

## Profile data

- **Experience and skills** describe the owner's work so far. Data accepted from a CV may point to the import, the text revision and the quote it comes from.
- **Career direction** sets the roles sought, the position level, the technologies to develop in and the expected kind of work.
- **Expectations and exclusions** describe the conditions of a future job, e.g. work mode, minimum salary or excluded industries. A given expectation can be a must-have requirement or a preference. Missing information stays an unknown. The owner can also explicitly state that there is no preference.

Matching fetches the active profile version together with its ID and applies its own assessment rules. The scope of fetching ads is set by the Offer sources module, and the filters for browsing saved offers belong to the Offers module.

## Public operations

| Operation                    | Contract                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CV import                    | Takes a document or pasted text. Returns the import ID and the state of text preparation.                                                                          |
| Import read                  | Exposes the import state, the text for review, the state and result of the proposal preparation and the original file, if one was uploaded.                        |
| Proposal preparation request | Takes the selected text and the expected import revision. Saves the text revision used to prepare the proposal and requests the execution.                         |
| Proposal application         | Takes the import ID, the text revision, the choice of elements and the expected draft revision. Adds the selected items or replaces the items the owner indicates. |
| Draft read and write         | Exposes the editable data with a revision ID. The write checks the expected revision to detect a change since the read.                                            |
| Profile confirmation         | Takes the expected draft revision and the ID of the current active version. Creates an immutable version and activates it in one operation.                        |
| Confirmed versions read      | Exposes the active version together with its ID, information that there is no active version, the history and a read of a given version.                           |

## From CV to active profile

1. **Import and text extraction.** On a document import the module keeps the original and extracts the text for review. If extraction fails, the owner can enter the text by hand. Pasted text is available for review at once.
2. **Choosing the text for analysis.** The owner reviews and may correct the text, then requests the proposal preparation. The module removes recognised contact data and saves a revision of the cleaned text. This revision is the input to the analysis and the basis for the later verification of quotes.
3. **Proposal preparation.** AI returns a structured summary, skills and experience. The Profile module checks that the result matches the contract and that quotes for skills and experience are present in the saved text revision. A valid proposal is saved with this revision. A result for an older revision does not replace a proposal for newer text.
4. **Draft review and editing.** The owner judges whether the quotes justify the conclusions, chooses the items to apply and can add or correct data by hand. Applying the proposal changes only the draft. The owner fills in the career direction, expectations and exclusions separately.
5. **Confirmation.** The owner confirms the draft with a separate operation. The new version becomes active for Matching, and earlier versions stay available in the history.

## Division of responsibility with AI

| Part                 | Responsibility                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Professional profile | Prepares and saves the text chosen by the owner, requests the proposal preparation, ties the execution to the text revision, checks the quotes, saves the result and applies the selected changes to the draft. |
| Integration layer    | Translates the request into an instruction and a response schema and passes the Profile module the execution ID, a unified state and the result in an agreed format.                                            |
| AI                   | Chooses the provider and model, handles communication and the queue, coordinates the shared local execution, recovers interrupted executions and is responsible for retries, the budget and settlement.         |

The Profile module uses one interface for proposal preparation. The choice of provider and the execution mode belong to the AI module.

## State of implementation

Proposal preparation runs through the [AI module's contract](../ai/README.md#adding-an-execution-path). The Profile's integration layer turns the request into an instruction, a response schema and the cleaned text, under the settings key `profile`, and is the result receiver for that key. The import is the AI operation and the text revision its input version.

- **Result.** The receiver checks the proposal contract and the quotes against the text revision and saves the proposal with the import. A result for a revision that is no longer current replaces nothing. A rejected result leaves the owner's message with the import.
- **End without a result.** The import shows the message for the public state and cause, the same whichever provider ran the work. An `uncertain` end shows: "Nie wiadomo, jak zakończyło się przygotowanie propozycji. Profil pozostaje bez zmian. Sprawdź stan wykonania przed ponowieniem."
- **Progress.** While preparation is in progress, the import read takes its status from the latest AI execution of the import.

The profile routes pass every request to these public operations: the CV import and the original file, the import read, the proposal preparation request, the proposal application, the draft read and write, the confirmation and the read of a given version. The profile page shows the AI budget from the AI module's budget history read. Proposal application takes no text revision from the owner: it applies the proposal with the text revision the proposal was prepared for, which is the import's current one (assumption `oferty-pracy-0mq.11/ASM-1`). The fields of the former Profile path in the AI data are no longer used; removing them belongs to the epic `oferty-pracy-sq2`.

## Entries and directory layout

Routes, the worker and other modules import operations from `index.ts`; it also exports what the worker uses to extract the text of uploaded documents (`workCvTextQueue`, `recoverImports`) and the queue settings the queue schema is prepared with. Views run in the browser, so they have a separate entry `view.ts`, which does not reach into server code: the profile data type, the empty profile and its items, the expectation keys and the proposal type.

| Place                         | Contents                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| operation files               | CV import, text extraction, proposal preparation and application, draft and confirmed versions.           |
| `domain/`                     | The profile data and proposal contracts, the CV document rules, proposal preparation and result.          |
| `infrastructure/persistence/` | Imports, the draft and the confirmed versions.                                                            |
| `infrastructure/adapters/`    | The stored original documents, the text extraction helper process and the integration with the AI module. |
| `infrastructure/worker/`      | The queue that extracts the text of an uploaded document.                                                 |

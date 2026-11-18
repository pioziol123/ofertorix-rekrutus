# Job offer management

Terms used when searching for offers for the system's owner, managing them and preparing for recruitment.

## Domain language

**Source ad** (ogłoszenie źródłowe):
A specific offer entry on a specific portal, with its own content and change history.

**Ad change history** (historia zmian ogłoszenia):
A record of an ad's changes over time, separate from its current content and from any kept full content of earlier versions.

**Job offer** (oferta pracy):
A shared employment opportunity, to which several source ads about the same recruitment may be linked.

**Offer merge** (połączenie ofert):
Treating the indicated offers as one, approved by the owner and recorded in the history.

**Offer split** (rozdzielenie ofert):
Undoing a merge while keeping the source ads, notes and history; an existing application stays assigned to the offer the owner indicates.

**Data discrepancy** (rozbieżność danych):
Conflicting information about the same offer, which keeps the source of each value and stays separate from the information the owner marked as binding.

**Material ad change** (istotna zmiana ogłoszenia):
A change to information that affects the match, e.g. technologies, salary, seniority or work mode; formatting alone is not such a change.

**Stale match assessment** (nieaktualna ocena dopasowania):
An assessment that refers to the state of the ad before a material change, kept in the history and marked as stale until a new assessment is complete.

**Criterion unknown** (niewiadoma kryterium):
A lack of information that would confirm or rule out that an offer meets a criterion; it is reported openly and is not by itself a reason for rejection.

**Ad unavailable at the source** (ogłoszenie niedostępne w źródle):
An ad that was not found during a complete check of the source; its absence alone does not confirm that it expired or that the recruitment ended.

**Ad expired at the source** (ogłoszenie wygasłe w źródle):
An ad whose expiry follows from the source's information, e.g. a validity date; this state does not automatically mean the owner's application has ended.

**Complete source sync** (pełna synchronizacja źródła):
A check of all ads in the set scope of a source, finished with no missing parts.

**Incomplete source sync** (niepełna synchronizacja źródła):
A run that fetched only part of the set scope; the valid results stay available, and the absence of the other ads does not show that they are unavailable.

**Organisation** (organizacja):
A specific entity, e.g. a Polish or German company; it may be linked to other organisations through a shared brand or group.

**Brand** (marka):
A name under which one or many organisations may appear; the brand alone does not settle which organisation is the employer.

**Organisation group** (grupa organizacji):
Linked organisations that stay separate as entities and employers.

**Professional profile** (profil zawodowy):
A description of the system owner's experience and skills, initially based on the CV and extended with preferences and exclusion criteria.

**Baseline requirements** (wymagania podstawowe):
Criteria that set the scope of offers fetched from sources before match assessment.

**Professional preferences** (preferencje zawodowe):
Expectations of a future job, separate from the skills and experience held.

**Must-have requirement** (wymaganie konieczne):
A profile criterion that must be met for an offer to count as suitable; missing information stays an unknown, not evidence that the criterion is not met.

**View filter** (filtr widoku):
A condition that limits the offers shown from the saved database, independent of the fetch criteria and the match assessment.

**Offer triage** (triage ofert):
The stage of assessing fetched offers against professional preferences, covering the match assessment and its descriptive justification.

**Offer match** (dopasowanie oferty):
An assessment of how well an offer fits the professional profile, together with a justification.

**Employer research** (research pracodawcy):
Collected information about a company, its business, projects, conditions and working methods and its technologies, attached to the company profile and helping to assess an offer and prepare for recruitment.

**Company profile** (profil firmy):
A record of information about an organisation, its links and its offers, to which the employer research results are attached.

**Information source** (źródło informacji):
The origin of information, e.g. an ad, the company's website, own knowledge or a conversation with a recruiter; entering or correcting information by hand uses the same mechanism whatever its origin.

**Research version** (wersja researchu):
A report attached to the company profile, kept together with earlier reports; the result of an on-demand retry becomes the current version.

**Assessment history** (historia ocen):
A viewable record of successive automatic and manual assessments; a new AI assessment may replace the owner's assessment without deleting earlier values.

**Basic research** (research podstawowy):
The first stage of employer research, providing basic information about the company for assessing how attractive an offer is; an existing result is reused, and a new investigation requires the owner's request.

**Deep research** (research pogłębiony):
The second stage of employer research, aimed at preparing for recruitment for a specific position, taking the team or project into account if they are known.

**Interview preparation** (przygotowanie do rozmowy):
Information about the company and its projects, and topics, especially technical ones, worth practising before a job interview.

**Application** (aplikacja):
A separate process of applying for a job in response to an offer, covering the recruitment stages, interviews, assignments, deadlines, contacts and notes; several ads of this offer do not create separate processes, but another attempt after the previous one has ended may be a new application.

**Employer technologies** (technologie pracodawcy):
The set of technologies linked to a company, distinguishing their links to individual job offers.

**AI assessment** (ocena AI):
A match recommendation in individual areas, covering the justification, strengths, gaps and unknowns; it is produced from the profile and the ads, separately from employer research and the owner's decision.

**Match component** (składowa dopasowania):
An assessment of one of the areas: technologies, experience, conditions or career direction.

**Overall rating** (rating łączny):
A match score on a 0–100 scale, calculated from the criteria that can be assessed, using explicit, configurable weights; it does not replace checking the must-have requirements, and when there is no basis for assessment it stays undetermined.

**Assessment completeness** (kompletność oceny):
A measure, separate from the rating, of the range of criteria that can be assessed from the available data; unknowns are not zero or guessed scores.

**Component justification** (uzasadnienie składowej):
The link between an area's assessment and the ad's requirements and the profile's information, distinguishing a confirmed match, a confirmed gap and an unknown.

**Career direction** (kierunek zawodowy):
How well a position fits the desired role, the technologies one wants to develop in and the kind of project, regardless of the skills already held.

**Owner's decision** (decyzja właściciela):
The owner's own assessment or choice about an offer, recorded independently of the AI recommendation.

**Publishing company** (firma publikująca):
The organisation that publishes the ad, which may be the employer or an intermediary running the recruitment.

**Employing company** (firma zatrudniająca):
The organisation with which the candidate is to sign the contract.

**Client** (klient):
The organisation for which the work is done, if it is separate from the employing company; its identity may be unknown.

## AI module

Terms used when other modules hand work to AI models or agents and when the owner oversees that work and its cost.

### Assignments and operations

**Requesting module** (moduł zlecający):
A module that hands work to the AI module by placing assignments, and that decides alone how to use their results in its own process.
_Avoid_: client (the glossary uses Client for an employer's customer), caller

**Assignment** (zlecenie AI):
One piece of work a requesting module hands to the AI module, with its type, its frozen input and settings and a label for the owner; the AI module carries it out through one or more operations and reports one final result.
_Avoid_: task, job, request, execution

**Assignment type** (typ zlecenia):
The kind of work an assignment asks for: a single answer, a batch of independent items or an agent session; the requesting module chooses it, and the way an executor carries it out stays hidden.

**Batch item** (pozycja partii):
One independent element of a batch assignment, such as one offer to assess, with its own result that is either correct or failed.

**Assignment label** (etykieta zlecenia):
A short description the requesting module gives the owner so the assignment can be recognised, e.g. which offer it assesses; the AI module shows it but never interprets it.

**Operation** (operacja):
One call to an executor made on behalf of an assignment; a retry is a new operation of the same assignment.
_Avoid_: attempt, execution, próba; do not use "operation" for the requesting module's own matter

**Executor** (wykonawca):
The external service or local runtime that performs an operation, such as OpenAI, Ollama or OpenCode.
_Avoid_: provider (when the runtime is meant), backend

### Assignment status

**Assignment status** (status zlecenia):
The state of an assignment as other modules see it: in progress, needs attention, succeeded, partially succeeded or failed.

**Needs attention** (wymaga uwagi):
A non-final status in which the AI module has stopped retrying an assignment and waits for the owner to retry, reject or approve it.
_Avoid_: failed (it is not final), stuck

**Partially succeeded** (zakończone częściowo):
The final status of a batch assignment that has at least one correct item and at least one failed item; the requesting module treats it as a success.

**Non-retryable failure** (błąd bez ponawiania):
An operation failure that, according to the executor's judgement, another operation would not fix, so the assignment needs the owner's attention instead of an automatic retry.

**Operation state** (stan operacji):
What happened to one call to an executor: pending, running, succeeded, failed or uncertain; it is separate from the assignment status and from the owner's intent.

**Uncertain operation** (operacja niepewna):
An operation whose outcome and cost cannot be established, e.g. the connection broke after the call was sent; it is never counted as free or as failed without cost.

### Owner's actions

**Retry** (Ponów):
The owner's decision to run one more operation of an assignment that needs attention, covering only what still has no correct result.
_Avoid_: rerun, new assignment

**Reject** (Odrzuć):
The owner's decision to end an assignment as failed, discarding any correct batch items.

**Approve** (Zatwierdź):
The owner's decision to end a batch assignment with at least one correct item as partially succeeded.

**Abandonment** (porzucenie):
The requesting module withdrawing its assignment; the assignment ends as failed and nothing is reported back to that module.

### Cost

**Potential cost** (koszt potencjalny):
The highest cost an operation may incur, held against the budget while the operation runs.
_Avoid_: estimate

**Actual cost** (koszt faktyczny):
The cost an operation really incurred, based on the executor's usage; when it cannot be established it stays unknown, never zero.

**Budget charge** (koszt obciążający budżet):
What an assignment takes from the budget: for each operation its actual cost when known, otherwise its potential cost.

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

**Ad sync** (synchronizacja ogłoszeń):
One execution of fetching ads from a source; its results may arrive in many portions.

**Complete source sync** (pełna synchronizacja źródła):
An ad sync that checked all ads in the set scope of a source, finished with no missing parts.

**Incomplete source sync** (niepełna synchronizacja źródła):
An ad sync that fetched only part of the set scope; the valid results stay available, and the absence of the other ads does not show that they are unavailable.

**Failed sync** (synchronizacja nieudana):
An ad sync that ended without fetching any ad; the availability of the source's ads does not change.

**Unfinished sync** (synchronizacja niezakończona):
An ad sync that is waiting to start or still fetching; a source has at most one at a time.

**Finished sync** (synchronizacja zakończona):
An ad sync that ended as complete, incomplete or failed.

**New ad of a sync** (nowe ogłoszenie synchronizacji):
An ad that the source showed for the first time in this sync.

**Changed ad of a sync** (zmienione ogłoszenie synchronizacji):
An ad already known from earlier syncs of the source whose content this sync saw in a new form.

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
A condition that limits the offers shown, independent of the fetch criteria and the match assessment.

**Offer triage** (triage ofert):
The stage of assessing fetched offers against professional preferences, covering the match assessment and its descriptive justification.

**Offer match** (dopasowanie oferty):
An assessment of how well an offer fits the professional profile, together with a justification.

**Employer research** (research pracodawcy):
Collected information about a company, its business, projects, conditions and working methods and its technologies, attached to the company profile and helping to assess an offer and prepare for recruitment.

**Company profile** (profil firmy):
A record of information about an organisation, its links and its offers, to which the employer research results are attached.

**Information source** (źródło informacji):
The origin of information, e.g. an ad, the company's website, own knowledge or a conversation with a recruiter.

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
The kind of work an assignment asks for: a single answer or an agent session; the requesting module chooses it, and the way an executor carries it out stays hidden.

**Assignment label** (etykieta zlecenia):
A short description the requesting module gives the owner so the assignment can be recognised, e.g. which offer it assesses; the AI module shows it but never interprets it.

**Operation** (operacja):
One call to an executor made on behalf of an assignment; a retry is a new operation of the same assignment.
_Avoid_: attempt, execution, próba; do not use "operation" for the requesting module's own matter

**Executor** (wykonawca):
A unit that performs operations, with its own configuration. It offers services for assignment types, such as a single request, a batch or an agent, and may use one or several providers to do so.
_Avoid_: provider, backend (a provider is what an executor uses, not the executor itself)

**Assignment time limit** (limit czasu zlecenia):
The time, counted from placing an assignment, after which an assignment that has not reached a final status fails. An operation already running is allowed to finish first.

**Maximum run time** (maksymalny czas działania):
The longest an operation may run on a given executor before it is treated as failed.

**Interrupted operation** (operacja przerwana):
An operation whose work stopped without an outcome, e.g. because the application stopped. It becomes uncertain.

**Result delivery** (dostawa wyniku):
The handover of an assignment's end, a result or a failure, to its requesting module through the module's result receiver, saved together with the assignment's final status; a result the requesting module does not take makes the assignment fail.

**Result receiver** (odbiorca wyniku):
The part of a requesting module that takes the end of its assignments from the AI module.

### Assignment status

**Assignment status** (status zlecenia):
The state of an assignment as other modules see it: in progress, needs attention, succeeded or failed.

**Needs attention** (wymaga uwagi):
A non-final status in which the AI module has stopped retrying an assignment and waits for the owner to retry or reject it.
_Avoid_: failed (it is not final), stuck

**Non-retryable failure** (błąd bez ponawiania):
An operation failure that, according to the executor's judgement, another operation would not fix, so the assignment needs the owner's attention instead of an automatic retry.

**Operation state** (stan operacji):
What happened to one call to an executor: pending, running, succeeded, failed or uncertain; it is separate from the assignment status and from the owner's intent.

**Uncertain operation** (operacja niepewna):
An operation whose outcome and cost cannot be established, e.g. the connection broke after the call was sent; it is never counted as free or as failed without cost.

### Owner's actions

**Retry** (Ponów):
The owner's decision to run one more operation of an assignment that needs attention.
_Avoid_: rerun, new assignment

**Reject** (Odrzuć):
The owner's decision to end an assignment as failed.

### Cost

**Potential cost** (koszt potencjalny):
The highest cost an operation may incur, held against the budget while the operation runs.
_Avoid_: estimate

**Actual cost** (koszt faktyczny):
The cost an operation really incurred, based on the executor's usage; when it cannot be established it stays unknown, never zero.

**Budget charge** (koszt obciążający budżet):
What an assignment takes from the budget: for each operation its actual cost when known, otherwise its potential cost.

**Monthly budget** (budżet miesięczny):
The amount that operations started in a calendar month may charge, shared by all requesting modules and executors.

**Default limit** (limit domyślny):
The amount a new month's budget starts with.

**Top-up** (doładowanie):
The owner raising the current month's budget; unspent money does not carry over to the next month.

**Price list** (cennik):
The prices and exchange rate an executor uses to calculate costs; an operation keeps those valid when it started.

### Put off

Terms of parts of the AI module that the first version does not have.

**Batch item** (pozycja partii):
One independent element of a batch assignment, such as one offer to assess, with its own result that is either correct or failed.

**Executor capacity** (limit operacji naraz):
The number of operations an executor may run at the same time.

**Partially succeeded** (zakończone częściowo):
The final status of a batch assignment that has at least one correct item and at least one failed item; the requesting module treats it as a success.

**Approve** (Zatwierdź):
The owner's decision to end a batch assignment with at least one correct item as partially succeeded.

**Abandonment** (porzucenie):
The requesting module withdrawing its assignment; the assignment ends as failed and nothing is reported back to that module.

**Settle** (Rozlicz):
The owner enters the actual cost of an operation whose cost was unknown, taken from the provider's billing.

## Technical terms

Terms for the mechanisms that carry out the system's work. They describe how work gets done, not what the owner sees or decides.

### Queues

**Queue** (kolejka):
A named line of queue jobs waiting for the worker.
_Avoid_: calling any other form of waiting a queue; treating a queue as a kind of work

**Worker** (worker):
The process that takes queue jobs and calls the handler registered for each.
_Avoid_: executor (an executor performs AI operations), runner (the runner implements bd tasks), scheduler

**Queue job** (zadanie kolejki):
One entry in a queue, made from a job definition, that tells the worker to take up one piece of background work identified by its id. It carries no content, status or result of that work.
_Avoid_: task, job (alone)

**Job definition** (definicja zadania kolejki):
A module's description of one kind of queue job: the name of its queue, the shape of the data the job carries, and whether it has a deduplication or an exclusivity key and what its value comes from.
_Avoid_: job class, job type, queue (a definition is not a queue)

**Queue configuration** (konfiguracja kolejek):
The editable file that gives the queue settings of each queue.

**Queue setting** (ustawienie kolejki):
A property of handling the jobs of one queue, written in the queue configuration, such as the highest number of attempts or the time limit of an attempt.
_Avoid_: job setting, option (the queue implementation's own parameters)

**Deduplication key** (klucz deduplikacji):
A value from a queue job's data such that a second job with the same value does not enter the queue while the first one waits or runs.

**Exclusivity key** (klucz wyłączności):
A value from a queue job's data such that jobs with the same value are not carried out at the same time.
_Avoid_: group, lock

**Job handler** (obsługa zadania):
The module's function that the worker calls for a queue job of a given definition.

**Failure handler** (obsługa niepowodzenia):
The module's function that the worker calls when a queue job has failed finally, also when its worker died during the last attempt.

**Failure queue** (kolejka nieudanych zadań):
The queue that receives a copy of each job of its queue that failed finally; the worker carries out such a copy by calling the failure handler.
_Avoid_: dead letter queue (the queue implementation's own name)

**Handler registry** (rejestr obsługi):
The list, by job definition name, of the handlers the worker may call.

**Process pool** (pula procesów):
The fixed number of processes in which the worker carries out queue jobs, one job per process at a time.

### Periodic work

**Periodic operation** (operacja okresowa):
A module's public operation that the periodic process calls in each pass, such as funding AI assignments that wait for budget.

**Periodic process** (proces okresowy):
The process that repeats a pass of periodic operations, 60 seconds after the previous pass ended. It is separate from the worker, which does no periodic work. It names the operations it calls itself; modules do not register them.
_Avoid_: worker, cron, scheduler; harmonogram alone (in Sources it means the plan of the daily ad sync)

### Assembly

**Application assembly** (składanie aplikacji):
The code that, when a process starts, calls every module's registration of its job handlers.
_Avoid_: bootstrap, wiring

**Module plugin** (wtyczka modułu):
A module's file in the plugins directory that registers the handlers of its queue jobs.
_Avoid_: Nitro plugin (a file in server/plugins that the web server loads by itself)

### AI module structure

**Executor submodule** (podmoduł wykonawcy):
The part of the AI module that defines what an executor offers: its services and the models and settings an assignment may ask for, with their prices.

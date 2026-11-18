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

**Offer sync** (synchronizacja ofert):
One execution of fetching ads from a source; its results may arrive in many portions.

**Complete source sync** (pełna synchronizacja źródła):
An offer sync that checked all ads in the set scope of a source, finished with no missing parts.

**Incomplete source sync** (niepełna synchronizacja źródła):
An offer sync that fetched only part of the set scope; the valid results stay available, and the absence of the other ads does not show that they are unavailable.

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

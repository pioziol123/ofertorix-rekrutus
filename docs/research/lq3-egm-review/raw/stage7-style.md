# Stage 7 - Style critique (Mode: REVIEW)

Scope: docs/specs/lq3-lista-aplikacji/PRD.md and requirements.md. Context: GLOSSARY.md (Application, Application stage).
Totals: 0 Blocker, 5 Major, 11 Nit.

## Blockers
None.

## Majors

### M1. "Application" means two things: the job application and the software
Files: PRD.md L12; requirements.md L5, A-AC04 (L46), T2-R01 (L72), T2-R08 (L79, title "One paging in the application").
- PRD L12: "lives outside the application". requirements L5: "Labels shown in the application". A-AC04: "After the application restarts". T2-R01: "The application has a page". T2-R08: "One paging in the application".
- The glossary defines Application as the process of applying for a job. These sentences mean the software, while neighbouring rows ("the application's stage", "an application belongs to one offer") mean the job application.
- A fresh reader cannot tell which is meant without parsing the sentence. Use "the system" or "the program" for the software, and keep "application" for the glossary term.

### M2. The same stage or state has several labels
Files: requirements.md T1-R01 (L55), T3-R03 (L108), A-R02 (L16), A-R04 (L18).
- "Zdjęta z listy" (A-R02, and A-R04 requires the field to use A-R02 labels) becomes "Zdjęte z listy" in the T3 filter.
- "No application" is "Poza listą" in the T1 stage field and "Bez aplikacji" in the T3 filter. "Poza listą" also reads almost like "Zdjęta z listy", and only the latter is a stage.
- "Poza listą" has no English gloss, unlike the four stage labels.
- Fix: one Polish label per stage and one for "no application", or state explicitly that the filter labels differ and why.

### M3. "Stage" and "Stages" mean two things in the PRD
Files: PRD.md L49-53 (section "Stages"), L21, L29.
- The "Stages" section lists delivery tasks 1-3. The rest of the document uses "stage" for the application stage.
- Items read "after 1 and after ... `oferty-pracy-nq3.1`" and "the stages after the CV is sent" (L37) sits next to them.
- Rename the section ("Delivery order" or "Tasks"). Refer to tasks by id (lq3.1) instead of "after 1".

### M4. Criteria claim more than the named check can verify
Files: requirements.md T1-R02 / T1-AC02 (L56, L61), T2-R10 / T2-AC09 (L81, L95), T1-R01 / T1-AC01 (L55, L60).
- T1-R02 and T2-R10 promise the new stage is shown "without reloading the page". The check is an "automated test of the routes on a running server", which cannot observe a page reload.
- T1-R01 says details show "no note, no history and no stage date". T1-AC01 verifies only "no note".
- Action CALIBRATE: either narrow the requirement wording to what the check proves (the route returns the new stage), or name a check that shows no reload (rendered-page or browser test). Extend T1-AC01 to history and stage date.

### M5. T3-AC05 tests a property no requirement states
Files: requirements.md T3-AC05 (L118), T3-R04 (L109).
- The criterion cites T3-R04, which says nothing about query counts. "0, 1 and 50 applications" and "database queries" are implementation detail inside a requirement table.
- Either add a requirement (for example, no per-offer reads) or move the check to the solution design.

## Nits

### N1. Dangling caveat in requirements.md L3
"... decided by the owner on 22-26 November 2026 unless marked otherwise." No rule is marked otherwise. DROP the clause. The same history repeats in PRD L7 ("shaped this scope in a conversation on 22-26 November 2026"); it is process history and decides no reader action. DROP.

### N2. Criteria table claim is false as written (L36)
"Each criterion is met by the task named in its last column." The last column is "How it is checked"; the task is the "T1."/"T2." at the end of the Criterion cell. Say "named at the end of the criterion". The criteria are also out of order (A-AC08 first, then AC01, AC06, AC07, AC02...). Sort them.

### N3. Unnamed "principle that nothing is lost"
PRD L36 and A-R09 (L28) call the note overwrite "a deliberate exception to the principle that nothing is lost" without naming or citing the principle. The only related rule is PRD L58 (stage changes are kept). Cite its source (system overview or glossary) or drop the reference. The sentence appears twice (PRD and A-R09), so one copy can go.

### N4. "At a glance" is unmeasurable (PRD L16)
"sees at a glance where each one stands" is subjective. Replace with the concrete behaviour, for example: Moja lista shows the stage label on each row. The Success section already measures this.

### N5. Redundant statements
- "No note in offer details" appears in PRD L26, A-R12 (L31), T1-R01 (L55) and T1-AC01. One owner (A-R12) plus a reference is enough.
- A-R12 says the same thing twice: "An offer without an application has no note; the owner writes a note only once the offer has an application".
- A-R03 justifies a rule inside the requirement ("once the CV is sent, giving up is 'Odrzucone'"); the example in the A-R03 preamble repeats the CV wysłane -> Do rozważenia bullet.

### N6. Dense multi-claim sentences
A-AC01 (L41) packs five checks into one criterion. T2-R06 (L77) packs five address rules in one cell. T2-AC05 (L91) combines paging, defaults and error cases. Split into one verifiable statement per row.

### N7. Term drift for the stage choice on Moja lista
T2-R03 is titled "Stage switch" and described as "a single choice"; T3-R03 calls the same kind of control a "filter"; PRD calls the control a "stage field" (L26) and A-R04 defines it as "one stage field". Pick "stage field" for the control that moves a stage, and "stage filter" for the controls that narrow a list.

### N8. "Wszystkie" does not mean all (T2-R03, L74)
The label "Wszystkie" is defined as "every stage except 'Zdjęta z listy'". The label promises more than the behaviour. Rename the label or state in the requirement that this is deliberate.

### N9. Vague tie-break (T2-R04, L75)
"Rows with the same moment keep one fixed order between reads." The order is not named, and T2-AC04 only checks that two reads agree. Name the secondary key (for example, the application id).

### N10. "Later save wins" is undefined (A-R11, L30)
"Later" is by what clock? Say "the save the system receives last".

### N11. Ambiguous "list" in T3-R03 (L108)
"a choice applies when the list closes" - the filter's dropdown list or the offer list? Say "when the choice list closes".

### N12. Evidence "Review of the change" (T2-AC07, L93)
A review is not an automated check and has no pass criterion. State what is reviewed (one shared component imported by both pages) or replace with a test.

### N13. "reuses" versus "works like" (PRD L53 vs T3-R03 L108)
PRD says T3 "reuses" the multi-choice filter of nq3.1; T3-R03 says it "works like" it. Align on what is shared (the component or only the behaviour).

### N14. Date-format tokens mix languages
"DD.MM.RRRR HH:mm" (T2-R02, T2-R11) mixes Polish RRRR with English HH:mm. Use one pattern notation, or give an example date.

### N15. Unverified claim about current state (PRD L41)
"Today each ad is its own offer" asserts the current build. Cite its source (system overview or module map), or phrase it as the assumption the risk depends on.

### N16. T2-R10 leaves the row outcome open
"the details and the row show the new stage" - after a move to "Zdjęta z listy", or out of the chosen "Aktywne" view, the row no longer belongs in the list. State whether it disappears or stays until reload.

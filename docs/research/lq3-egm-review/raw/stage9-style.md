# Stage 9 style critique: lq3 solution design and tickets export

Scope: `docs/specs/lq3-lista-aplikacji/solution-design.md` (SD), `docs/research/lq3-egm-review/tickets-export.md` (TE), context `GLOSSARY.md`; requirements.md consulted only to check label mapping.
Mode: REVIEW. Counts: Blocker 0, Major 5, Nit 8.

Mapping checked and consistent: stage values `to_consider`/`cv_sent`/`rejected`/`removed` map to "Do rozważenia"/"CV wysłane"/"Odrzucone"/"Zdjęta z listy" (SD l.34, l.38); "Poza listą", "Bez aplikacji" (= filter value `none`), "Moja lista", "Szczegóły aplikacji", "Otwórz ofertę", "Aktywne" appear identically in TE and requirements; "moduł Rekrutacje" = "Recruitments module"; "szuflada" = "drawer"; "stronicowanie" = "paging"; glossary "Application" and "Application stage" match SD use.

## 🟡 Major

### M1. "Stage choice" names two different things
- SD l.51 (`Applications page`: "stage choice `active` | `all` | ..."), l.65, l.67 ("a choice calls move application"), l.59.
- Requirements use "Stage choice" (A-R04) for picking a stage in the stage field and "Stage switch" (T2-R03) for the Moja lista filter. TE calls the first "pole etapu"/"wybór", the second "przełącznik" (T2-AC03).
- Rationale: an implementer reading "stage choice" in the Applications page contract can read it as the field's target stage. Use "stage switch" for the Moja lista filter and "stage field" for the per-application control, in SD too. Same word "choice" is also used for the multi-choice filter (l.59 "stage filter").

### M2. Operation names collide with page names
- SD l.50 "Application details" (operation) vs l.67 "Application details (drawer)" (page); l.51 "Applications page" (operation) vs "Moja lista" (page, l.66); l.59 "Offer list" operation vs l.68 "Offer list" page; l.46/57 "Create application" vs "Start application" for one path (D5, "first move").
- Rationale: "client: offer details and application details" (l.50) is ambiguous between operation and page. Name operations as verbs/reads ("Read application", "Read applications page", "Read offer list with stages") or always mark pages with the Polish page name. Pick one of create/start and say once that Start wraps Create.

### M3. "Moment", "date", "time" (chwila, data) used for one value
- TE A-AC01 "etap i chwilę", A-AC04 "ich daty", A-AC05 "ani daty", T2-AC02 "datę etapu"; SD "stage moment", `stage_changed_at`, "moment" (l.34-46), "the date of T2-R02" (l.69); requirements A-R05 "date".
- Rationale: stored value is a timestamp, shown as a date in the list and date+time in history. SD should define once: "stage moment" (stored) vs "stage date" (shown DD.MM.RRRR). Ticket A-AC01 "chwila" has no counterpart in requirements and is a vocabulary seam for the tester.

### M4. "List" is overloaded
- Epic title "Lista aplikacji", epic description "prywatną listę", "Moja lista" (page), "lista ofert" (offer catalogue), stage "Zdjęta z listy", "Poza listą"; SD title "Applications list", operation "Applications page", "Offer list".
- Rationale: "Zdjęta z listy" and "Poza listą" refer to the owner's list (Moja lista), not the offer list, but nothing says so, and the epic title "zapisywanie ofert" (saving offers) names the same act the SD calls "start application"/"first move". Add one sentence in SD Responsibilities: Moja lista = the owner's list of applications; the offer list = the catalogue. Neither "private list" nor "saving offers" is a glossary or SD term.

### M5. Uncalibrated or unverifiable claims
- SD l.28 "at most 10 000 ads (Observed in the Offers module)": no source or test is named. CALIBRATE: cite the constant/file, or say "limit set in <where>".
- SD l.19 (D3) "applications are far fewer than offers": subjective and unmeasured; the decision does not depend on it (one row per application is bounded by the catalogue anyway, l.79). DROP, or give the expected figure.
- SD l.47 "A conditional update needs no row lock": imprecise; an UPDATE takes a row lock for its duration. CALIBRATE: "needs no separate SELECT ... FOR UPDATE".
- SD l.3 "the contracts below are agreed constraints" with l.3 "names ... are illustrative": the sentence both binds and disclaims; say which names bind (stage values, l.38, already says it).

## 🟢 Nit

1. SD l.3 "walked with the owner", l.22 "Reason by the agent, accepted by the owner": informal; write "Decided with the owner on 26 November 2026" and "Reason: agent's proposal, accepted by the owner".
2. SD l.7 "browser-safe view entry", l.61 "view entry": jargon not defined in glossary or in this document; link the architecture rule or say "module file importable from browser code".
3. SD l.28 "Accepted costs": the section lists a design limit, not costs; "Accepted limits" is closer. Also "the offer list keeps filtering its whole catalogue in memory" is a current-behaviour claim with the same missing evidence as M5.
4. SD "offer" vs "ad": l.34 says `offer_id` is "today the ad ID"; l.7, l.58 use "offer" for the ad; glossary separates Source ad and Job offer. State once, near l.34, that until offers are grouped "offer" means one source ad (Risks l.98 says it late).
5. SD stage-change naming: table "Stage changes" (l.35), "history record" (l.46), "history of stages" (l.7, l.17), "history" (l.50). Use "stage change record" or one name throughout.
6. SD l.74-82 table: cells "Same answer", "Same answer for same state", "One row", "Reads committed state" repeat across rows without adding a decision; "Resource limit: One row" for Start/create is not a limit. Merge repeated cells or drop the column for read operations.
7. TE T3-AC02 "Zdjęte z listy" (filter label, plural, from requirements T3-R03) vs stage label "Zdjęta z listy" elsewhere. Mapping is correct in requirements, but SD l.38 says the view entry maps stage labels; it should state that the filter has its own plural label, or a test may match the wrong string.
8. TE wording: T2-AC02 "oznaczenie niedostępności" for the mark "Niedostępna w źródle", T2-AC03 "Zdjęta z listy nigdy", "komunikat A-R07"/"tekst T2-R07" cite IDs instead of text. Acceptable as a pointer, but the ticket alone does not give the tester the string. Also "widełki" (TE) vs "salary range" (requirements) vs "salary" (SD l.58, l.61): use "salary range" in SD.

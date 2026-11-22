# Stage 7 Critic Review (style): nq3 ad sync panel

Persona: egm-style (Style Goldfish). Mode: REVIEW. Scope: `docs/specs/nq3-panel-synchronizacji/PRD.md` and `requirements.md` (whole files). GoldfishContext: `GLOSSARY.md`. Read-only; no other file was changed.

Totals: 0 Blocker, 7 Major, 14 Nit.

## Major

### M1. Strip labels collide with state names and with a glossary term; PRD counts syncs where the requirement counts sources
- Files and lines: requirements.md L9, L40, L147-148, L158-161; PRD.md L28; GLOSSARY.md L187.
- Discrepancy:
  - T4-AC01 says that with two queued and one running sync, "W toku" shows 3. L9 and T1-R07 define "W toku" as the state of a running sync only; a queued sync is "W kolejce".
  - The strip label "Wymaga uwagi" (T4-AC02) is also the glossary term **Needs attention (wymaga uwagi)**: a non-final AI assignment status. The requirements never say it is a different meaning.
  - PRD L28 says the strip shows "the syncs needing attention". T4-R02 and T4-AC02 count enabled **sources**. AC02 shows 2 for three sources, two of which have several syncs.
  - T4-R01 to R03 give no label text. The labels appear only in the acceptance criteria.
- Rationale: one word is used for two quantities, so a tester cannot say whether 3 is correct. A reader who knows the glossary will read "Wymaga uwagi" as an AI-module status.
- Fix: put the label text in T4-R01 to R03; name the strip item for queued plus running something other than the state name "W toku" (or state that it deliberately combines both states); say in the Words section that "Wymaga uwagi" counts sources and differs from the AI-module term; change PRD L28 to "sources needing attention".

### M2. "Complete sync" has three names and "unfinished sync" has none
- Files and lines: requirements.md L9, L38, L82-83, L113, L110-111, L150-151; PRD.md L18, L42, L44-45, L58.
- Discrepancy:
  - L9 declares the glossary terms *complete source sync* and *incomplete source sync* and the Polish state labels Pełna, Niepełna and Nieudana. The body then uses "complete sync" (T2-R02, T4-R04), "incomplete or failed" (T2-R03), "Pełna" (T1-R05), and "Niepełna or Nieudana" (T4-R02, R05), sometimes within one table.
  - The document never says that Pełna equals complete source sync, or that Nieudana equals "failed". "Failed" is not a glossary term.
  - "Unfinished sync" carries the central rule of T3 (R01, R02, R04, AC01 to AC04) and PRD L42 and L58. Neither document defines it. It is implied to mean W kolejce plus W toku. "Finished sync" is defined only in passing, in the brackets of T1-R05.
- Rationale: the central one-unfinished-sync rule rests on an undefined word. The mix of English and Polish names for one concept invites different readings of AC checks.
- Fix: in the Words section add a mapping (Pełna = complete source sync, Niepełna = incomplete source sync, Nieudana = failed sync), define "finished" and "unfinished" by state, and use one name per concept.

### M3. "Marked unavailable" shows as "— niedostępne" in one place and "—" in another; details are unspecified before T2
- Files and lines: requirements.md L38, L59, L83-84, L94-95.
- Discrepancy:
  - T1-R05 and T1-AC04 give the row text "— niedostępne" for a source that infers unavailability, until T2.
  - T2-R03, T2-R04, T2-AC03 and T2-AC04 say the row and details show "—" (with a tooltip).
  - T2-R02 says the number replaces "— niedostępne".
  - T1-R13 (details) says nothing about what the details show for this number before T2, for a source that infers unavailability. It covers only the "nie dotyczy" case.
- Rationale: the literal strings are checked by a tester, and the two sets contradict each other. Is the dash alone, or the dash plus the word, the correct text after T2 for an incomplete sync?
- Fix: give one literal for the unknown-number state in the row and one for the details, and state it once in T1-R05 and T1-R13; let T2 refer to it.

### M4. "Infers unavailability" is a classifier with no named members; "Polish portals" is never listed
- Files and lines: requirements.md L38, L46, L75, L81-86, L119; PRD.md L11, L44.
- Discrepancy:
  - T1-R05, T1-R13, T2 and PRD L44 depend on whether a source "infers unavailability from the absence of an ad". T2 Scope puts "which sources infer unavailability" out of scope. Neither document names the sources, and neither says where the answer lives.
  - "The Polish portals" gets limits in T3-R03 and is a separate group in T3-R10 and T5-R04. It is never listed. The glossary has no entry for either term.
- Rationale: the T1 and T2 acceptance checks need a known set of sources. An acceptance check can be written only if the reader knows which sources fall in each group.
- Fix: name the sources or cite the place that owns the list (solution design or the module's map), in both documents. Define the term in the Words section.

### M5. T5-R05 adds a behaviour change that the PRD, the T5 scope and the T5 title do not mention; "never" outruns the check
- Files and lines: requirements.md L172-174, L184, L194; PRD.md L22-30, L36.
- Discrepancy:
  - T5-R05 forbids the offer list to reload by itself, "also while an AI assessment is waiting". That removes existing polling unrelated to sync information. PRD "What changes for the owner" (L30) says only that the list loses sync information and the import form. The PRD out-of-scope item 48 (L36) concerns the sync panel.
  - The T5 title and scope (L170-174) are "without sync information".
  - R05 says the list "never reloads by itself"; T5-AC03 checks only 30 seconds.
- Rationale: a reader of the PRD would not expect to lose AI-assessment refresh. A claim of "never" is backed by a 30-second observation.
- Fix: add the change to the PRD with its reason, widen the T5 scope and title, and align R05 with AC03 (either narrow the claim or lengthen the check).

### M6. "Changed" and "new" are defined by internal mechanics, not in domain terms
- Files and lines: requirements.md L39, L58.
- Discrepancy:
  - T1-R06 defines changed as "the number of new content versions the sync saved minus its new ads, never below zero". "Content version" is not in the glossary (the glossary has "Ad change history" and "Material ad change"). The formula assumes each new ad creates exactly one version, and the reader must take that on trust.
  - It is unclear whether "changed" counts any content change or only a material ad change as the glossary defines it.
  - "New" is "ads ... that this source had shown in no earlier sync". "Shown" differs from "found" in T1-R05 and T1-R13, "saw" in T1-R13, and "fetched" in T1-R14.
- Rationale: the owner-facing meaning of "zmienione" is not stated. T1-AC03 tests a formula, not a meaning.
- Fix: state what the owner reads (ads that existed before and whose content differed), link to the glossary term if intended, keep the computation in the solution design, and use one verb ("found") for what a sync does with an ad.

### M7. T2-R05 handles ads that return while the T2 scope puts them out
- Files and lines: requirements.md L75, L85.
- Discrepancy: T2 Scope says "Out of scope: ... ads that become available again". T2-R05 ("Ads that return") is a requirement about an ad marked unavailable that reappears: it is not counted separately and is not new.
- Rationale: an implementer cannot tell whether the return of an ad (clearing its unavailable status) is in the task. R05 also repeats what T1-R06 already implies, since "new" is defined as never shown before.
- Fix: say in the scope that clearing the status is out of scope and R05 only fixes the counts, or drop R05 and cite T1-R06 in the scope.

## Nit

### N1. Polish plural forms are not specified; the criteria contradict each other
- requirements.md L38, L92-93, L115, L130. T2-AC01 expects "2 niedostępne", T2-AC02 "0 niedostępnych"; T1-R05 gives "+N nowe", "N zmienione"; T3-R06 gives "synchronizacji N źródeł" and T3-AC06 tests N = 1, which reads "1 źródeł". Polish forms differ for 1, 2 to 4 and 5 or more. No requirement states the rule. Severity could rise to Major if the checker compares literal strings. Fix: state the plural rule or avoid the number in a sentence ("Liczba źródeł, których nie zlecono: 1").

### N2. PRD states a broader fact than the requirement
- PRD.md L28 versus requirements.md L112, L119. PRD: "Every source searches one fixed scope, PHP · senior". T3-R03 limits this to syncs "requested from the panel", and T3-R10 keeps other ways of starting. CALIBRATE: "Every sync requested from the panel...".

### N3. PRD out-of-scope list omits item 36 that T4 cites
- PRD.md L35-38 versus requirements.md L141. T4 scope cites "collection task item 36" (sources that can never be synced completely). The PRD lists items 37 to 46 and 48, not 36 or 47. The bare numbers (37 to 42 in parentheses) are opaque without the collection task open. Add item 36 or explain that it is out of scope for the PRD too; name each item in a few words (the PRD does so for most).

### N4. Unverified claims about existing behaviour
- PRD.md L11-12, L58. "Start only from the command line", "shows only the latest sync of some sources", "The Sources module already offers one way of requesting a sync of any source and keeps a source at one unfinished sync". None cites evidence. T3-AC04 tests the second claim, so it is partly covered. CALIBRATE: cite the module's operation or the solution design, or mark them as verified in the solution design.

### N5. Vague quantity and verbs in goals and success
- PRD.md L18 ("for days"; the threshold is 3 days, L29), L45 ("pointed out"), L46 ("holds no sync information"; "sync information" is defined only by T5). Replace with "for 3 days or more", "listed in the warning" and a pointer to T5.

### N6. Subjective wording in the problem statement
- PRD.md L13 ("crowds", "the offers the owner came to read"). Say what sits above the offers and how many pieces; drop the evaluation.

### N7. Word "import" for sync
- PRD.md L11, L30; requirements.md L180-183. The glossary term is "Ad sync". "Import" survives in quotes of existing UI strings, which is acceptable, but also in prose ("import form", "import buttons"). Use "sync" in prose and keep "import" only inside quotes.

### N8. PRD paraphrases the glossary term
- PRD.md L3: "an ad sync is one fetch of ads from a source". The glossary says "One execution of fetching ads from a source; its results may arrive in many portions." Quote the glossary or link only.

### N9. Mixed date formats and an opaque ID prefix
- PRD.md L7, L33 ("21 and 22 November 2026") versus requirements.md L7 and later ("2026-11-22"). Pick one. The prefix `PS-AC` (L17) is never explained.

### N10. "Kept" labels not defined; duplicate requirements
- requirements.md L86 (T2-R06), L119 (T3-R10), L185-186 (T5-R06, R07). "Kept" is a label for "existing behaviour that stays" but is not in the Words section. T5-R07 repeats T3-R10; T2-R03 repeats the first clause of T2-R06; T4-R08 "disabled sources are never counted" repeats "enabled" in T4-R02, R04 and R05. DROP the duplicates or cite the first occurrence.

### N11. "Before this task" as a time reference
- requirements.md L38, L58, L84. "Syncs from before this task" and "date the task was deployed" tie meaning to a Beads task. The glossary marks "task" as an avoided word in other contexts. Name the date source (a stored deployment date or constant) and use "before the change is deployed".

### N12. Unclear or loose phrases in requirements
- L40 "an arrow (not moving)" (say "a static arrow"); L46 "the last reads" (say "the fourth number"); L48 "stored error message and diagnostics as stored" (repeated "stored"; "diagnostics" is undefined); L50 "unreadable trigger" (say "unrecognised"); L114 "and so is a source the catalogue does not know; neither shows an error" (unclear antecedent); L111 "the reason it is disabled" (name where it comes from); L7 "**Sources.**" label clashes with the Sources module and with "source" as an ad source (say "Citations").

### N13. Acceptance criteria without a literal
- T1-AC09 and T1-R11 ("the page says so", L64) give no text, unlike every other message. T5-AC02 "is refused" (L193) gives no response. T4-AC01 and others use "Automated test of the read" ("read" as a noun is jargon; say "query"). T5-R02 quotes "Ostatni import był niepełny…" with an ellipsis, so the string cannot be matched.

### N14. Dependence on an untracked prototype for literal texts
- requirements.md L7, L40. The five tooltip texts of T1-R07 are delegated to the mock-up ("the texts are those of the mock-up"). `docs/prototypes/synchronizacje/` is untracked in git at the time of review, and the requirements call the mock-up evidence of wording. Quote the five texts in the requirement, or commit the prototype before relying on it as evidence.

## Notes on what was checked

- No hyperbole or marketing language found in the requirements; tone is dry and direct. Most findings are about terminology and literals, not fluff.
- Defensive-caveat vector: no blanket disclaimers found. The only uncalibrated claims are N4 (CALIBRATE) and the "never" in M5 (CALIBRATE).
- Glossary terms used consistently: "ad sync", "source ad" (as "ad"), "ad unavailable at the source", "incomplete source sync". Inconsistent: see M1, M2, M6.

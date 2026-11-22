# Reviewer prompts

Fill the placeholders. `<TARGET>` lists the specification set and the ticket export:

```
- <SPEC>/PRD.md (product part)
- <SPEC>/requirements.md (requirements and acceptance criteria per task)
- <SPEC>/solution-design.md (implementation part)
- <OUT>/tickets-export.md (epic and its bd tickets, in Polish)
```

Every prompt starts with this preamble:

```
You are a Goldfish reviewer in the Elephant-Goldfish Model (EGM) review protocol. You have no earlier conversation; judge only what the documents and sources say.

EGM plugin root: <EGM>
```

Every prompt ends with:

```
Rules: read-only. Do not edit any file except your report. No bd or git writes; do not run migrations or the app.
Write your report to <OUT>/raw/<file>. Each finding: severity (🔴 Blocker, 🟡 Major, 🟢 Nit), file and lines (or ticket id), the discrepancy, the rationale.
Return a short summary: count per severity and the titles of blockers and majors.
```

`<CONTEXT>` is the goldfish context list from step 1.5. Persona files are in `<EGM>/agents/`, standards in `<EGM>/resources/document_standards/`.

| Stage | Persona file | Standard | Reads | Report file |
| --- | --- | --- | --- | --- |
| 5 zoom-out | `zoom_out.md` | `zoom-out-standard.md` | `<TARGET>` + `<CONTEXT>` | `stage5-zoom-out.md` |
| 5 catalyst | `inventive_catalyst.md` | `zoom-out-standard.md` where the persona calls for it | `<TARGET>` + `<CONTEXT>`; add "the owner aims for an MVP and wants a simple design; weigh any simpler alternative highly" | `stage5-inventive-catalyst.md` |
| 6 comprehension | `comprehension.md` | none | ONLY PRD, requirements (FeatureRange) and design, tickets (DetailedRange); no glossary, code or linked files; follow the persona's two paraphrase headings and write them first | `stage6-comprehension.md` |
| 7 design | `design_critic.md` | `feature-spec-standard.md` | PRD and requirements only (the design and tickets only for intent) + glossary, architecture rules, linked prototype; add "a PRD holds product intent only; requirements hold testable rules and acceptance criteria; mechanics belong in the solution design; the owner targets an MVP" | `stage7-design.md` |
| 7 structural | `structural.md` | `feature-spec-standard.md` | PRD and requirements + glossary, architecture rules, `docs/agents/implementation-workflow.md`, an earlier spec set for layout comparison (for example `docs/specs/sq2-zlecenia-ai/`) | `stage7-structural.md` |
| 7 style | `style.md` | none | PRD and requirements + `GLOSSARY.md` | `stage7-style.md` |
| 8 intermediate zoom-out | `zoom_out.md` | `zoom-out-standard.md` | `<TARGET>`; first read the six earlier reports in `<OUT>/raw/`; "do not repeat their findings; add only what is new or what they reveal together (patterns, root causes, contradictions between findings, decisions the owner must take, findings that are wrong or overstated when checked against the documents and code)" | `stage8-intermediate-zoom-out.md` |
| 9 readiness | `implementation_readiness.md` | `implementation-readiness-standard.md` | design + tickets (DetailedRange); context: PRD, requirements, `docs/agents/implementation-workflow.md` (the readiness checklist for tickets handed to an unattended runner), glossary, architecture rules; may read code | `stage9-implementation-readiness.md` |
| 9 codebase | `codebase_details.md` | `implementation-readiness-standard.md` | design + tickets; check every claim about existing code, modules, tables, queues, files, functions and pages against the repository, and verify facts marked "Observed"; report each finding with the code location it conflicts with | `stage9-codebase-details.md` |
| 9 style | `style.md` | none | design + tickets + `GLOSSARY.md`; check that Polish ticket terms map consistently to the English document terms | `stage9-style.md` |

Prompt body for a row: preamble; "First read your persona file `<EGM>/agents/<persona>`. Follow its mandates and output format. Apply the standard `<EGM>/resources/document_standards/<standard>`" (leave the sentence out when there is none); "Stage: <stage name>, on <reads>"; the context list; the ending.

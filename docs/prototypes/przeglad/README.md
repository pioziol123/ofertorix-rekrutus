# Offer and company overview prototype

A throwaway mock-up for the decision "Overview of offers and companies and handling of process stages" (`bd show oferty-pracy-v4t.8`). It is not a product implementation. Standalone HTML/CSS/JS lets you assess the flow without installing the application; the target stack remains Nuxt + Nuxt UI.

Open `index.html` in a browser or run from the repository directory:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs/prototypes/przeglad
```

Address: http://127.0.0.1:8765/?variant=A

Three layouts on one page, switched with the bottom bar or the keyboard arrows:

- A — a table for triage with an offer details panel.
- B — a board of stages with the offer and company context below.
- C — a list of companies, the profile and technologies, and that company's offers.

Check the path offer → company → another offer, the distinction between the rating, completeness and your own decision, saving a note/stage, the assessment history and the simulation of basic/deep research. A missing salary range and an undisclosed client must be visible without automatic rejection.

The data and evidence are fictional. There is no API, no AI calls, no persistent storage, no full filters, no editing of contacts/dates and no actual offer merging. The numbers are illustrative; this is not a prototype of the rating algorithm. Refreshing resets the state. The bottom switcher and the state preview belong only to the mock-up; the file is not included in any product build.

The owner accepted A as the direction for browsing offers and C as the company view, and deferred B beyond the first version. Recruitment management stays in the offer details. Variant B was kept only as comparison material. The resolution was recorded in Beads; accepting the layout does not mean all functions and rules were verified. In line with the repository policy, no commit or archiving on a branch was made; the code remains local material for assessment, outside the existing product code (which does not exist yet).

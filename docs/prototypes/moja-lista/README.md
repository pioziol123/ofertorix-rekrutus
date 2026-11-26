# Moja lista prototype

A throwaway mock-up of the page "Moja lista" and its application details (epic `oferty-pracy-lq3`, task `oferty-pracy-lq3.2`), modelled on the [sync panel mock-up](../synchronizacje/README.md). It is evidence of layout and wording, not product code: no API, no persistence. Where it differs from the [requirements](../../specs/lq3-lista-aplikacji/requirements.md), the requirements win.

## How to open it

```sh
python3 -m http.server 8767 --bind 127.0.0.1 --directory docs/prototypes/moja-lista
```

Address: http://127.0.0.1:8767/. The address keeps `stage`, `page`, `size` and `offer` (the open details). Data is fictional (47 applications); reloading resets every change.

## What it shows

- A stage switch (Aktywne by default, Wszystkie, Do rozważenia, CV wysłane, Odrzucone); "Zdjęta z listy" never appears as a row.
- A table, not grouped by day: title, company, "Niedostępna w źródle", the stage with its icon, "Ostatnia zmiana etapu" as a date; newest change first.
- The paging of the sync panel: "Poprzednia / Strona X z Y / Następna", a page list filtered by typed digits, 10/20/50/100 per page.
- A drawer with the salary range, the stage field listing only allowed transitions, the note with a "N / 10 000" counter and "Zapisz notatkę", "Historia etapów" with date and time, and "Otwórz ofertę". Escape or a click outside closes it.

Decided by the owner on 2026-11-26 with this mock-up: no grouping by day, one icon and colour per stage everywhere, the note counter (requirement T2-R13).

Icons in the mock-up are placeholders (emoji); the product uses the icon set of the application.

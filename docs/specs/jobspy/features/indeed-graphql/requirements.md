# Import Indeed przez GraphQL — wymagania

Status: zakres do realizacji, 2026-11-03. [PRD](../../PRD.md), [projekt](solution-design.md). Właściciel zlecił uruchomienie importu po udanej ograniczonej próbie GraphQL. Dotychczasowy [projekt HTML](../scraper-html-indeed/requirements.md) pozostaje historycznym opisem osobnego adaptera; jego wybór jako transportu runnera zostaje zastąpiony dla tego zakresu.

- R-G01: ręczny import Indeed pobiera polskie oferty dla zapytania Senior PHP i zapisuje poprawne ogłoszenia z ich źródłem i opisami. Test całego przepływu potwierdza zapis oraz widoczność w aplikacji.
- R-G02: zapytanie nie potwierdza kwalifikacji PHP lub seniority. Nieznane informacje nie są uznawane za niespełnione kryteria; ograniczone lub częściowe wyniki są tak oznaczane. Brak ogłoszenia nie powoduje jego wygaśnięcia.
- R-G03: wspólny limit Indeed i LinkedIn obejmuje każde żądanie, również ponowienia, i wynosi maksymalnie jedno żądanie na sekundę. Błędy i blokady nie są prezentowane jako udany pusty wynik.
- R-G04: obecne źródła i historia pozostają dostępne; zmiana sposobu pobierania tworzy odrębny fingerprint. Brak automatycznego harmonogramu. Testy offline weryfikują wybór adaptera, kontrakt, ograniczenia i błędy; ograniczony import live potwierdza integrację z kolejką i bazą.

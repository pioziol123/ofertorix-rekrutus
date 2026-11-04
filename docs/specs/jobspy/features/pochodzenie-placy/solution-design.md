# Pochodzenie płacy Indeed — solution design

Status: projekt wybranej funkcjonalności, 2026-11-02. Podstawa: [requirements R-P01–R-P05](requirements.md), baza JobSpy `68b88d6909a2342ad75fbb945c4204a3a7ed6665`. Kod znajduje się w osobnym lokalnym repo `.local/JobSpy`; poniższe ścieżki są względem niego.

## Podejście

Rozszerzamy `Compensation` i `JobPost` w `jobspy/model.py` o dwa pola. `get_compensation` w `jobspy/indeed/util.py` określa pochodzenie w miejscu wyboru kwoty. Istniejące `_process_job` przenosi je przez rozpakowanie `model_dump()`, bez przebudowy adaptera i interfejsu `scrape_jobs`. Nie dodajemy wywołań sieciowych.

## Kontrakt dodatku

| Pole | Wartość i semantyka |
| --- | --- |
| `salary_origin` | Literal `employer`, `portal_estimate`, `unknown`; domyślnie `unknown`, nigdy null. Opisuje wybraną kwotę, nie samą obecność surowych danych. Bez wyodrębnionej kwoty: `unknown`. |
| `salary_evidence` | Obiekt JSON lub null; kopia znormalizowanej przez model części compensation: `baseSalary`, `currencyCode`, `estimated`. Zachowuje oba źródła, także nieobsługiwany okres. To dane po walidacji JobSpy, nie pełna surowa odpowiedź HTTP. Same puste pola nie tworzą dowodu. |

`salary_source` pozostaje dotychczasowym polem sposobu ekstrakcji (`direct_data`/`description`). Jego `direct_data` nie potwierdza pracodawcy. Dotychczasowy serializer stosował prawdziwość liczby do wykrywania płacy; zmieniamy ten warunek na sprawdzenie null, aby nie traktował zera jako braku (R-P02).

`salary_evidence` jest zwykłym obiektem JSON, nie zagnieżdżonym modelem pozostawionym w DataFrame. Istniejący serializer zachowuje słowniki; pełny eksport JSON ma zachować strukturę. Dawne płaskie pola i wybór podstawowej kwoty nie zmieniają się, poza poprawnym traktowaniem zera. Dodanie kolumn jest świadomą zmianą dodatnią; klienci wymagający dokładnej starej listy kolumn powinni jawnie wybrać stare pola.

Annualizacja działa na kopii płaskich kwot; dowód nie podlega przeliczeniu. Brak rozpoznanego okresu skutkuje pustymi wyliczonymi kwotami i `unknown`, z zachowaniem źródłowego dowodu. Nie przechodzimy wtedy po cichu na inny rodzaj wynagrodzenia.

## Weryfikacja i wydanie

Tester przygotuje testy standardowego `unittest`: jednostkowe wyboru i dowodu (R-P01–P03), adaptera oraz pełnej drogi przez `scrape_jobs`/eksport i annualizację (R-P04), z zablokowaną siecią (R-P05). Ruff i mypy obejmą kod. CI uruchomi testy offline w macierzy wspieranych Pythonów. Nie wymagamy migracji Postgresa ani uruchomienia importera aplikacji.

Wyniki testów i status utrzymujemy w Beads `oferty-pracy-y81`. Ta para dokumentuje konkretną zmianę, a kolejne funkcjonalności otrzymają osobne pary. Wydanie/podpięcie aplikacji będzie późniejszym krokiem; nie publikujemy zmian automatycznie.

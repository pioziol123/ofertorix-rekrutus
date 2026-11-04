# Himalayas — wynik pilota

2026-11-03, Beads `oferty-pracy-y81.16`. Zakres: [wymagania](requirements.md), [rozwiązanie](solution-design.md).

## Wynik rzeczywistego importu

Przebieg `90e05fc4-538a-4dc3-bf29-5fe08d0f54f5`: **complete**, 3 strony, 54 unikalne zapisane ogłoszenia źródłowe i 54 pierwsze rewizje. Parametry `q=PHP`, `country=PL`, `seniority=Senior`, `sort=recent`. Zero odrzuconych rekordów, duplikatów i braków opisu. W chwili sprawdzenia żadne z tych ogłoszeń nie przekroczyło daty ważności. Wcześniejszy pojedynczy odczyt rozpoznawczy pierwszej strony nie zapisywał ofert. Nie uruchomiono AI.

Complete oznacza zakończenie paginacji tego zapytania przy stabilnym liczniku, nie pełne pokrycie rynku. W diagnostyce pozostaje `marketComplete=false`.

## Jakość i ograniczenia

**15 z 54 tytułów zawiera samodzielne słowo PHP**. To prosty licznik jakości, nie wynik kwalifikacji. Pierwszy odczyt rozpoznawczy pokazał np. Senior UI & UX Designer, którego opis wymieniał PHP w sekcji innych rekrutacji. Wyszukiwarka nie potwierdza więc specjalizacji. Wszystkie wyniki zachowują oznaczenie niepotwierdzonej kwalifikacji PHP/senior. Nie utożsamiać 54 zapisanych ogłoszeń z 54 dopasowanymi ofertami.

Zachowano pełne opisy, ograniczenia krajów/stref, surowe dane i oryginalne `applicationLink`. `pubDate` zapisuje się jako aktualizacja źródła, a pole publikacji pozostaje null. Nie wykonano automatycznego łączenia z innymi źródłami ani oceny dodatkowości względem SOLID.Jobs. Weryfikacja faktycznej roli, warunków pracy z Polski i podobieństwa między portalami pozostaje do dalszej kwalifikacji (`oferty-pracy-y81.10`).

## Weryfikacja aplikacji

API listy HTTP 200 zwraca nowe rekordy ze źródłem Himalayas, niezmienionym linkiem, niewiadomymi kwalifikacji i publikacją null. Wyrenderowana lista oraz szczegóły przykładowej oferty Senior PHP Developer potwierdzają widoczną atrybucję, przycisk „Otwórz w Himalayas” i ostrzeżenie o kwalifikacji. Nie odpytywano stron HTML Himalayas; sprawdzenie widoku korzystało z lokalnej aplikacji.

Osobny tester przygotował 18 testów adaptera i 13 integracyjnych w izolowanym schemacie PostgreSQL. Końcowa weryfikacja rodzica: **102/102 testy** (Himalayas, zapis, projekcja ofert i JobSpy), ESLint zmienionych plików, formatowanie kodu i pełny `pnpm typecheck` przeszły. Testy sprawdzają brak retry po 403/429, błędne URL, limit rozmiaru/czasu/stron, częściowy zapis, rollback strony, brak wygaszania niewidzianych rekordów, idempotencję, rewizje i blokadę równoległych importów.

## Dalsze wykorzystanie

Ręczny importer: `docker compose exec -T worker pnpm himalayas:sync`. Nie ma harmonogramu ani automatycznej pętli ponowień. Kolejkę, status w UI i sprawdzanie aktualności 200/410/404 śledzi `oferty-pracy-y81.17`. Zmiany pozostają lokalne, bez commit/push.

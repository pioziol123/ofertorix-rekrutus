# Profil zawodowy i kryteria — projekt rozwiązania

Status: **część lokalna i AI uruchomione; kontrolowana próba dostawcy zakończona powodzeniem**, 2026-11-01. Uzasadnienie: [R-01/AC-01 i R-02/AC-02](requirements.md) → [PRD](../../PRD.md). Potwierdzone są opisane w wymaganiach decyzje właściciela. Poniżej rozwiązanie techniczne bieżącego profilu. Próbę prawdziwego API wykonano na fikcyjnym CV; testy automatyczne używają kontrolnych odpowiedzi transportu. Dowód lokalnego eksperymentu: [ekstrakcja CV](../../../../research/profil-import-spike/README.md). Wynik próby dostawcy zapisano w Beads `oferty-pracy-88x`.

## Zakres i istniejący kod

Działa Nuxt 4.6.3, Nuxt UI, Node 24.15.0, PostgreSQL i oddzielny worker pg-boss. Moduł profilu dodaje stronę `/profile`, własne API i migrację; zachowuje importer, listę oraz brak logowania. Dostęp lokalny przez loopback, przyszły VPS przez tunel SSH. Zakres pobierania PHP Senior pozostaje w istniejących `source_scopes`; profil nie tworzy drugiej kopii tej konfiguracji.

Ten etap obejmuje ręczny profil, CV PDF/DOCX/tekst, propozycję danych zawodowych, szkic, porównanie ponownego importu, zatwierdzanie i historię wersji. Oceny ofert i research pozostają późniejszymi modułami. Zatwierdzenie nie zleca obecnie ocen; przyszły triage otrzyma jawne `profile_version_id`.

## Przepływ i granice danych

1. Właściciel może zacząć ręcznie albo dodać CV. Upload zapisuje oryginał i trwały rekord importu; worker odczytuje tekst lokalnie.
2. Po odczycie widać tekst źródłowy i ewentualny problem kolejności/kompletności. Pusty wynik, hasło lub błąd parsera proponują wklejenie tekstu. Oryginał pozostaje dostępny do pobrania.
3. Przygotowanie propozycji AI używa wyłącznie wydzielonego tekstu zawodowego. Właściciel widzi i może poprawić tekst do analizy; dane kontaktowe usuwa lokalny etap przygotowania. Nierozstrzygnięty fragment można pominąć i dopisać ręcznie. Sam upload nie wysyła pliku ani całego surowego CV do usługi.
4. Wynik stanowi propozycję umiejętności/doświadczenia z dowodami. Właściciel przegląda ją i poprawia. AI nie tworzy oczekiwań płacowych ani preferencji z poprzednich prac.
5. Oczekiwania są uzupełniane osobno. Szkic można zapisać i kontynuować; zatwierdzenie pokazuje podsumowanie i tworzy aktywną wersję.

Brak klucza/modelu/cennika lub środków blokuje wyłącznie przygotowanie AI, z jawnym stanem. Lokalny odczyt, pobranie CV i ręczny formularz nadal działają. To nie zastępuje wymaganego importu AI ręczną ekstrakcją udającą gotowy wynik.

## Model formularza

Wersja dokumentu danych ma `schemaVersion: 1`. Formularz obejmuje doświadczenie, umiejętności, kierunek oraz oczekiwania i wykluczenia. Dane kontaktowe nie są częścią kontraktu profilu do oceniania. Puste kolekcje danych zawodowych oznaczają brak zapisanych danych, nie dowód braku umiejętności.

- Doświadczenie/projekt: stabilne UUID, rola, opcjonalna firma/nazwa projektu, okres z dokładnością miesiąca lub roku, opis odpowiedzialności i osiągnięć, powiązania technologii. Nieznany początek/koniec pozostaje null; obecna praca ma jawne `ongoing`.
- Umiejętność: UUID, nazwa, nullable poziom `basic/intermediate/advanced/expert`, przybliżony czas `{amount: decimal-string, unit: months|years}`, ostatnie użycie `unknown/current/date` z dokładnością roku/miesiąca i opis zastosowania. Brak poziomu nie jest `basic`, brak stażu nie jest zerem. Nie sumujemy automatycznie nakładających się projektów. Lista poziomów jest decyzją prezentacyjną tego SD; każda wartość poza nazwą jest opcjonalna.
- Kierunek: role/seniority, technologie do rozwijania, typ firmy/projektu i opis celów. Nie oznacza posiadania tych kompetencji.
- Oczekiwanie: `unknown` (bez odpowiedzi), `no_preference` (jawna obojętność) albo `specified` z wartością oraz `importance: required|preferred`. Wykluczenia są osobnymi jawnymi kryteriami, nie synonimem pominięcia odpowiedzi.
- Płaca: **jedno minimum dla jednego kontraktu**. Wpisana kwota wymaga `contractType`, `currency`, `period`, `basis` oraz dokładnego decimal-string minimum >= 0. Waluta ISO z listy obsługiwanej formularzem, okres Month/Year/Day/Hour/Fixed, podstawa gross/net/net_plus_vat. Nie konwertujemy podstaw/okresów/walut. Zmiana kontraktu wymaga przeglądu podstawy kwoty; formularz nie przenosi automatycznie B2B netto do UoP brutto. Unknown/no_preference nie wymaga sztucznej kwoty ani kontraktu.

Pozostałe ustalone warunki: lokalizacja i możliwość pracy z Polski, remote/hybrid/office i dni biurowe, wymiar pracy, języki, strefa/godziny wspólne/dyżury. Pola mają typowany stan i ważność, a wartość warunku jest na tym etapie opisowym tekstem. Przyszłe dopasowanie wymaga jawnej normalizacji tych opisów; nie może zgadywać twardych kryteriów. Płaca ma osobne typowane pola. Wymagania konieczne i wykluczenia będą później widoczne osobno od ratingu.

## Zapis, wersje i porównanie

| Tabela | Kontrakt |
| --- | --- |
| profile_head | Jeden rekord, `active_version_id` nullable; wskaźnik tylko do zatwierdzonej wersji. |
| profile_drafts | Jeden bieżący szkic: UUID, rewizja, bazowa aktywna wersja, JSONB schemaVersion=1, aktualizacja. Zapis nie aktywuje danych. |
| profile_versions | UUID, sekwencyjny numer, czas zatwierdzenia, pełny JSONB danych, importy źródłowe i pochodzenie pól. Snapshot niemodyfikowalny. |
| profile_imports | UUID, rodzaj file/text, metadane oryginału i hash, status, tekst lokalny, wybrany tekst zawodowy z rewizją, propozycja i metadane parsera/modelu/promptu. |

Pochodzenie faktu: manual albo import_id wraz z fragmentem dowodu z konkretnej rewizji tekstu. Zmiana ręczna ma pierwszeństwo dopiero po wyborze właściciela; nie zakładamy, że późniejszy import jest prawdziwszy. Wersja może łączyć dane z kilku importów, dlatego powiązanie nie ogranicza się do jednego pliku.

Przy ponownym imporcie nowa propozycja jest porównywana z aktualnym szkicem lub aktywną wersją. Widać dodane/zmienione pola; właściciel wybiera zmiany. Pole pominięte przez AI nie usuwa poprzedniej wartości. Dopasowanie elementów po nazwach to sugestia, nie automatyczne łączenie dwóch miejsc pracy czy technologii. Ręczne oczekiwania nie znajdują się w wejściu ani wyniku tej mutacji.

Pusty stan ma rewizję 0; pierwszy zapis tworzy szkic z rewizją 1. Zapis szkicu wymaga expectedRevision. Zatwierdzenie wymaga expectedRevision szkicu i expectedActiveVersionId; transakcja blokuje head, waliduje bazę, zapisuje snapshot i aktualizuje head. Rozbieżność daje 409 z aktualnym numerem, zachowując lokalny tekst formularza. Niedozwolone pola/typy dają 422. Wszystkie pytania można pominąć; niewiadome nie blokują zatwierdzenia. Podwójne zatwierdzenie tego samego szkicu nie tworzy dwóch wersji: opiera się na unikalnym identyfikatorze komendy i zwraca poprzedni rezultat.

## Oryginał CV i lokalny parser

Osobny nazwany wolumen `documents` montowany w WWW i workerze pod `/data/documents`; nie jest częścią public/, kodu, obrazu ani node_modules. Nazwa na dysku jest nadana przez serwer (UUID). Pobranie po id importu, z Content-Disposition attachment i bezpieczną nazwą; nazwa dostarczona przez użytkownika nie steruje ścieżką. Zewnętrzny backup obejmuje bazę oraz ten wolumen, bez implementowania backupów w aplikacji.

Limit początkowy: jeden PDF/DOCX do 10 MiB, PDF do 30 stron, odczyt/wklejenie do 120000 znaków. Limity dotyczą tej implementacji, są walidowane przed płatną pracą. Przekroczenie pokazuje przyczynę i możliwość ręcznego uzupełnienia/krótszego tekstu, bez cichego obcinania. HTTP przyjmuje binarne body do 10 MiB, bez multipart; 413 przy przekroczeniu, 415 dla nieobsługiwanego formatu. Weryfikujemy strukturę formatu, nie samą nazwę/MIME. Nie obsługujemy DOC, DOCM ani OCR.

Wybrano `pdfjs-dist@6.4.299` i `mammoth@1.13.0`. [Eksperyment](../../../../research/profil-import-spike/README.md) na Node 24.15.0 potwierdził podstawowy odczyt bez zmiany zależności aplikacji. PDF: legacy getDocument/getTextContent, standardowe fonty z lokalnego pakietu. Wersja 6 nie udostępnia już opcji isEvalSupported; używamy wyłącznie API tekstowego. DOCX: extractRawText z jednym argumentem, bez HTML; dostęp do plików zewnętrznych jest domyślnie wyłączony w bibliotece. Formatowanie CV i kolejność wielu kolumn wymagają przeglądu tekstu. Nie wykonujemy skryptów z dokumentu ani nie pobieramy zasobów, do których odsyła CV. Ekstrakcja w osobnym procesie workera: 30 s, heap Node 256 MiB; timeout kończy proces, zachowując plik i stan błędu. Limit heap nie jest gwarancją limitu całego RSS; pomiar pamięci należy do weryfikacji implementacji.

Rekord importu powstaje najpierw jako receiving; body jest buforowane z egzekwowanym limitem 10 MiB; plik tymczasowy i hash powstają przed atomowym rename. To świadome uproszczenie względem planowanego zapisu strumieniowego. Następnie transakcja ustawia stored/queued oraz zleca pg-boss na tym samym SQL client, zgodnie z działającym wzorcem importera ofert. Awaria między plikiem a transakcją daje stan do odzyskania, nie pozorną transakcję filesystem+SQL. Odzyskiwanie sprawdza hash i obecność pliku; brak daje source_missing bez zmiany aktywnego profilu. Bez automatycznego usuwania poprzednich CV.

## Propozycja AI: ograniczony kontrakt

Dostawca i model D-05 pozostają: OpenAI Responses API, konfigurowalny etap profilu, początkowo `gpt-6-luna`. Odczyt oficjalnych źródeł 2026-11-01: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [karta modelu](https://developers.openai.com/api/docs/models/gpt-6-luna), [kontrola danych](https://developers.openai.com/api/docs/guides/your-data).

Native fetch do Responses, pojedyncze wywołanie na próbę, `store:false`, bez narzędzi, wyszukiwania, Files API i łańcucha rozmowy. Tekst zawodowy ma lokalną rewizję i hash. Tylko ten tekst (bez nazwy pliku, telefonu/e-maila/adresu) oraz wersjonowana instrukcja/schemat trafiają do requestu. Lokalny filtr usuwa rozpoznane kontakty; podgląd i wybór fragmentów są częścią przygotowania wejścia. Nie obiecujemy, że sam regex poprawnie rozpozna wszystkie dane osobowe. Tekst CV jest danymi, nie instrukcją do wykonania. `store:false` nie jest obietnicą zerowej retencji u dostawcy; szczegóły wskazuje dokumentacja kontroli danych.

Format: JSON Schema strict, additionalProperties=false. Wszystkie klucze obecne, nieznane wartości null lub puste kolekcje. Wynik wyłącznie doświadczenie/umiejętności/języki i fragmenty dowodów; bez płacy, preferencji, danych kontaktowych i ratingu. Walidator lokalny sprawdza schemat oraz dokładne występowanie dowodu w zatwierdzonym tekście. Brak dowodu nie staje się potwierdzonym faktem. Odmowa, niekompletny wynik i błąd semantyczny mają stan needs_attention, bez automatycznego zapisywania części wyniku jako aktywnego profilu.

Gdy wynik nadejdzie po zmianie szkicu/tekstu, zostaje historyczną propozycją konkretnego importu. Nie nadpisuje nowego szkicu; zastosowanie wymaga aktualnego expectedRevision i wyboru właściciela.

## Koszt i uruchomienie płatnej próby

Profil korzysta ze wspólnego kontraktu [operacji i budżetu](../operacje/solution-design.md), nie własnego drugiego licznika. Przed pierwszym AI niezbędny jest minimalny fragment tego modułu: atomowa rezerwacja, trwała próba, rozliczenie usage i nieznany koszt po timeout. Brak budżetu daje waiting_budget; brak klucza/cennika/przelicznika daje needs_configuration. Samego OPENAI_API_KEY nie traktujemy jako gotowości płatnej pracy.

Proponowane limity wykonania: max_output_tokens=6000 (w tym rozumowanie), reasoning.effort=low, foreground, standardowy tryb usługi, timeout 90 s. Worker wywołuje API poza SQL transakcją, maksymalnie jedna dodatkowa automatyczna próba błędu przejściowego z nową rezerwacją; pg-boss retryLimit=0 dla tej pracy. Nie naprawiamy bez końca JSON. Pojedyncza płatna praca globalnie, ręczna przed oczekującą automatyczną. Historyczna próba nie zmienia miesiąca rezerwacji po 1. dniu miesiąca.

Górna granica rezerwacji używa wersjonowanej konfiguracji modelu: całego maksymalnego kontekstu jako konserwatywnej granicy wejścia oraz limitu wyjścia. Stawki obejmują najdroższy pasujący wariant wejścia/cache write, długi kontekst i właściwe dopłaty konfiguracji. To większa rezerwa niż typowy koszt CV; po usage rozliczamy rzeczywiste tokeny według zapisanej konfiguracji. Nie dodajemy kolejnego wywołania sieciowego tylko do estymacji tokenów. Model/cennik/przelicznik bez kompletu danych lub model zmieniony bez przypisanej konfiguracji nie może rozpocząć próby. Przelicznik PLN jest wersjonowanym parametrem rachunku aplikacji, nie gwarancją zgodności z fakturą.

W tej sesji nie wykonywano płatnych prób ani nie sprawdzano dostępu konta. Konfiguracja klucza odbywa się lokalnie poza repozytorium i logami. Pierwsza próba ma sprawdzić zgodność requestu, rzeczywiste usage i jakość; nie wolno oznaczyć integracji jako zweryfikowanej przed takim testem. Brak konfiguracji nie blokuje implementacji formularza i lokalnego importu.

## API i granice modułu

| Endpoint / komenda | Wynik |
| --- | --- |
| GET /api/profile | Aktywna wersja, szkic z rewizją i metadane historii; brak profilu to stan pusty, nie błąd. |
| PUT /api/profile/draft | Pełny jawny snapshot szkicu i expectedRevision; brak wybranych pól jest niewiadomą, nie cofnięciem aktywnej wersji. |
| POST /api/profile/confirm | Id komendy, expectedRevision, expectedActiveVersionId; nowa wersja lub poprzedni rezultat idempotentny. |
| POST /api/profile/imports | Plik albo tekst, 202 + import_id po trwałym przyjęciu; nie aktywuje profilu. |
| GET /api/profile/imports/:id | Stan, tekst i propozycja konkretnego importu. |
| GET /api/profile/imports/:id/file | Oryginał jako attachment; 404 dla importu tekstowego, source_missing dla utraty pliku. |
| POST /api/profile/imports/:id/prepare | Rewizja wybranego tekstu zawodowego; zleca propozycję AI po kontroli konfiguracji/kosztu. |
| POST /api/profile/imports/:id/apply | Jawnie wybrane zmiany danych zawodowych + expectedRevision; nie mutuje oczekiwań ani head. |
| GET /api/profile/versions/:id | Niemodyfikowalny snapshot i powiązane źródła. |

Mutacje sprawdzają Origin zgodny z lokalnym hostem oraz Content-Type; bez kont i sesji. Zmiana filtra listy nadal nie wywołuje żadnej z tych komend. Aktualne source_scopes mają własną historię i nie są modyfikowane przez zapis profilu.

## Weryfikacja i gotowość

| Kryterium | Dowód do odbioru implementacji |
| --- | --- |
| R-01: import i oryginał | Tekstowy/wielokolumnowy PDF, polski DOCX, brak tekstu, uszkodzenie, hasło, limity i timeout. Hash pobranego oryginału oraz odtworzenie kontenera bez utraty dokumentu. |
| R-01: profil i wersje | Ręczne uzupełnienie bez CV/AI, wszystkie pominięcia, unknown/no_preference, jedno minimum, opcjonalne poziomy/staż. Szkic nie zmienia head, konflikt dwóch kart nie traci danych, confirm idempotentny. |
| R-01: ponowny import | Porównanie propozycji, wybór pól, brak usuwania pominiętych faktów i oczekiwań, stary wynik AI nie nadpisuje późniejszej edycji. |
| R-01: AI | Test transportu na kontrolnych odpowiedziach; brak kontaktów/oryginału/narzędzi, schema/refusal/incomplete, dowody, konfiguracja i koszt/retry/timeout/granica miesiąca. Oddzielna kontrolowana próba dostawcy przed uznaniem AI za działające. |
| R-02 | Zapis profilu nie zmienia filtrów listy ani zakresu importu PHP Senior. Nieprawidłowy lub pusty profil nie usuwa ofert. |

Zaimplementowano formularz, wersje, lokalny import i bramkowany transport AI. Tester dodał 36 testów profilu, w tym 5 HTTP na osobnym serwerze Nitro i izolowanych schematach. Kontrolowana próba GPT-6 Luna na fikcyjnym CV zwróciła HTTP 200 i poprawny wynik: 306 tokenów wejścia, 325 wyjścia, konserwatywny koszt 0,001525 PLN. Sprawdzono schemat, dokładne dowody z tekstu i zastosowanie propozycji bez zgadywania poziomów umiejętności lub płacy. Schematy testowe usunięto; próba nie zmieniła profilu właściciela. Po odtworzeniu web/worker oba procesy wczytały konfigurację, a API profilu potwierdziło gotowość AI.

Koszt rozliczony z usage jest konserwatywnym oszacowaniem księgowym, nie kwotą faktury. Nieznane koszty pozostają zarezerwowane i są uwzględnione w widocznym budżecie. Decyzją właściciela z 2026-11-01 interfejs ich ręcznego wyjaśnienia odłożono do zadania `oferty-pracy-qld`; nie blokuje aktywacji. Import CV nadal używa bezpośredniego Responses API. Przyszłe oceny i dopasowania ofert użyją Batch API, zgodnie z zadaniem `oferty-pracy-8kt`.

# Firmy, research i przygotowanie do rozmowy — projekt rozwiązania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Uzasadnienie: [wymagania tej funkcjonalności](requirements.md) → [PRD](../../PRD.md). Pokrycie: R-15/AC-15, R-16/AC-16, R-17/AC-17, R-18/AC-18, R-19/AC-19.

## Granice i decyzje

Potwierdzone wybory D-01–D-06 i proponowane D-07–D-08 są utrzymywane we [wspólnej architekturze](../../architecture.md). Pozostałe mechanizmy w tym pliku są **propozycjami SD**, a nie zatwierdzonymi decyzjami właściciela. Nazwy encji i komend opisują plan, nie istniejący kod. Wspólna semantyka null, wersji i komend obowiązuje przez odnośnik, nie przez kopię.

## Własność danych i kontrakty

| Encja / grupa | Istotne pola i niezmienniki |
| --- | --- |
| Organization / Brand / Group / PartyLink | Odrębne podmioty i relacje. Rola `publisher/employer/client` przy ogłoszeniu/ofercie z dowodem. Brak rozpoznanej organizacji jest jawnym stanem, nie fikcyjną spółką. |
| ResearchReport | Typowany cel organizacja/marka (Q11), etap `basic/deep`, wersja, wynik/claims, operation id, daty; oddzielny wskaźnik ukończonej aktualnej wersji dla każdego etapu. Nie ma TTL uruchamiającego zlecenie. |
| Claim / Evidence / TechnologyAssertion | Rodzaj, treść, organizacja/projekt/oferta, źródła z URL/tytułem/datą odczytu, data publikacji opcjonalna, pochodzenie `page/search_snippet/manual/ad`. Cytat opcjonalny wraz z podstawą utrwalenia. Technologia ma zakres i required/nice/unknown tam, gdzie dotyczy oferty. |
| Preparation | Oferta/aplikacja/projekt, użyte wersje raportów i profilu, tematy/prioritety/pytania/uzasadnienia. Odrębne od raportu firmy i ratingu. |

## Raporty, tożsamość i dowody

Propozycja SD: raporty w dwóch osobnych strumieniach wersji, deduplikacja automatycznego podstawowego badania po typowanym celu organizacja/marka. Przed zleceniem sprawdzić istniejący raport i aktywną operację w jednej transakcji. Po ukończeniu wskazać nowy raport atomowo; nieudane odświeżenie nie usuwa poprzedniego. Nie istnieje scheduler TTL researchu.

Twierdzenia zachowują cytowania powiązane z konkretną treścią. Lista wszystkich odwiedzonych URL jest informacją o przebiegu, nie automatycznym uzasadnieniem każdego faktu. UI pokazuje klikalne źródła przy twierdzeniach, ich daty i rodzaj dowodu. Fragment źródła jest opcjonalny; domyślnie własna synteza, URL i metadane. Treść wydawcy utrwalać tylko przy ustalonej podstawie, zgodnie z badaniem usług. Nie robić z niepewnej identyfikacji firmy potwierdzonego profilu prawnego.

**Potwierdzone Q11:** brak ustalonego pracodawcy/klienta nie blokuje researchu dostępnej marki lub agencji; raport zachowuje ten zakres i jawne nieustalone role. Propozycja SD: cel operacji jest typowanym odwołaniem do organizacji albo marki, bez tworzenia fikcyjnej spółki. Raport, jego wersje i klucz ponownego użycia wskazują dokładnie ten cel; nie współdzielimy raportu marki jako potwierdzonego raportu konkretnej spółki. Gdy tożsamość zostanie doprecyzowana, zachowujemy wcześniejsze raporty i ich zakres, zamiast cicho zmieniać ich podmiot. Dobór i mapowanie celu badań należy ująć w przeglądzie modelu danych.

## Przygotowanie do rozmowy

Propozycja SD: PrepareApplication wskazuje ofertę/aplikację, projekt, wersję profilu oraz wersje raportów basic/deep. Wynik Preparation przechowuje priorytety tematów, mapę technologii, pytania ćwiczeniowe i pytania do firmy z uzasadnieniami oraz odnośnikami do dowodów. Nowe przygotowanie nie jest cichym odświeżeniem researchu firmy; szersze pozyskanie wymaga jawnego zakresu.

Ręczne uzupełnienia używają wspólnego mechanizmu informacji z pochodzeniem. Nie wprowadzamy osobnego typu procesu dla informacji od rekrutera. Tożsamość oraz role publisher/employer/client ustalamy na dowodach; dane marki zachowują niepewność co do podmiotu prawnego.


## Komendy

Nazwy logiczne, nie zamrożone endpointy. Wspólny kontrakt walidacji/wersji/odpowiedzi: [architektura](../../architecture.md#wspólny-kontrakt-komend).

| Komenda | Wejście i skutek |
| --- | --- |
| ResearchCompany | Typowany identyfikator znanej organizacji lub marki, basic/deep, tryb reuse lub jawne refresh; żadnego cichego ponowienia raportu. |
| PrepareApplication | Oferta/aplikacja i wskazane wersje raportów, jawny zakres nowego pozyskania. |

## Integracja z pozostałymi funkcjonalnościami

[dopasowanie](../dopasowanie/requirements.md), [oferty](../oferty/requirements.md), [operacje](../operacje/requirements.md), [rekrutacje](../rekrutacje/requirements.md). Status wykonania, rezerwacje i ponowienia zapewnia [kontrakt operacji](../operacje/solution-design.md); prywatny dostęp i trwałe uruchomienie określa [uruchomienie](../uruchomienie/solution-design.md). Zależności te są kontraktami, nie listą kolejności ticketów implementacyjnych.

## Weryfikacja funkcjonalności

Dwie spółki o tej samej nazwie/domenie, agencja i nieznany klient, równoczesna kwalifikacja, reuse po długim czasie i refresh, błąd odświeżenia. Prześledzić źródła twierdzeń i zakres technologii oraz uzasadnienia przygotowania. Pokrycie obejmuje wszystkie R/AC wskazane na początku dokumentu. [Odbiór integracyjny](../odbior/solution-design.md) sprawdza współpracę modułów; nie zastępuje ich kryteriów. Testów produktu jeszcze nie wykonano.

## Otwarte decyzje i gotowość

O-03, O-05, O-06 — [rejestr i skutki](../../open-decisions.md). Przed oznaczeniem tej pary jako gotowej należy rozstrzygnąć dotyczące jej kontrakty i przejrzeć zgodność z wymaganiami. Samo utworzenie dokumentów nie zatwierdza propozycji.

## Realizowany etap F1 — 2026-11-04

Uściślenie mechanizmu dla AC-F1–F5; powyższy projekt raportów pozostaje szkicem późniejszych etapów. Obecnie `source_ads` i `source_ad_revisions.payload.company` przechowują ogłoszenia i nazwę publikującego; brak potwierdzonej tożsamości firmy.

- Migracja 10 dodaje `companies` (UUID, name, kind organization/brand/unknown, website nullable, description, created_at), `company_ad_links` (ad_id, role publisher/employer/client, company_id, evidence, revision_id; PK ad_id+role), `company_link_history` i `company_commands` (commandId + fingerprint + wynik). Nie ma unikalności po nazwie ani domenie. Brak automatycznego backfillu tożsamości.
- Komendy: create `{commandId,name,kind,website,description}`; link `{commandId,adId,role,expectedCompanyId,action:link|unlink,evidence}`. UUID walidowane, reason 1–2000 znaków, input strict. expectedCompanyId null oznacza brak powiązania; konflikt 409, nieistniejący profil/ogłoszenie 404, błędne wartości 422. Link snapshotuje aktualną wersję ogłoszenia jako źródło kontekstu decyzji, nie jako automatyczny dowód tożsamości.
- Zapis komendy, profilu/powiązania i historii jest transakcyjny; advisory lock komendy i ogłoszenia serializuje ponowienia/zmiany. Odpowiedź zapisana przy komendzie zapewnia idempotencję; identyczny commandId z inną treścią daje 409. Odpięcie zachowuje profil, ogłoszenie i historię.
- GET `/api/companies` zwraca wyszukiwalną paginowaną listę (25), GET `/api/companies/:id` profil, role, bieżące oferty, technologie z dowodami per oferta, historię; GET `/api/offers/:id/companies` aktualne role i sugestie zgodnej nazwy. Żaden GET nie tworzy danych. POST przez kontrolę Origin i limit treści istniejących handlerów. Linki zewnętrzne tylko http/https bez poświadczeń.
- `/companies` lista; `/companies/:id` szczegóły; komponent w szczegółach ogłoszenia tworzy/wybiera profile i jawnie wiąże/odpina role. Wspólna nawigacja prowadzi do firm. Rozróżnienie technologii opcjonalnych false/true/null zachowane.
- Weryfikacja: izolowany PostgreSQL (duplikaty nazw, wszystkie role, idempotencja i konflikty, zmiana ogłoszenia, źródła technologii, historia), HTTP odrzucenie niedozwolonego Origin i zły input, render listy i szczegółów, przegląd UI bez zapisywania fikcyjnych profili w bazie właściciela.

### Weryfikacja F1 — wykonana 2026-11-04

Migracja10 zastosowana lokalnie. `pnpm check`: 347 testów domyślnych PASS, typy i lint bez błędów (dwa wcześniejsze ostrzeżenia kolejności atrybutów w edytorach ocen). Zestawy PG/HTTP: firmy10, oferty4, lista ocen7, rewizje ocen15, oceny pojedyncze14 i grupowe12 PASS (62 testy). Osobny tester dopisał regresje powiązań i diagnostyki. Build produkcyjny PASS. Obejrzano listę, formularz przy ofercie i szczegóły; utworzenie firmy przez UI wykonano na osobnym schemacie i chwilowym serwerze, następnie je usunięto. Nie utworzono profili ani powiązań w danych właściciela. F1 nie oznacza realizacji R-16–R-19 dotyczących automatycznego researchu i przygotowania.

## Realizowany etap F2 — 2026-11-04

AC-F6–F9: osobny moduł researchu, kolejka pg-boss, wspólny ledger `ai_attempts` z `operation_type=research`. Migracja11 dodaje operacje ze snapshotem celu, konfiguracją i wynikiem oraz komendy idempotencyjne. Indeks unikalny celu dla aktywnych stanów. Advisory lock celu serializuje reuse/refresh; komenda zachowuje wynik. Raport aktualny to ostatnia ukończona operacja, poprzednie pozostają dostępne; brak TTL. Recovery wznawia tylko niedostarczone i oczekujące na budżet, przerwaną próbę oznacza jako unknown.

Provider: Responses API, wyszukiwanie `web_search` i osobna synteza structured-output. Osobna konfiguracja cen `AI_RESEARCH_PRICING_JSON`, startowo uzgodniony gpt-6-luna; dodatkowo adapter obsługuje gpt-4.1-mini do testów porównawczych. Maksymalnie trzy wywołania narzędzia; wyszukiwanie i synteza po połowie limitu wyjścia. Rezerwacja obejmuje tokeny oraz trzy opłaty po 0.01 USD. Luna rozlicza kontekst wyszukiwania z usage, bez doliczania bloków mini. Dla mini ostrożnie doliczamy stałe bloki 8000 tokenów nawet gdy usage już je uwzględnia; UI opisuje kwotę jako konserwatywny koszt, nie fakturę. Dolne rezerwy wejścia: Luna500000, mini100000 tokenów dla dwóch przebiegów i maksymalnie trzech wywołań wyszukiwania. Brak pewnej telemetrii pozostawia rezerwację. Żadnego automatycznego retry po rozpoczęciu requestu. Nie korzystamy z Batch: aktywne pozyskiwanie źródeł jest odrębną operacją od masowych ocen ofert.

Wyszukiwanie zwraca treść z adnotacjami cytowań. Synteza otrzymuje wyłącznie akapity z cytowaniami i ich identyfikatory. Dowody ustaleń muszą wskazywać istniejące identyfikatory i dokładny fragment akapitu. Lista odwiedzonych URL nie jest dowodem twierdzenia. Oznaczenie `page` wyłącznie przy telemetrii open_page, inaczej `search_snippet`. Nie zapisujemy pełnych stron ani pełnego wyniku wyszukiwania; zapisujemy syntezę, URL/tytuły/daty i typ dowodu. Teksty zewnętrzne i profil firmy traktowane jako dane, nigdy instrukcje. UI renderuje tekst przez interpolację, bez HTML.

GET/POST `/api/companies/:id/research`; POST `{commandId,refresh:boolean}`. GET tylko odczyt, konfiguracja i limit kosztu; POST kontrola Origin i istniejący limit treści. Błędny UUID 404, input422, konflikt komendy409, brak konfiguracji422. UI w profilu: stan, uruchom/odśwież, aktualny raport, poprzednie wersje i błędy.

Źródła kontraktu adaptera: [OpenAI Web search](https://developers.openai.com/api/docs/guides/tools-web-search), [cennik](https://developers.openai.com/api/docs/pricing), sprawdzone 2026-11-04. Weryfikacja planowana: parser dowodów i fałszywych URL, idempotencja/równoczesność, wspólny budżet, przerwanie i brak automatycznego retry, wersje i zachowanie starego raportu, API Origin, UI i pełne sprawdzenie projektu.

### Weryfikacja F2 — wykonana 2026-11-04

Migracja11 zastosowana lokalnie, kolejka utworzona. Tester:11 jednostkowych i8 PG/API PASS (mock provider); regresja wspólnego budżetu/profilu/ocen/firm71 PG/API PASS. `pnpm check`:357 PASS, typy i lint bez błędów (dwa wcześniejsze ostrzeżenia). Build PASS. Wizualnie sprawdzono raport i źródła na osobnym schemacie; podgląd i dane usunięto.

Próby API na publicznych danych OpenAI, bez CV: mini odrzucił jeden raport z błędem dowodów, następny ukończył; Luna ukończyła dwa przebiegi HTTP200. Łączny konserwatywny koszt ukończonych prób0.262205 PLN. Jeden proces diagnostyczny przerwano exit137 bez telemetrii; pozostaje unknown z rezerwacją0.415 PLN, zapisane w zadaniu wyjaśniania kosztów. Nie wykonano prób jakości na konkretnych pracodawcach właściciela ani nie utworzono fikcyjnych profili w publicznej części lokalnej bazy. Brak źródeł pozostaje dopuszczalnym wynikiem „niewiadoma”; próba połączenia nie dowodzi kompletności researchu.

F2 oznacza gotowy ręczny research podstawowy; automatyzacja po progach (`oferty-pracy-363`) i przygotowanie pogłębione (`oferty-pracy-a9b`) pozostają oddzielne.

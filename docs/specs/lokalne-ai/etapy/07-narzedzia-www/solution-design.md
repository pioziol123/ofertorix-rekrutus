# Etap 7: Wyszukiwanie i odczyt stron dla OpenCode — Solution design

Status: **projekt do przeglądu**, 2026-11-04. Etap 7 z dziewięciu; dokumentacja nie oznacza akceptacji ani rozpoczęcia implementacji. Beads: `oferty-pracy-334.8`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Pozostałe decyzje SD są propozycjami.

Zakres normatywny zachowania: [Requirements](requirements.md), E07-R01–E07-R06. Stan bazowy: lokalny katalog z 2026-11-04, łącznie z zastanymi zmianami; nie jest to wyłącznie HEAD. Pliki projektowane poniżej nie są deklaracją istniejącej implementacji.

## Podejście i granice

Proponowany lib/companies/research-tools/ posiada search i readPage, walidację sieci, ekstrakcję oraz magazyn dowodów per operation. Dedykowany most custom tools/MCP udostępnia wyłącznie te funkcje OpenCode. Wbudowane websearch/webfetch są alternatywą dopiero po wykazaniu równoważnych gwarancji pochodzenia, sieci i rozliczeń.

## Decyzja E07-D01 — Kontrolowany most narzędzi z pochodzeniem dowodów

**Propozycja:** Bezpośrednie udostępnienie dowolnych wbudowanych narzędzi wymagałoby wykazania tych samych ograniczeń sieci i rachunkowości. Własne search/readPage nie oznacza własnej pętli agenta.

Punkty integracji w obecnym katalogu: [lib/companies/research-model.ts](../../../../../lib/companies/research-model.ts). Wskazują miejsca zmiany, nie obowiązek przeniesienia wszystkich ich odpowiedzialności.

## Proponowane kontrakty i niezmienniki

search({query:string}, context) zwraca {status:'complete'|'partial', evidence:ResearchEvidence[], errorCode:string|null}. query niepuste, maksymalnie 2000 znaków (propozycja ochrony argumentu). readPage({url:string},context) ma ten sam wynik, ale tylko faktycznie pobrany tekst tworzy dowód page. Błędy walidacji i blokady są jawne; pusty poprawny odczyt jest odróżnialny od awarii. context.operationId i uprawnienia pochodzą z uwierzytelnionego mostu, nie z argumentu modelu.

Dowody używają schematu ResearchEvidence w research-model.ts. ID jest nieujemną liczbą całkowitą unikalną w operacji, nadawaną atomowo po pobraniu. Zapisać tekst przekazany modelowi, sources i accessedAt ISO8601, bez możliwości nadpisania przez agenta. Każdy raport odwołuje się do dokładnie tej wersji materiału. Fragmenty są dowodem, nie instrukcją systemową. Magazyn dowodów nie jest drugim dziennikiem prób i kosztów.

Proponowane techniczne ustawienia na start: HTTP(S), porty 80/443, bez userinfo, cookies i nagłówków autoryzacji użytkownika; do 5 redirectów, 30 s jednego pobrania i 2 MiB zdekompresowanego body. Parametry to ochrona jednego zasobu, nie deadline researchu. Po przekroczeniu nie udawać pełnego odczytu. Każdy hop rozwiązuje DNS, odrzuca wszystkie niedozwolone adresy i łączy się z wcześniej zweryfikowanym adresem, zachowując hostname/TLS; ponowny swobodny DNS przy połączeniu jest niedopuszczalny. W pilocie sprawdzić bibliotekę HTTP i równoważną ochronę egress. Ollama/OpenCode są oddzielnymi endpointami usług, bez wyjątku w readPage.

Dla płatnego search rezerwacja per wywołanie jest krótka i atomowa przed HTTP, rozliczenie osobne po odpowiedzi. Klucz wywołania narzędzia jest trwały; duplikat znanego ukończonego wywołania zwraca zapisany wynik, unknown nie jest automatycznie ponawiane. Taryfa musi dostarczać górną granicę kosztu pojedynczego wywołania. Brak takiej granicy blokuje tę płatną usługę. To nie limit liczby lokalnych rund.

## Migracja i uruchomienie

Dodać konfigurację wybranej usługi i ewentualną addytywną tabelę dowodów/wywołań z FK operation ID. Retencja zgodna z etapem 8, źródła potrzebne do weryfikacji zapisanych raportów pozostają dostępne. Bez live do zamknięcia O-L2. Nie pobierać stron wymagających logowania ani nie obchodzić blokad.

## Weryfikacja

Wszystkie poniższe próby są planem, nie wykonanym wynikiem. Testy automatyczne z atrapami nie dowodzą sprawności usług live.

1. Atrapy search/HTTP: complete/partial/puste, 403/429/timeout, MIME i rozmiar po dekompresji.
2. Testy SSRF: IPv4/IPv6/mapped, DNS rebinding, redirect, userinfo, porty i host metadanych; połączenie tylko do zweryfikowanego IP.
3. Test izolacji operation ID, nieznane narzędzie, błędne argumenty i treść z instrukcjami.
4. PG: atomowe ID dowodów, płatna rezerwacja, koszt unknown i duplikat tool call; kontrolowany pilot po decyzji O-L2.

| Kryterium | Co musi wykazać weryfikacja |
| --- | --- |
| E07-AC01 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E07-AC02 | Próby 1–2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E07-AC03 | Próby 2 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E07-AC04 | Próby 1 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E07-AC05 | Próby 3–4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |
| E07-AC06 | Próby 4 powyżej; zaobserwować rezultat wskazany w odpowiadającym kryterium Requirements. |

Przy implementacji zmieniającej zachowanie zastosować projektowy workflow `implement-with-tester`. Stan, dowody i ewentualne odchylenia aktualizować w Beads i tej parze; nie dopisywać niesprawdzonych sukcesów.

## Decyzje wymagające zamknięcia

O-L2 blokuje wybór dostawcy, warunków, taryfy i pełne wykonanie live. Mechanizm mostu custom tools/MCP oraz wartości ochrony pojedynczego odczytu są propozycjami do potwierdzenia. Nie są obietnicą gotowej integracji.

Przed kodem ponownie sprawdzić kontrakty i wymagane zależności. Zlecenie przygotowania wszystkich par rozszerza dokumentację późniejszych etapów; nie usuwa przeglądu przed ich realizacją.

## Źródła integracji

Zweryfikowano 2026-11-04: [narzędzia OpenCode](https://opencode.ai/docs/tools/) opisują narzędzia wbudowane i rozszerzenia. Dokumentacja nie dowodzi spełnienia wymagań sieci i dowodów projektu. Źródło wyszukiwania i most nadal wymagają decyzji O-L2.

# Etap 7: Wyszukiwanie i odczyt stron dla OpenCode — Requirements

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Etap 7 z dziewięciu; przegląd w ramach 334.20, bez wykonania implementacji. Beads: `oferty-pracy-334.8`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Kontrakty techniczne doprecyzowano w SD, runtime i kwalifikacji; ich sprawność wymaga testów.

## Cel i granice

Google przez przeglądarkę i integracja narzędzi researchu z pochodzeniem dowodów. Testowalne bez LLM. Bez prowadzenia rozmowy agenta i bez publikowania raportów.

Pokrycie przekrojowe: LA-06, LA-07, LA-09. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Etap 5 i kwalifikacja `334.21` przed integracją: etap 5 dostarcza wspólne execution ID, trwałą kolejkę i slot lokalnego AI wykorzystywane przez most. Rozpoznanie protokołu i izolowane testy Chrome bez LLM można przygotować wcześniej, ale nie oznacza to ukończenia tej integracji. O-L2/T03–T05 przed użyciem live. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E07-R01 / E07-AC01 | Jawne źródło i koszt wyszukiwania | Konfiguracja wskazuje Google przez dedykowaną przeglądarkę; nie uruchamia płatnego API wyszukiwarki. Brak konfiguracji nie uruchamia domyślnej usługi zewnętrznej; płatne wywołanie ma pokrycie przed wysłaniem. |
| E07-R02 / E07-AC02 | Dowody z faktycznego odczytu | Snippet pozostaje search_snippet; page powstaje tylko po pobraniu strony. Każdy dowód ma nadany przez aplikację ID, tekst, URL, tytuł i datę odczytu. |
| E07-R03 / E07-AC03 | Kontrolowany dostęp WWW | Adresy prywatne, lokalne, metadane i przekierowania do nich są odrzucane, także dla IPv6 i zmian DNS; agent nie otrzymuje plików ani powłoki. |
| E07-R04 / E07-AC04 | Jawne braki i błędy | 403, 429, timeout, zbyt duża strona i nieobsługiwany format nie dają fikcyjnego dowodu strony. Częściowe wyniki mają oznaczenie częściowego odczytu. |
| E07-R05 / E07-AC05 | Izolacja operacji i danych | Dowody jednej operacji nie mogą zostać podane jako dowody drugiej; wyszukiwarka nie dostaje CV, pełnego profilu ani sekretów. Instrukcje w stronie nie zmieniają uprawnień. |
| E07-R06 / E07-AC06 | Niezależność od limitów modelu | Ochrona pojedynczego odczytu nie ogranicza liczby rund lub inferencji Ollamy; brak płatnego budżetu zatrzymuje płatne narzędzie, z jawną przyczyną. |

## Zależności i gotowość

Źródło wybrane: Google przez przeglądarkę. O-L2 dotyczy teraz mechanizmu przeglądarkowego, izolacji, dowodów i obsługi blokad. Most wybrany: Chrome DevTools MCP z dedykowanym Chrome. Izolację i przechwytywanie materiałów opisują kontrakty runtime; T03–T05 wymagają weryfikacji, sama decyzja nie dowodzi działania integracji.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.

## Uzupełnienie zatwierdzone 2026-11-05

Obowiązują [LA-11–LA-15](../../requirements.md): pojedynczy agent, izolacja stanu per wykonanie, cookies w obrębie wykonania, czysty stan kolejnego, bez logowania, zakres dowodów i ręczne wznowienie. E07-AC02 obejmuje archiwizację dokładnego tekstu widzianego przez agenta i zrzutów przy blokadach/błędach/interwencji; E07-AC05 obejmuje brak przenoszenia cookies/kart między wykonaniami oraz zachowanie archiwum. Decyzje produktowe są zamknięte; mechanizm izolacji i przechwytywania danych nadal wymaga weryfikacji technicznej.

## Publiczne źródła i sprzątanie — po grill-me

Obowiązują LA-19–21: snippet Google służy tylko nawigacji/archiwizacji; fakt/opinia wymaga dowodu odczytanej strony. E07-AC02 sprawdza odrzucenie twierdzenia opartego tylko na snippet. E07-AC05 sprawdza brak danych właściciela w narzędziach: dozwolone wyłącznie dane firmy i stanowiska. E07-AC04 sprawdza próbę innych znalezionych publicznych źródeł przy blokadzie pojedynczej strony. Stron wymagających konta nie otwieramy przez logowanie i nie czekamy na zalogowanie. CAPTCHA/zgoda blokująca publiczną pracę może wymagać interwencji.

Profil Chrome z cookies/cache jest usuwalnym stanem roboczym po potwierdzonym końcu i zapisie materiałów. Aktywność lub interwencja zachowuje ten sam profil. E07-AC05 wymaga, aby sprzątanie zakończonego profilu nie usunęło dowodów, rozmów, zdarzeń ani raportów i nie dotknęło aktywnego profilu. Parkowanie sesji i logowanie dopiero w backlogu281, poza tym wydaniem.

## Gotowość wykonawcza po przeglądzie

Przegląd 2026-11-05 rozstrzyga kontrakty techniczne, w tym headless Chrome w kontenerze z prywatnym DevTools do ręcznej interwencji. [Kwalifikacja](../../kwalifikacja-runtime.md) określa wersje i zabezpieczenia oraz dowody wymagane przed integracją. Nie ma otwartego wyboru modelu, przeglądarki lub kwot; działanie sprawdza wykonawca. Negatywny test blokuje włączenie, nie uprawnia do obejścia kryteriów.

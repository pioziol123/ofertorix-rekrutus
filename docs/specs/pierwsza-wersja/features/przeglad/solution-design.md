# Przeglądanie ofert i firm — projekt rozwiązania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **bieżący wycinek listy zrealizowany; pozostałe moduły szkic**, 2026-10-31. Uzasadnienie: [wymagania tej funkcjonalności](requirements.md) → [PRD](../../PRD.md). Pokrycie: R-20/AC-20, R-21/AC-21.

## Granice i decyzje

Potwierdzone wybory D-01–D-06 i proponowane D-07–D-08 są utrzymywane we [wspólnej architekturze](../../architecture.md). Pozostałe mechanizmy w tym pliku są **propozycjami SD**, a nie zatwierdzonymi decyzjami właściciela. Nazwy encji i komend opisują plan, nie istniejący kod. Wspólna semantyka null, wersji i komend obowiązuje przez odnośnik, nie przez kopię.

## Widoki i nawigacja

Propozycja SD: strony `/offers`, `/offers/:id`, `/companies`, `/companies/:id`, `/profile`, `/operations`. Panel szczegółów w tabeli może mieć URL oferty i umożliwiać bezpośrednie wejście. Na mniejszym ekranie przechodzi w widok szczegółów. Nuxt UI dostarcza komponenty, ale nie kopiujemy kodu makiety jako produkcji.

## Odczyt, filtry i sortowanie

Propozycja SD: listy korzystają z zapytań serwerowych z paginacją, stabilnym sortowaniem i dodatkowym kluczem id przy remisie. Filtry oraz wybór oferty są reprezentowane w URL, aby powrót ze szczegółów zachował kontekst. Nie zapisują preferencji profilu ani zakresu importu. Filtry technologii wykonują jawne any/all/excluded z rozróżnieniem wymagane/opcjonalne; brak danych jest osobno widoczny i ma uzgodnione zachowanie dla konkretnego filtra.

Tabela pokazuje rating, kompletność, aktualność i własną decyzję osobno. Profil firmy pobiera technologie z zakresem, nie płaską sumę przypisaną każdemu stanowisku. Kwalifikację minimum płacy określa [SD dopasowania](../dopasowanie/solution-design.md#porównanie-wynagrodzenia); UI nie ukrywa tego za nieuzgodnioną konwersją walut/netto/brutto.

Mutacje w panelach wywołują komendy modułów ofert, rekrutacji i researchu. Ten moduł nie jest drugim właścicielem tych reguł ani kopią ich modeli zapisu.


## Integracja z pozostałymi funkcjonalnościami

[oferty](../oferty/requirements.md), [firmy-research](../firmy-research/requirements.md), [dopasowanie](../dopasowanie/requirements.md), [rekrutacje](../rekrutacje/requirements.md). Status wykonania, rezerwacje i ponowienia zapewnia [kontrakt operacji](../operacje/solution-design.md); prywatny dostęp i trwałe uruchomienie określa [uruchomienie](../uruchomienie/solution-design.md). Zależności te są kontraktami, nie listą kolejności ticketów implementacyjnych.

## Weryfikacja funkcjonalności

Przejść oferta → firma → inna oferta i wrócić z filtrami. Sprawdzić wszystkie wymiary R-21, any/all/excluded, sortowanie z remisami, odrzucone/wygasłe/niewiadome i odrębne rating/kompletność/decyzję. Pokrycie obejmuje wszystkie R/AC wskazane na początku dokumentu. [Odbiór integracyjny](../odbior/solution-design.md) sprawdza współpracę modułów; nie zastępuje ich kryteriów. Testów produktu jeszcze nie wykonano.

## Otwarte decyzje i gotowość

O-02 — [rejestr i skutki](../../open-decisions.md). Przed oznaczeniem tej pary jako gotowej należy rozstrzygnąć dotyczące jej kontrakty i przejrzeć zgodność z wymaganiami. Samo utworzenie dokumentów nie zatwierdza propozycji.

## Wykonanie bieżącego wycinka listy — 2026-10-31

`/offers` z query URL i panelem szczegółów, bez logowania (najnowsza decyzja właściciela). `/api/offers` zwraca paginowane projekcje bieżących source_ads/revisions, opcje filtrów i metadane ostatniego importu. `/api/offers/:id` zwraca aktualne szczegóły oraz daty rewizji, bez dawnych payloadów. Normalizacja danych zachowuje null; opis HTML konwertowany do tekstu (bez v-html). Link źródłowy tylko https/http i rel noopener/noreferrer. Firma to nadal etykieta źródła.

Moduł `lib/offers.ts` jest wspólnym kontraktem projekcji i filtrowania. Przy jednej osobie i jednym źródle odczytuje projekcje z bazy, filtruje i stabilnie sortuje po stronie serwera, następnie paginuje. Nie wysyła całego katalogu/payloadów do klienta. Limit bezpieczeństwa 10000 rekordów wymaga później zastąpienia filtrowania zapytaniem SQL przed zwiększeniem wolumenu. Nie dodajemy ORM. Parametry zapytań mają walidację, błędne wartości dają 400. Szczegóły UUID dają 404 gdy brak.

Dostęp: bez kont i sesji, zgodnie z decyzją właściciela z 2026-10-31. Compose nadal publikuje tylko 127.0.0.1; na VPS pozostaje tunel SSH. Próbną implementację logowania usunięto przed oddaniem funkcji. Health i domenowe API nie wymagają sesji.

Weryfikacja: tester modułu odczytu/filtrowania i rzeczywistego PostgreSQL; HTTP bez logowania, bezpieczny opis i URL; wizualny przegląd tabeli/panelu na desktopie i telefonie; regresja importera/setupu, lint/typy/build. Nie uznajemy za ukończone R-20/R-21 zależne od przyszłych ratingów, firm czy procesów.

### Wynik weryfikacji bieżącego wycinka

2026-10-31: komplet 54 testów przechodzi (adapter/importer, projekcja/filtry, odczyt PostgreSQL w izolowanym schemacie, HTTP bez logowania, setup i worker); lint/typecheck oraz build poprawne. Tester dodał początkowe testy jednostkowe; po przerwaniu jego pracy limitem usługi główny agent uzupełnił przypadki rozbieżności i integrację bazy/HTTP. W przeglądarce sprawdzono 31 ofert, otwarcie panelu, odświeżenie z zachowaniem wyboru i pusty wynik. Wąski widok panelu układa szczegóły nad tabelą, tabela przewija się wewnętrznie. Pełny automatyczny zestaw testów E2E przeglądarki nie jest częścią tego etapu.

Nieznany poziom technologii nie jest oznaczany jako wymagany: osobna sekcja bez określonej roli. Jednoczesne oznaczenie źródła remote+hybrid pokazuje obie wartości z informacją o rozbieżności i pasuje do obu filtrów. Brak logowania zastępuje wcześniejszy projekt sesji; zastosowana historyczna migracja sesji jest zachowana, a kolejna migracja usuwa nieużywaną tabelę.

### Korekta formularza — 2026-11-01

Przełącznik filtra wynagrodzenia oddziela zachowany szkic pól od aktywnych warunków. Wyłączone pola są disabled i pomijane przez offerFilterQuery; hasSalaryFilter przywraca stan z URL, ignorując dawny domyślny includeUnknownSalary=true bez innych warunków płacy. Serwerowa walidacja minimum względem waluty/okresu pozostaje. Regresja obejmuje niezmienione inne filtry oraz zachowany szkic płacy po wyłączeniu.

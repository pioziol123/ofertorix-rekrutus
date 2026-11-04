# Przegląd forków JobSpy: decyzje po researchu

Data: 2026-11-03. Zadanie: `bd show oferty-pracy-y81.14`.

## Wniosek

Znaleziono wartościowy **kandydat do próby Indeed** — `cspenn/jobsniffer`, korzystający z impersonacji Chrome przez curl_cffi i danych HTML. Nie znaleziono dowodu skuteczności tego podejścia dla Indeed Polska z naszego środowiska. Sama obecność kodu, testów parsera czy udanej próby autora nie gwarantuje usunięcia 403.

Dla pozostałych portali są poprawki ponowień, tempa żądań, zachowania częściowych wyników i liczby requestów. Żadna z przejrzanych zmian nie daje samodzielnie gwarancji globalnego limitu 1 HTTP/s, obejmującego detale, retry i redirecty. Zachować naszą wspólną kontrolę transportu; przenosić wybrane pomysły, zamiast zastępować cały fork.

## Zalecana kolejność dalszej pracy

1. Oddzielna, ograniczona próba transportu Chrome/curl_cffi dla Indeed, inspirowana jobsniffer. Przed próbą wyłączyć automatyczne ponowienia i przekierowania lub objąć każdą próbę naszym ogranicznikiem. Wynik 403 pozostaje błędem dostępu, nie pustą synchronizacją. Nie dodawać automatycznie GraphQL fallback tylko dlatego, że zawiera go badany fork.
2. Pierwsze dodatkowe API: Himalayas, następnie Jobicy i Remote OK. Zmierzyć rzeczywiste dopasowania Senior PHP oraz dostępność z Polski i liczbę nowych ogłoszeń względem obecnej bazy. To propozycja, nie zgoda na równoczesne wdrażanie wszystkich źródeł.
3. Freehire jako mały eksperyment po weryfikacji dokumentacji i pochodzenia ofert. Arbeitnow oraz wybrane firmy przez ATS jako kolejne możliwości.
4. WTTJ/Wellfound i jobsbylevel pozostawić niżej: odpowiednio braki danych i filtrów, zależność od ochrony antybotowej, niezmierzone pokrycie obecnego profilu. Poziom jobsbylevel opisuje użycie AI, nie seniority.

SOLID.Jobs występuje także w PR forków, lecz **już mamy własną integrację**, więc nie stanowi nowego źródła aplikacji. Zmniejszenie liczby żądań w Glassdoor i raportowanie błędów LinkedIn opisane w raporcie częściowo pochodzą z upstream; nie liczyć ich ponownie jako nowych funkcji naszego forka bez porównania lokalnego kodu.

## Raporty szczegółowe

- [Indeed: próba forków, transport i dowody](jobspy-forki-indeed.md).
- [Inne portale: limity i dodatkowe adaptery](jobspy-forki-inne-portale.md).
- [Dodatkowe źródła: aktualna dokumentacja operatorów](jobspy-nowe-zrodla.md).

To research statyczny, bez uruchamiania kodu forków i bez nowych prób pobierania LinkedIn/Indeed. Odczyt publicznej odpowiedzi Remote OK służył potwierdzeniu interfejsu; nie był importem do bazy. Nie zmieniano produkcyjnych adapterów ani włączonych źródeł. Raporty wskazują konkretną próbę i przypięte wersje kodu; nie audytowano całej sieci forków.

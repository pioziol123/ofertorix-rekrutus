# Dostępność danych źródeł ofert dla polskiego rynku

Data weryfikacji: **2026-10-30**. Kontekst: `bd show oferty-pracy-v4t.1`; wymagania: [ustalenia produktu](../product/ustalenia.md). To materiał do wyboru źródła, nie decyzja właściciela ani wdrożenie pobierania.

## Wniosek

**Rekomendowany kandydat na pierwsze źródło: SOLID.Jobs.** Jako jedyny z pięciu ma w tym badaniu potwierdzony oficjalny, opisany interfejs odczytu przeznaczony także dla agregatorów i asystentów AI. Dokumentacja mówi o bezpłatnym dostępie bez konta, klucza i OAuth; wymagany jest własny identyfikator `campaign`. Wprost dopuszcza prezentowanie ofert w aplikacji i budowanie agregatora. [Oficjalna strona API](https://solid.jobs/api-ofert-pracy).

Rekomendacja dotyczy prostoty i jawnych zasad integracji. Nie dowodzi najlepszego pokrycia rynku ani liczby pasujących ofert dla właściciela: wartości wymagań podstawowych pozostają nieustalone. Pozostałe portale mogą być użyteczne później, po uzyskaniu odpowiedniego dostępu lub wyjaśnieniu warunków.

## Metoda i siła dowodów

Sprawdzono oficjalne strony, dokumentację podlinkowaną przez operatora, regulaminy i przykładowe ogłoszenia. Wyszukiwania nazw portali wraz z `API`, `RSS` i integracjami nie ujawniły potwierdzonego publicznego interfejsu odczytu dla czterech konkurentów. **„Nie potwierdzono” nie oznacza „nie istnieje”.** Dokumentacja dostawcy ATS, płatnego scrapera lub agregatora zewnętrznego nie potwierdza oferty API operatora portalu. Interfejs publikowania ogłoszeń dla pracodawców nie stanowi dostępu do całej listy ofert.

Wykonano jeden udany GET SOLID.Jobs z `pageSize=1`; nie pobierano całej bazy ani nie testowano limitów. Część stron theprotocol.it zwracała 403; nie obchodzono ograniczeń. Wskazana data oznacza datę sprawdzenia; treść wyszukiwarki może pochodzić z cache. Dlatego nie porównuje się liczników widocznych na stronach jako dokładnych aktualnych wielkości rynku.

## Porównanie

| Źródło | Oficjalny odczyt API / RSS ofert | Dane i praca z Polski | Warunki / ograniczenia | Ocena na start |
| --- | --- | --- | --- | --- |
| **SOLID.Jobs** | Potwierdzone publiczne REST API i oficjalne kanały RSS ofert: ogólny, IT oraz specjalizacje. [Katalog RSS](https://solid.jobs/about/rss). | Próbka API ma lokalizację Kraków, warunki B2B, technologie, opis i daty. Dział IT obejmuje również role inne niż programowanie. | Bezpłatne; `campaign`; 300 żądań/min/IP, kolejka 10, cache 1 h; strona API dozwala agregatory. [Dokumentacja](https://solid.jobs/api-ofert-pracy). | Najmniej niepewności integracyjnych; kandydat rekomendowany. |
| **Just Join IT** | Nie potwierdzono oficjalnego publicznego API odczytu ani RSS ofert. Próba starego `/api/offers` przez narzędzie WWW zakończyła się 404; to nie dowód braku innego API. | Wyszukiwarka ma polskie miasta, remote, technologie, seniority, umowy, wymiar pracy, języki i filtr ofert z widełkami. [Wyszukiwarka](https://justjoin.it/). | Regulamin użytkownika 14.07.2026 pkt 11.2–11.3 ogranicza kopiowanie/pobieranie treści; automatyczna ekstrakcja wymaga wyraźnej pisemnej zgody. [Regulamin z oficjalnej strony](https://s3.eu-west-1.amazonaws.com/public.justjoin.com/regulations/jjit-users-terms-of-service/jjit__regulamin_uzytkownika_justjoinit_14072026). | Nie uruchamiać planowego importu bez odpowiedniego uzgodnienia. |
| **No Fluff Jobs** | Nie potwierdzono oficjalnego publicznego API odczytu ani RSS ofert. | Filtry: technologie, seniority, lokalizacja, tryb, umowa, język i widełki; są oferty w Polsce. [Wyszukiwarka](https://nofluffjobs.com/). | Regulamin 15.10.2026 §2 ust. 8–9 ogranicza istotną część bazy oraz powtarzające/systematyczne pobieranie; robots wyłącza `/api/`. [Regulamin](https://nofluffjobs.com/static/No_Fluff_Jobs_Terms_and_Conditions.pdf), [robots](https://nofluffjobs.com/robots.txt). | Najpierw wyjaśnić dostęp i warunki; sam nieoficjalny endpoint nie wystarcza. |
| **Bulldogjob** | Nie potwierdzono oficjalnego publicznego API odczytu ani RSS ofert. | Lista ma polskie i zagraniczne lokalizacje, remote, technologie, doświadczenie, wymiar współpracy i widełki. [Lista ofert](https://bulldogjob.pl/companies/jobs). | Regulamin §16 ust. 3 ogranicza kopiowanie, reprodukcję, dystrybucję i pobieranie treści w całości/części. [Regulamin](https://bulldogjob.pl/terms/general). | Nie wybierać do automatycznego importu bez uzgodnienia dostępu. |
| **theprotocol.it** | Nie potwierdzono oficjalnego publicznego API odczytu ani RSS ofert. | Operator opisuje polski rynek IT, filtry technologii MUST/NICE/NOT, lokalizację, zarobki, umowy i doświadczenie. [O serwisie](https://theprotocol.it/o-nas). | Strona wskazuje regulamin obowiązujący od 12.10.2026, ale pełnego dokumentu nie udało się zweryfikować w tym badaniu; część adresów zwraca 403. [Strona regulaminu](https://theprotocol.it/regulamin). | Dostęp techniczny i dopuszczalność integracji pozostają niewiadome. |

Nie ustalono dla czterech ostatnich źródeł publicznego kontraktu paginacji, limitów żądań, gwarantowanej kompletności, historycznego eksportu ani interfejsu statusu zamknięcia. Funkcje widoczne w przeglądarce nie są gwarancją dostępności tych pól przez API. `robots.txt` opisuje oczekiwania crawlerów; nie zastępuje regulaminu ani licencji.

## SOLID.Jobs: API, RSS i rzeczywista próbka

Oficjalny katalog RSS podaje kanał wszystkich nowych ofert `https://solid.jobs/rss/job-offers`, kanał IT `https://solid.jobs/rss/job-offers/division/IT` oraz kanały specjalizacji programistycznych, np. Python, Java i .NET. Potwierdzono istnienie i przeznaczenie kanałów na stronie operatora; odczyt kanału IT narzędziem WWW zatrzymał się na nieobsługiwanym typie `application/rss+xml`, więc nie zweryfikowano treści XML ani nie wykonano audytu kompletności lub retencji RSS. Nie ustalono gwarancji historii, paginacji, aktualizacji i sygnalizowania zamknięcia przez RSS. Dla pełnego importu i synchronizacji rekomendowane pozostaje opisane API. [Katalog kanałów RSS](https://solid.jobs/about/rss).

Oficjalny klient opisuje `GET /public-api/offers/{division}`, wersję `X-Api-Version: 1.0`, indeksowanie stron od zera, domyślnie 30 i maksymalnie 500 rekordów na stronę. Odpowiedź zawiera `jobs`, `pageIndex`, `pageSize`, `totalCount`, `totalPages`. Są filtry miast, kategorii/specjalizacji, doświadczenia, frazy i minimalnej pensji oraz sortowanie m.in. po `validFrom`, `validTo` i wynagrodzeniu. [README operatora](https://github.com/solid-company/solid-jobs-client#main-endpoint).

Zapytanie kontrolne, bez filtrów merytorycznych:

```text
GET https://solid.jobs/public-api/offers/IT?campaign=osobisty-asystent-research&pageSize=1&pageIndex=0
```

Wynik: **HTTP 200**, `pageIndex=0`, `pageSize=1`, `totalCount=1525`, `totalPages=1525`. Licznik dotyczy działu IT w chwili odczytu, nie samych programistów ani całej historii. Skrócony zapis faktycznie odczytanych pól (pominięto pełny opis i listy):

```json
{
  "jobOfferKey": "73e829f7-9306-4210-85ce-8eea8de68acb",
  "title": "Project Manager",
  "division": "IT",
  "category": "ItManager",
  "subCategory": "ProjectManager",
  "company": "Verita HR",
  "salary": {
    "from": 24000.0, "to": 28500.0,
    "currency": "PLN", "period": "Month", "employmentType": "B2B"
  },
  "contractTime": "full_time",
  "locations": ["Kraków"],
  "isRemote": false,
  "isHybrid": true,
  "experienceLevel": "Senior",
  "validFrom": "2026-10-30T11:36:01.7201077+01:00",
  "validTo": "2026-11-30T11:36:01.7201077+01:00",
  "updatedAt": "2026-10-30T11:26:12.1036722+01:00"
}
```

Źródło próbki: [publiczny endpoint operatora](https://solid.jobs/public-api/offers/IT?campaign=osobisty-asystent-research&pageSize=1&pageIndex=0), odczyt 2026-10-30. Jeden rekord nie potwierdza kompletności ani zachowania całej bazy.

Próbka zawierała również `companyLogoUrl`, `benefits`, `skills` z nazwą i poziomem, `languages` z nazwą i poziomem, pełny `description` w HTML oraz adres `url` zawierający identyfikator kampanii. Opis ujawniał pośrednika rekrutacyjnego, nienazwanego klienta i sześć dni miesięcznie w biurze. To przykład danych wymagających odczytu tekstu: pojedyncze `company` nie rozdziela ról firmy publikującej, zatrudniającej i klienta; samo `isHybrid` nie określa liczby dni biurowych.

### Przydatność i braki dla produktu

| Wymaganie | Dowód / konsekwencja |
| --- | --- |
| Stabilna tożsamość w źródle | Jest `jobOfferKey`; używać wraz z identyfikatorem źródła, nie samego tytułu ani URL kampanii. To rekomendacja projektowa na podstawie próbki. |
| Wynagrodzenie | Próbka potwierdza kwotę, walutę, okres i umowę. Dokumentacja przewiduje także `secondarySalary`; granice kwot mogą być `null`. Nie zakładać obecności drugich widełek. [Opis pól](https://github.com/solid-company/solid-jobs-client#example-response). |
| Wymagane / opcjonalne technologie | Dokumentacja pokazuje poziom `NiceToHave`; zachować oryginalny poziom zamiast usuwać to rozróżnienie. [Przykład operatora](https://github.com/solid-company/solid-jobs-client#example-response). |
| Z Polski | Polski adres jest mocnym sygnałem, lecz `isRemote=true` sam nie dowodzi dopuszczenia rezydencji w Polsce, wymaganego zezwolenia, strefy ani godzin pracy. Te dane pozostają niewiadome, jeśli opis ich nie podaje. |
| Historia | Nie potwierdzono eksportu historii pojedynczych ogłoszeń ani wersji zmian. Statystyki rynkowe nie zastępują historii oferty. Własne snapshoty są potrzebą projektu. |
| Zamknięcie | Są `validTo` i daty zmian; nie potwierdzono osobnego statusu `closed`, tombstone, webhooka lub gwarantowanego odczytu wycofanej oferty. Nieobecność na częściowej stronie nie wystarcza. |
| Aktualizacja | Cache 1 h oznacza, że częstsze odpytywanie nie daje gwarancji świeższych danych. Nie ustalono SLA ani atomowego snapshotu wielu stron. [Strona API](https://solid.jobs/api-ofert-pracy). |

## Granice rekomendowanego pierwszego adaptera

Poniższe są **wnioskami projektowymi**, a nie dodatkowymi gwarancjami operatora:

- Pobierać dział IT albo uzgodniony szeroki zakres, a dopiero po określeniu profilu ustalić granice filtrowania. Nie używać próbki PM jako dowodu jakości dopasowania dla programisty.
- Rozpoczynać od jednego przebiegu dziennie i ręcznego odświeżenia, z sekwencyjną paginacją, obsługą 429/backoff oraz błędu całego przebiegu. Limit 300/min jest granicą, nie zalecaną częstotliwością.
- Zachowywać klucz źródła, pełny opis, oryginalne pola, datę pobrania oraz URL zwracany przez API wraz z kampanią; wyświetlać źródło i odsyłacz. Nie stwierdzono osobnego obowiązku konkretnego logo lub tekstu atrybucji — to nie jest potwierdzona licencja do dowolnego dalszego obrotu danymi.
- Zachowywać notatki i historię lokalnie po zniknięciu ogłoszenia. Pojedynczy błąd, niepełny przebieg albo zmiana filtrów nie może oznaczać wygaśnięcia; regułę potwierdzania zamknięcia należy doprecyzować przy projekcie synchronizacji.
- Przed implementacją sprawdzić kilka ofert programistycznych z wybranego zakresu, stabilność klucza i pól opcjonalnych. Nie wymaga to badania obciążeniowego ani obchodzenia ograniczeń innych źródeł.

## Korekta wcześniejszych założeń

1. **SOLID.Jobs jako sensowny punkt startu — potwierdzone**, obecnie oficjalnym API oraz udanym odczytem, nie samą wcześniejszą rozmową.
2. **„Pozostałe polskie portale mają API do pobierania” — niepotwierdzone.** Nie należy przedstawiać endpointów frontendowych lub ofert firm trzecich jako oficjalnego dostępu integracyjnego.
3. **„Brak API” lub „brak RSS” — zbyt mocne.** SOLID.Jobs ma potwierdzone API i oficjalny katalog RSS. Dla czterech pozostałych źródeł nie znaleziono i nie zweryfikowano publicznego kontraktu odczytu/kanału ofert.
4. **„Publicznie widoczne = wolno systematycznie pobierać” — niewłaściwa podstawa projektu.** JJIT, NFJ i Bulldogjob mają opisane wyżej ograniczenia regulaminowe. Dla theprotocol.it szczegółowe warunki pozostają niewiadome; nie przenosić postanowień innych serwisów Grupy Pracuj automatycznie na ten portal.

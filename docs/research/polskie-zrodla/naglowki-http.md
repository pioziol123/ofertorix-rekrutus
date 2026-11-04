# Porównanie nagłówków HTTP — 2026-11-03

33 pojedyncze żądania z kontenera worker, Python requests, bez proxy środowiskowego (`trust_env=False`), bez przekierowań, limit połączenia 8 s / odczytu 15 s, odstęp co najmniej 2 s. Każda próba używa nowej sesji; nie przenoszono cookies ani tokenów użytkownika. Nie zapisano treści odpowiedzi ani ofert w bazie. Materiał przeglądarkowy dostarczył właściciel: NFJ HTML i API, Bulldogjob .pl, theprotocol /praca — wszystkie HTTP 200. Nie kopiowano danych sesji z załączników.

## Wyniki

- **NFJ HTML i API:** bazowy klient 403, zmiana tylko User-Agent na Chrome 156 daje 200, powrót do bazowego klienta ponownie 403. Próby zmiany tylko Accept albo Accept-Language pozostają 403. Dla API także sam Content-Type, Origin lub Referer pozostaje 403. Zestaw nagłówków przeglądarkowych daje 200. W tej próbce User-Agent jest wystarczającą zmianą; nie ustalono reguły serwera ani trwałości zachowania. Nie jest konieczny pełny zestaw nagłówków ani cookies użytkownika.
- **NFJ Content-Type:** API zwróciło 200 i JSON także przy application/json z samym User-Agent Chrome. Podejrzenie, że konieczny jest application/infiniteSearch+json, nie potwierdziło się. Przy domyślnym User-Agent oba typy dostały 403. JSON miał m.in. postings, criteriaSearch, totalCount, totalPages. Nie weryfikowano kompletności ani semantyki filtrowania wyników.
- **Bulldogjob .pl:** wszystkie sześć prób 403; odpowiedzi zawierają cf-mitigated: challenge. Zmiana nagłówków w zbadanym zakresie nie wystarcza.
- **Bulldogjob .com:** wszystkie sześć prób 200, HTML zawiera __NEXT_DATA__, brak wykrytych znaczników challenge. Obecny wynik różni się od wcześniejszego 403. Nie potwierdzono równoważności zbioru ofert z domeną .pl ani przyczyny zmienności w czasie.
- **theprotocol /praca:** wszystkie sześć prób 403 i cf-mitigated: challenge. Sama zmiana User-Agent, Accept, języka ani ich zestawu z Sec-CH-UA/Sec-Fetch-* nie wystarcza.

Nie testowano kopiowania cookies, rozwiązywania challenge, TLS fingerprintu, HTTP/2, proxy, zmian adresu wyjściowego ani innych sposobów uzyskania sesji. IP, czas, stan sesji i transport pozostają potencjalnymi czynnikami; nie wskazano żadnego jako udowodnionej przyczyny. Próby nie były randomizowane i nie są gwarancją przyszłej dostępności. Zestaw combined nie odtwarza całej przeglądarki: zachowuje kompresję obsługiwaną domyślnie przez requests, pomija cookies, tokeny i analityczny nfj-global-context. Nie testowano osobno każdego nagłówka Sec-* ani kompresji.

## Odtwarzanie

Skrypt: [naglowki-http-probe.py](naglowki-http-probe.py). Uruchomienie w aktualnym kontenerze: `docker compose exec -T worker /opt/jobspy/bin/python - < docs/research/polskie-zrodla/naglowki-http-probe.py`. Skrypt wysyła 33 żądania i wypisuje wyłącznie metadane; ponowne uruchomienie to nowy test sieciowy. [Wyniki JSONL](naglowki-http-wyniki.jsonl) zawierają czas UTC, URL, zmienione nagłówki, status, rozmiar/hash odpowiedzi i wybrane niepoufne nagłówki. Dla API użyto parametrów i body od właściciela; PHP jest wyłącznie wartością próby, nie stałym zakresem adaptera.

## Macierz prób

| Cel | Próba | HTTP | Cloudflare challenge | Dane aplikacji |
| --- | --- | --- | --- | --- |
| nfj-html | baseline | 403 | — | — |
| nfj-html | ua | 200 | — | serverApp-state |
| nfj-html | accept | 403 | — | — |
| nfj-html | language | 403 | — | — |
| nfj-html | combined | 200 | — | serverApp-state |
| nfj-html | baseline-repeat | 403 | — | — |
| nfj-api | baseline | 403 | — | — |
| nfj-api | ua | 200 | — | JSON |
| nfj-api | accept | 403 | — | — |
| nfj-api | language | 403 | — | — |
| nfj-api | content-type | 403 | — | — |
| nfj-api | origin | 403 | — | — |
| nfj-api | referer | 403 | — | — |
| nfj-api | combined | 200 | — | JSON |
| nfj-api | baseline-repeat | 403 | — | — |
| bulldog-pl | baseline | 403 | challenge | — |
| bulldog-pl | ua | 403 | challenge | — |
| bulldog-pl | accept | 403 | challenge | — |
| bulldog-pl | language | 403 | challenge | — |
| bulldog-pl | combined | 403 | challenge | — |
| bulldog-pl | baseline-repeat | 403 | challenge | — |
| bulldog-com | baseline | 200 | — | __NEXT_DATA__ |
| bulldog-com | ua | 200 | — | __NEXT_DATA__ |
| bulldog-com | accept | 200 | — | __NEXT_DATA__ |
| bulldog-com | language | 200 | — | __NEXT_DATA__ |
| bulldog-com | combined | 200 | — | __NEXT_DATA__ |
| bulldog-com | baseline-repeat | 200 | — | __NEXT_DATA__ |
| theprotocol | baseline | 403 | challenge | — |
| theprotocol | ua | 403 | challenge | — |
| theprotocol | accept | 403 | challenge | — |
| theprotocol | language | 403 | challenge | — |
| theprotocol | combined | 403 | challenge | — |
| theprotocol | baseline-repeat | 403 | challenge | — |

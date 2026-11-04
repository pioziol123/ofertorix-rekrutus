# Indeed Polska — stan weryfikacji HTML

2026-11-02, zakres Senior PHP, Polska. Zgoda i limit wcześniej potwierdzone przez właściciela.

## Obserwacja live

Wykonano jedno żądanie GET `https://pl.indeed.com/jobs?q=Senior+PHP&l=Polska`, timeout 20 s, przekierowania wyłączone. Wynik: HTTP **403**, strona o tytule „Blocked - Indeed.com”, markery blokady Cloudflare/CAPTCHA. Nie wykonywano ponowień, logowania, CAPTCHA ani zmiany infrastruktury. Nie zapisano żadnych ofert z Indeed. Pełna odpowiedź nie jest fixture ani częścią repozytorium.

To wstępna próba dostępu do HTML, nie udany pilot nowego adaptera ani potwierdzenie poprawności selektorów względem aktualnych udanych odpowiedzi portalu. Dalszy pilot end-to-end pozostaje zadaniem `oferty-pracy-y81.5`; aktualne `JOBSPY_ENABLED=false`.

## Implementacja i ograniczenia

Osobna funkcja `collect_indeed_html` wykorzystuje DOM i JSON-LD, istniejący kontrakt, limiter HTTP i wspólną blokadę runnera. Nie wykonuje JS ani nie korzysta z GraphQL. Wersja paczki: `1.4.1+oferty.4`. Kolejny pilot powinien użyć paczki w workerze oraz zwykłej kolejki; dopiero po udanym odczycie ocenić dodatkowe oferty, kwalifikację PHP senior i braki danych.

Testy offline korzystają wyłącznie z syntetycznego HTML i podstawionego transportu, z rzeczywistą logiką limitów. Osobny tester sprawdził parser, pochodzenie płac, paginację, częściowe wyniki, blokady, zgody i 429. Wyniki końcowych kontroli zapisano w zadaniu Beads. Przejście tych testów nie usuwa blokady dostępu.

## Kontrole końcowe

Tester dodał 23 testy HTML oraz regresję wyboru adaptera w runnerze. Pełny zestaw forka: 77 testów; runner: 5 testów. Obejmują także zachowanie kart po błędnej paginacji i usunięcie nieaktualnych kwot po błędnej płacy w szczegółach. Kontrole aplikacji: 67 testów JobSpy, typecheck i lint. Wheel porównano bajtowo z 40 modułami lokalnego kodu i sprawdzono obecność licencji. Zmiany pozostają lokalne, bez commit/push.

## Eksperyment transportu z jobsniffer — 2026-11-03

W działającym workerze sprawdzono `curl_cffi 0.17.0`, `impersonate="chrome"`, bez proxy środowiskowego, automatycznych przekierowań i ponowień. Jeden GET wyszukiwania Senior PHP/Polska, timeout 20 s, wykonano pod wspólną blokadą `serialized_import` runnera, z odstępem co najmniej 1 s po przejęciu blokady. Wynik: **HTTP 403**, markery blokady obecne, brak `mosaic-provider-jobcards` i `data-jk`. Nie wykonano żądań szczegółów ani fallbacku GraphQL i nie zapisano ofert. Zapisano wyłącznie metadane diagnozy; odpowiedź nie weszła do repozytorium.

Zmiana fingerprintu TLS nie rozwiązała blokady w tym środowisku. Nie zmieniono produkcyjnego transportu ani paczki; źródło pozostaje wyłączone. Eksperyment `oferty-pracy-y81.15` zakończony, ale udany pilot adaptera i kryterium AC7 w `oferty-pracy-y81.8` nadal nie są spełnione.

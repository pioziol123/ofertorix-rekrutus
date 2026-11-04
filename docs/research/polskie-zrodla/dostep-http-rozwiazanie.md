# Działający odczyt Bulldogjob i theprotocol — 2026-11-03

## Wynik

**Z kontenera worker udało się odczytać oba portale: `bulldogjob.pl` i `theprotocol.it`.** Wystarczył istniejący w projekcie `curl_cffi 0.17.0`, profil Chrome lub Safari i HTTP/2. Nie używano przeglądarki, cookies/tokenów właściciela, proxy ani zewnętrznych solverów. To udana diagnostyka i próbka protokołu odczytu; nie wdrożono connectorów do aplikacji ani nie wykonano pełnego importu do bazy.

Łącznie 29 żądań HTTP w trzech sekwencyjnych seriach, odstępy co najmniej 2 s, timeout 20 s, bez redirectów i automatycznych retry. Każda próba miała świeżą sesję, `trust_env=False`. Skrypty zachowują wyłącznie podsumowania odpowiedzi i strukturę pól; pierwszy zapisuje publiczny stan Next.js tymczasowo wewnątrz kontenera, aby dalsze próby dobrały istniejące ID i buildId. Wyniki nie zawierają cookies. Czasy w wynikach to UTC.

## Co decyduje o wyniku w tej próbce

Dla obu chronionych domen:

| Transport | HTTP | Wynik |
| --- | --- | --- |
| requests, domyślne nagłówki | 1.1 | 403, `cf-mitigated: challenge` |
| requests z nagłówkami Chrome — wcześniejsza seria | 1.1 | 403, challenge |
| curl_cffi bez profilu przeglądarki | 2 | 403, challenge |
| curl_cffi, profil Chrome | 2 | 200, dane `__NEXT_DATA__` |
| curl_cffi, profil Safari | 2 | 200, dane `__NEXT_DATA__` |
| curl_cffi, profil Chrome, wymuszone HTTP/1.1 | 1.1 | 403, challenge |
| curl_cffi, profil Chrome, HTTP/2, powtórka w świeżej sesji | 2 | 200, dane `__NEXT_DATA__` |

Wynik wskazuje na znaczenie kombinacji profilu połączenia i HTTP/2. Nie wyizolowano konkretnego sygnału TLS/HTTP2, kolejności nagłówków lub innej reguły ochrony. Profil przeglądarki zmienia więcej niż jeden parametr. Próby nie były randomizowane; nie dowodzą trwałości ani działania z innego VPS/IP. W wynikach surowych `http_version: 3` oznacza enum curl **HTTP/2**, a `2` oznacza HTTP/1.1 — nie należy interpretować liczby 3 jako HTTP/3.

Minimalna konfiguracja sprawdzona w kontrolach:

```python
from curl_cffi import requests
from curl_cffi.const import CurlHttpVersion

with requests.Session(impersonate="chrome", trust_env=False) as session:
    response = session.get(
        "https://theprotocol.it/praca",
        http_version=CurlHttpVersion.V2_0,
        timeout=20,
        allow_redirects=False,
    )
```

W connectorze odpowiedź trzeba zweryfikować przed parsowaniem: status, brak `cf-mitigated: challenge`, obecność `__NEXT_DATA__`, kształt listy/szczegółu. Challenge oznacza błąd dostępu i niepełny przebieg, nigdy pustą listę lub wygaśnięcie ofert. Żądania nadal muszą przechodzić przez istniejącą kontrolę częstotliwości i budżetu.

## Walidacja danych

### Bulldogjob .pl

- Pierwsza strona: 50 ogłoszeń, `totalCount=1046`.
- `/companies/jobs/s/page,2`: 50 różnych ID, zero wspólnych z pierwszą stroną.
- `/companies/jobs/s/page,21`: 46 różnych ID. Zgodne z licznikiem 1046 w tej próbce, lecz bez przejścia stron 3–20 nie potwierdzono pełnego pokrycia.
- `/companies/jobs/s/skills,PHP/experienceLevel,senior`: 9 ogłoszeń, odwzorowany `slugState`.
- `/companies/jobs/s/skills,Go`: 36 ogłoszeń. Technologie i poziomy muszą pozostać parametrami adaptera.
- Szczegół ID pochodzącego z listy: 200, zgodne ID, stan published, daty, 1784 znaki wymagań, JSON-LD JobPosting. `offer` w tej konkretnej ofercie jest pusty; nie należy uznawać tego za brak całego opisu lub zakładać obligatoryjnego pola.
- Drugi szczegół (Devire): 200, `offer` 148 znaków, `requirements` 1786; `details` i `recruitmentProcess` null. Pusty lub null fragment trzeba traktować osobno od błędu pobierania.

### Bulldogjob .com nie jest równoważnym zamiennikiem .pl

W tym samym przebiegu .com miało `totalCount=1584`, .pl 1046. Na pierwszych stronach po 50 pozycji było 31 wspólnych ID, 19 występujących tylko na każdej z porównywanych stron. To nie jest pomiar pełnego pokrycia obu zbiorów, ale nie pozwala przyjąć ich równoważności. .com miało interfejs angielski, inny buildId i odpowiadało 200 także bez HTTP/2. Dla polskiego zakresu użyć działającej .pl.

### theprotocol.it

- Lista: 50 ogłoszeń w `offersResponse.offers`.
- `/praca?pageNumber=2`: 50 różnych ID, zero wspólnych z pierwszą stroną.
- `/praca?pageNumber=83`: 25 różnych ID, `page.count=83`, `offersCount=4125` w tej próbie. Bez przejścia stron pośrednich nie potwierdzono pełnej synchronizacji.
- `/filtry/go;t`: 27 ogłoszeń, potwierdzone `expectedTechnologies` w filtrze. Zakres jest konfigurowalny.
- Szczegół wybrany z pierwszej strony: zgodne ID, siedem sekcji tekstowych, technologie, `publicationDetails`, JSON-LD JobPosting.
- Szczegół zawiera również `offersResponse` listy — nie pomylić go z właściwym `pageProps.offer` podczas parsowania.

## Dodatkowy wariant Next.js JSON

Próba `/_next/data/{buildId}/companies/jobs.json` na Bulldogjob .pl dała 404 HTML. Odpowiednik `/_next/data/{buildId}/praca.json` na theprotocol dał 404 JSON. Warianty były wyprowadzone z buildId faktycznie zwróconego na stronie; nie potwierdzono dostępnego kontraktu tego kanału. Działający odczyt pozostaje HTML → `__NEXT_DATA__`. Nie ma potrzeby uzależniać connectora od tych nieudanych adresów ani dalej szukać alternatyw tylko dla usunięcia obecnego 403, ponieważ odczyt HTML już działa.

## Materiał i odtwarzanie

[dostep-http-proby](dostep-http-proby/) zawiera trzy skrypty i trzy pliki JSONL. Uruchamiać skrypty kolejno w tym samym kontenerze:

```sh
docker compose exec -T worker /opt/jobspy/bin/python - < docs/research/polskie-zrodla/dostep-http-proby/transport-probe.py
docker compose exec -T worker /opt/jobspy/bin/python - < docs/research/polskie-zrodla/dostep-http-proby/access-validation.py
docker compose exec -T worker /opt/jobspy/bin/python - < docs/research/polskie-zrodla/dostep-http-proby/nextdata-probe.py
```

`access-validation.py` korzysta z próbek w `/tmp` zapisanych przez pierwszy skrypt. Numery ostatnich stron są wartościami tej próby; produkcyjny connector powinien wyprowadzać je z aktualnego licznika. Ponowne uruchomienie oznacza nowe żądania, nie test offline. Weryfikacja lokalnych artefaktów: parsowanie trzech skryptów, wszystkich 30 rekordów JSONL (29 odpowiedzi + porównanie domen), kontrola statusów i zgodności ID.

Następny etap wdrożenia: wspólna ograniczona warstwa curl_cffi, parsery list/szczegółów z walidacją kontraktu, paginacja i testy niepełnych przebiegów. Nie są potrzebne zależności od przeglądarki lub sesji właściciela na podstawie obecnego wyniku.

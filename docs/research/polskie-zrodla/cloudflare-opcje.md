# Cloudflare: diagnoza i opcje dla konektorów

Stan dokumentacji: 2026-11-03. Wyłącznie źródła pierwotne; ten research nie wykonywał nowych prób pobierania chronionych portali.

## Co potwierdza obecny wynik

Przekazany wynik wcześniejszego testu: `bulldogjob.pl/companies/jobs` i `theprotocol.it/praca` odpowiadały `403` z `cf-mitigated: challenge`, również po ustawieniu nagłówków Chrome. `bulldogjob.com` odpowiadał `200`, a w No Fluff Jobs wystarczył inny User-Agent. To obserwacje pojedynczych żądań z wcześniejszego testu, nie gwarancja trwałej dostępności ani dowód rozwiązania problemu we wszystkich konektorach.

Cloudflare dokumentuje `cf-mitigated: challenge` jako identyfikator strony challenge zamiast oczekiwanej odpowiedzi. Jej typ treści to `text/html`, również gdy żądano innego zasobu. Sam status `403` nie wystarcza do tak precyzyjnej diagnozy. Źródło: [Detect a Challenge Page response](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/).

**Wniosek:** odpowiedź challenge nie dostarcza ogłoszeń źródłowych. Nie jest podstawą do uznania ich za wygasłe; przebieg synchronizacji należy oznaczyć jako niepełny.

## Co może pomóc i jakie ma ograniczenia

| Opcja | Co rzeczywiście wnosi | Ograniczenie |
|---|---|---|
| Poprawny User-Agent i spójne nagłówki | Mogą usunąć prostą przyczynę odmowy. | W omawianych dwóch przypadkach nie wystarczyły. Nagłówki nie zapewniają środowiska przeglądarki ani wykonania JavaScript. |
| `curl_cffi` / impersonacja | Projekt odtwarza sygnatury TLS oraz HTTP/2 przeglądarek; to więcej niż zmiana User-Agent. | Autorzy wprost uzależniają powodzenie od konfiguracji ochrony: TLS/HTTP2 to tylko część sygnałów, obok IP, częstotliwości i fingerprintów JS. Nie ma gwarancji obsługi tych portali. |
| Zwykła przeglądarka użytkownika | Cloudflare wymaga włączonego JavaScript i cookies do przejścia challenge. | Udane ręczne otwarcie strony nie potwierdza działania bezobsługowego konektora. |
| Automatyzacja przeglądarki | Zapewnia silnik JS i środowisko renderowania strony. | Cloudflare nie wspiera automatycznych przeglądarek ani Selenium/Puppeteer/Playwright/Cypress do rozwiązywania produkcyjnych challenge. Nie jest to pewne rozwiązanie. |
| Wyjątek uzgodniony z właścicielem portalu | Operator może wyłączyć challenge dla uzgodnionego klienta, np. dopuszczonego IP, przez odpowiedni wyjątek lub regułę Skip. | Wymaga współpracy operatora oraz dopasowania wyjątku do produktu, który blokuje ruch. |

Źródła tabeli: [curl_cffi — opis możliwości](https://curl-cffi.readthedocs.io/en/latest/), [curl_cffi — FAQ o Cloudflare](https://curl-cffi.readthedocs.io/en/latest/faq.html), [Cloudflare — Resolve a Challenge](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/resolve-challenge/), [Supported browsers](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/), [Troubleshooting i wyjątki](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/).

## Najbardziej przewidywalna ścieżka

**Rekomendacja projektowa:** dla źródła objętego challenge najpierw ustalić z portalem dostępny API/feed lub zgodę i warunki dostępu dla konektora. Sam dostęp techniczny nie rozstrzyga warunków dalszego wykorzystania danych. Jeśli portal dopuszcza pobieranie, uzgodnić odpowiedni wyjątek po stronie operatora, zamiast przyjmować, że zmiana biblioteki zapewni stałą dostępność.

Cloudflare wskazuje, że tylko właściciel witryny może zmienić konfigurację tak, by challenge przestał być prezentowany. Reguła Skip powinna poprzedzać blokującą regułę i pomijać właściwą warstwę ochrony. Skip obsługuje m.in. Managed Rules, rate limiting i Super Bot Fight Mode; **nie pozwala pominąć Bot Fight Mode**. Źródła: [Resolve a Challenge](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/resolve-challenge/), [Configure a Skip rule](https://developers.cloudflare.com/waf/custom-rules/skip/), [Available skip options](https://developers.cloudflare.com/waf/custom-rules/skip/options/).

Do czasu uzgodnienia dostępu: zachować wcześniej pobrane dane, zgłaszać blokadę źródła i nie interpretować braku wyników jako pełnej synchronizacji. To rekomendacja obsługi błędu w projekcie, nie metoda usunięcia challenge.

## Czy pozostałe konektory już to rozwiązały?

Lokalny pakiet [JobSpy 1.4.1+oferty.4](../../../integrations/jobspy/python_jobspy-1.4.1+oferty.4-py3-none-any.whl) zawiera różne mechanizmy dostępu (numery linii odnoszą się do plików wewnątrz archiwum wheel):

- `jobspy/util.py:77–84`: `TLSRotating` korzysta z `curl_cffi` z `impersonate="chrome"`; używają go Glassdoor (`jobspy/glassdoor/__init__.py:53`) i ZipRecruiter (`jobspy/ziprecruiter/__init__.py:39`).
- LinkedIn korzysta z `RequestsRotating(..., clear_cookies=True)` (`jobspy/linkedin/__init__.py:52`) i endpointu `jobs-guest` (`:71`).
- Indeed wskazuje `https://apis.indeed.com/graphql` (`jobspy/indeed/__init__.py:41`) i przy włączonej polityce kontroli używa `ControlledRequests` (`:61`).

To potwierdza obecność impersonacji TLS w części konektorów i używanie odmiennych endpointów w innych. **Nie potwierdza uniwersalnego rozwiązania challenge Cloudflare.** Wynik `200` dla innego portalu lub domeny również tego nie dowodzi. Potwierdzenie działania konkretnego konektora wymaga udanego pobrania rzeczywistej listy i szczegółów ogłoszeń; aktualny test pozostaje odrębny od gwarancji trwałej dostępności.

## Aktualizacja: działający transport curl_cffi

2026-11-03 potwierdzono odczyt Bulldogjob **.pl** i theprotocol z kontenera przez curl_cffi z profilem Chrome/Safari i HTTP/2, bez cookies właściciela. Lista, druga i ostatnia strona, filtr oraz szczegół zwróciły 200 i dane aplikacji. Zwykły requests, zwykły curl HTTP/2 oraz profil Chrome wymuszony na HTTP/1.1 nadal otrzymały challenge. Wcześniejsza blokada techniczna została rozwiązana w próbce diagnostycznej. [Wyniki, ograniczenia i reproduktory](dostep-http-rozwiazanie.md). Connectorów i pełnego importu jeszcze nie wdrożono.

# Kwalifikacja runtime i izolacji Chrome

Status: **specyfikacja gotowa do wykonania przez agenta**, 2026-11-05. Beads `oferty-pracy-334.21`. To część przygotowania integracji, bez uruchomionych testów live. Kontrakty produktu: [LA-07–21](requirements.md); techniczne: [runtime](kontrakty-runtime.md). Zadanie nie jest benchmarkiem jakości LLM ani zgodą na globalną instalację.

## Cel i zależności

Przed etapami 7/8 ustalić odtwarzalny zestaw wersji i sprawdzić właściwości, których nie gwarantuje samo API. Próby protokołu/izolacji mogą korzystać z syntetycznej sesji, atrap modelu i kontrolowanych testowych stron. Nie potrzebują implementacji całego researchu. Integracyjne T02 i T05 pozostają odpowiednio w etapach 5/8 i 7/8; kwalifikacja ich nie zastępuje.

Etap 7 zależy od 5 i tego zadania; etap 8 od 4/5/7. Etapy 1–6 mogą być implementowane bez wyniku kwalifikacji przeglądarki. Niedziałające wymagane zabezpieczenie blokuje publiczny research, nie uzasadnia obniżenia LA-09.

## KR-AC01 — Wersje i kontrakty

Punkt startowy do sprawdzenia (nie deklaracja zgodności całego zestawu):

| Zależność | Wersja bazowa | Źródło sprawdzone 2026-11-05 |
| --- | --- | --- |
| Ollama | 0.40.14 | [release](https://github.com/ollama/ollama/releases/tag/v0.40.14), [typy chat](https://github.com/ollama/ollama/blob/v0.40.14/api/types.go). |
| OpenCode | 1.19.5 | [release](https://github.com/anomalyco/opencode/releases/tag/v1.19.5), [typy SDK](https://github.com/anomalyco/opencode/blob/v1.19.5/packages/sdk/js/src/gen/types.gen.ts); autorytatywny kontrakt uruchomionej wersji z /doc. |
| chrome-devtools-mcp | 1.12.0 | [release](https://github.com/ChromeDevTools/chrome-devtools-mcp/releases/tag/chrome-devtools-mcp-v1.12.0), [konfiguracja](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/chrome-devtools-mcp-v1.12.0/docs/configuration.md). |
| Google Chrome for Testing, unified headless | 157.0.8103.38, Linux x64 | [Oficjalny manifest Stable](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json), odczyt 2026-11-05. Obraz/binarium i hash utrwala wykonawca kwalifikacji. |

Wynik: projektowany `config/local-ai/runtime-lock.json`, wersja schematu 1, dokładne wersje i platforma/architektura, źródło oraz SHA-256 binariów/pakietów/obrazu, skrót /doc i schematów tools/list, parametry kontekstu, konfiguracja zabezpieczeń i wyniki. Nie wpisywać fikcyjnych digestów teraz. Start sprawdza rzeczywistą wersję; zmiana wersji wymaga ponowienia odpowiednich prób, nie cichej aktualizacji przez `latest`/`npx -y ...@latest`. Manifest nie zawiera sekretów.

T01: sprawdzić health i /doc, create/list z korelacją i directory, trwały message ID, utratę odpowiedzi po start/resume, odczyt wiadomości i brak domniemanej idempotencji. Wystarcza atrapa modelu; jeżeli realny runtime wymaga technicznej inferencji do dowodu protokołu, użyć syntetycznego wejścia, bez danych właściciela i oceny jakości. Nie zapisywać PASS na podstawie samego wygenerowanego typu SDK.

## KR-AC02 — Wybór i dowód izolacji sieci

**Wybrany projekt techniczny po sugestii właściciela:** headless Chrome w kontenerze, dostępny dla Chrome DevTools MCP przez prywatny kanał. Podgląd i ręczna interwencja w tej samej sesji przez gotowy frontend DevTools. Nie uruchamiamy natywnego Chrome do pracy agenta i nie zmieniamy sieci osobistego macOS. Zachowujemy funkcjonalny wymóg ręcznej obsługi blokady; nie wycofujemy interwencji tylko dlatego, że Chrome pracuje bez okna. Kwalifikacja ma potwierdzić działanie tego podglądu, bez gwarancji rozwiązania dowolnej CAPTCHA.

Wariant do kwalifikacji: dedykowany kontener Linux dla Google Chrome w nowym trybie headless (nie stary headless-shell). Na Apple Silicon bazowy Linux x64 może wymagać emulacji Docker; zapisać platformę i ograniczenia techniczne, nie pobierać innego obrazu ani Chromium po cichu. Podgląd przez prywatny DevTools dostępny wyłącznie właścicielowi. Przeglądarka i jej procesy sieciowe mają wydzieloną przestrzeń sieci z domyślną odmową ruchu; jedyne wyjście danych WWW prowadzi przez kontrolowane proxy. Proxy rozwiązuje DNS i łączy się wyłącznie ze sprawdzonym publicznym adresem; odrzuca localhost, private, link-local, multicast, reserved i adresy metadanych, także IPv4-mapped IPv6. Sprawdzenie i connect dotyczą tego samego IP, bez ponownego niezależnego DNS po walidacji. CONNECT wyłącznie do publicznego HTTP(S), bez dostępu do administracyjnych endpointów proxy. Każde nowe połączenie/redirect jest sprawdzane; brak proxy blokuje sieć.

Kanał sterujący MCP/CDP i wyświetlania musi być odseparowany od dostępu stron. Preferowane pipe/Unix socket lub osobna sieć procesu sterującego; nie otwierać przeglądarce wyjątku na cały host/DB/Ollamę/OpenCode. Loopback i port CDP/VNC są częścią testu: sama sieć Docker internal nie blokuje loopback kontenera. Jeżeli wybrany launcher MCP nie obsługuje takiego rozdzielenia, najpierw rozwiązać to technicznie w kwalifikacji, nie udawać izolacji na podstawie flag Chrome.

Wybrany mechanizm egzekwowania: reguły nftables wewnątrz dedykowanej przestrzeni sieci kontenera, obejmujące IPv4/IPv6 oraz loopback i wszystkie procesy Chrome pod dedykowanym UID. Domyślnie deny dla nowych połączeń, jedyny wyjątek wychodzący to IP/port proxy; odpowiedzi na zaufane przychodzące połączenie CDP dopuszcza established/related. Nie ma wyjątku na host.docker.internal, DB, OpenCode, Ollamę ani lokalny port CDP. Launcher ustawia reguły przed startem Chrome, sprawdza ich obecność i zrzuca uprawnienia. Chrome działa bez CAP_NET_ADMIN i jako użytkownik nieuprzywilejowany z sandboxem; brak sandboxu nie jest obchodzony flagą --no-sandbox. Kontener nie ma docker.sock ani prywatnych katalogów właściciela. Zmiana reguł wymaga zaufanego launchera, nie narzędzia modelu. Sam proxy argument lub URLBlocklist nie stanowi zabezpieczenia.

[Chromium opisuje](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md) niejawne omijanie proxy dla loopback/link-local. To potwierdza, dlaczego sama flaga proxy nie stanowi dowodu izolacji. Flagi są dodatkowym ustawieniem; egzekwowanie ruchu nie zależy od poprawnego zachowania strony.

T04 minimalne próby, obserwowane także po stronie docelowego serwera: prywatny URL, loopback hosta i kontenera, IPv6, IPv4-mapped IPv6, DNS rebinding, redirect, iframe, obraz/script/CSS, service worker, WebSocket, WebRTC/UDP i próba bez proxy. Sprawdzić również dostęp do portów administracyjnych, file URL, awarię proxy i nową kartę/pop-up. Dla zabronionego celu licznik połączeń/żądań ma pozostać zero. Testy używają kontrolowanych endpointów i izolowanej sieci, nie skanują sieci właściciela. Zwykły błąd UI bez obserwacji sieci nie wystarcza.

## KR-AC03 — Konteksty, uprawnienia i trwałość

T03: dwa kolejne execution ID mają osobne directory, konfigurację i Chrome; wznowienie tego samego zachowuje cookies/karty. Kontekst mostu jest niezmienny, po utracie generation nie rozpoczyna nowej akcji. Próba użycia cudzej karty/ID, pozostawionego mostu i domyślnych narzędzi plików/bash/delegacji ma być technicznie odrzucona. Sposób zakończenia procesów i disposal nie usuwa sesji ani archiwum.

OpenCode: oddzielne katalogi danych/config/cache i środowisko bez osobistych kont, kluczy, pluginów i MCP. Sam OPENCODE_CONFIG_DIR nie stanowi izolacji — [dokumentacja](https://opencode.ai/docs/config/#custom-directory) opisuje go jako dodatkową warstwę konfiguracji. Test sprawdza brak dziedziczenia. Nie modyfikować HOME właściciela; używać osobnego konta/środowiska i właściwych katalogów XDG. Wyłączyć automatyczne aktualizacje, udostępnianie, delegację, pozostałe narzędzia, automatyczne naprawianie JSON i niejawne zmniejszanie wejścia; konieczne parametry sprawdzić w przypiętej wersji, nie zgadywać nazw.

## KR-AC04 — Wynik, instrukcja i obsługa niepowodzenia

Dostarczyć manifest, konfiguracje/launchery projektowe, testowe scenariusze i raport `docs/specs/lokalne-ai/kwalifikacja-wynik.md` z dowodami, odtwarzalną instrukcją oraz realnymi ograniczeniami. Nie tworzyć raportu sukcesu przed testami. Dokładne digesty/config mogą powstać dopiero podczas wykonania zadania. Nie potrzebujemy własnego silnika Chrome ani agenta.

Przy braku usługi/uprawnień lub negatywnym teście: wynik BLOCKED/FAIL z konkretnym scenariuszem, zadanie pozostaje otwarte i blokuje 7/8. Jeśli potrzebna jest zmiana zakresu, wrócić z konkretnym wynikiem i wariantem do właściciela. Samo wpisanie blokera nie spełnia kryterium zamknięcia. Odczyt oficjalnej dokumentacji w przygotowaniu nie dowodzi lokalnej sprawności wersji.

## Kanał headless i ręczna interwencja

Chrome uruchamiany z jawnym profilem per execution i portem debugowania w prywatnej sieci sterującej. Chrome DevTools MCP 1.12.0 łączy się przez `--browser-url` albo `--ws-endpoint`; nie używa autoConnect. [Referencja przypiętej wersji](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/chrome-devtools-mcp-v1.12.0/docs/configuration.md) opisuje oba transporty. Most nadal filtruje tools/list i tools/call oraz archiwizuje wynik przed modelem. Nie otrzymuje uprawnień do osobistego Chrome.

Gateway kanału sterowania ma osobne poświadczenie, weryfikację Origin i autoryzację istniejącej aplikacji dla podglądu właściciela; surowego CDP nie publikować na interfejsach hosta ani w publicznej sieci. Prywatny port samego Chrome może być osiągalny wyłącznie ze sterującego kontenera. Strony renderowane przez Chrome nie mogą nawiązywać nowego połączenia do tego portu — reguły OUTPUT dla UID Chrome blokują także loopback. Test T04 musi to wykazać, nie polegać na samej ochronie przeglądarki przed local network access.

Po request_intervention model nie wykonuje dalszych akcji. Panel daje właścicielowi uwierzytelniony odnośnik do gotowego DevTools z podglądem/input tej konkretnej karty, bez budowy własnego silnika interakcji. Po ręcznym rozwiązaniu właściciel wybiera Wznów. Cookies, target ID, execution ID i sesja pozostają te same. Brak podglądu/utracona karta jest jawnym błędem, nie nową sesją. Zakres interwencji pozostaje publiczny, bez logowania.

[Chrome opisuje unified headless](https://developer.chrome.com/docs/automation-and-testing/headless), a [DevTools opisuje zdalne połączenie z inną instancją i przełączanie wejścia](https://developer.chrome.com/docs/devtools/remote-debugging/local-server/). To podstawa projektu; działający podgląd/input z kontenera, routing WebSocket i ochronę uprawnień trzeba potwierdzić na przypiętym zestawie. Jeżeli gotowy DevTools nie obsłuży wymaganej interwencji, wynik kwalifikacji jest FAIL/BLOCKED; nie zastępować go samym screenshotem i nie usuwać PZ/LA-15.

Podgląd ręczny jest udostępniany wyłącznie właścicielowi dla oczekującej interwencji, z powiązaniem execution/target i poświadczeniem czasowym. Przed resume zamknąć ręczny dostęp do sterowania, aby użytkownik i model nie wykonywali akcji równolegle. Nie wolno użyć DevTools właściciela do obejścia ochrony sieci Chrome. Powstające podczas interwencji odczyty nadal podlegają kontroli źródeł i archiwizacji przed użyciem jako dowód.

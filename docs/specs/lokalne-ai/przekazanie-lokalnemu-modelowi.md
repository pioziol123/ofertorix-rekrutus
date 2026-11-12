# Przekazanie wdrożenia lokalnemu modelowi

Pakiet wykonawczy po zatwierdzonym grill-me, 2026-11-05. Cały epik udostępniamy jako jedno wdrożenie; etapowanie dotyczy pracy i testów, nie osobnych wydań. Specyfikacja po przeglądzie wykonawczym 334.19/20 jest przygotowana do pracy etapami; nie jest dowodem ukończenia etapów ani działania usług. Stan zadań i zależności odczytuj z Beads, nie z tego dokumentu. Zakres niniejszej sesji obejmuje dokumentację, bez zmian kodu produkcyjnego i uruchamiania usług.

## Wejście do projektu

1. Przeczytaj `AGENTS.md`, `docs/agents/domain.md` i wskazane tam dokumenty. Następnie `docs/agents/issue-tracker.md`, uruchom `bd prime` i `bd context --json`. Nie importuj `.beads/issues.jsonl` ani nie synchronizuj Dolt zdalnie.
2. Sprawdź bieżący `git status` i istniejące zmiany. Przy przygotowaniu tego pakietu istniały niezacommitowane `lib/ai/` i zmiany `lib/profile/ai.ts` pochodzące z innej pracy. Nie usuwaj ich ani nie zakładaj, że etap 1/2 trzeba pisać od zera. Sprawdź implementację względem kryteriów, uzupełnij brakujące części i dopiero wtedy potwierdź wykonanie.
3. Odczytaj `bd show oferty-pracy-334` i dzieci. Wybierz najwcześniejszy niewykonany etap, którego zależności i przegląd są spełnione; przeczytaj jego parę Requirements/SD oraz wskazane zależne kontrakty. Pierwsze zadanie to `oferty-pracy-334.2`; nie rozpoczynaj ponownego planowania epiku. Zajmij zadanie w Beads. Brak blockerów kolejności nie zastępuje przeglądu specyfikacji i kodu.
4. Przy zmianach zachowania stosuj projektowy workflow `implement-with-tester`. Nie wykonuj całych dziewięciu etapów w jednej zmianie. Po etapie zapisz wynik sprawdzeń, pozostałe braki i rzeczywisty status w Beads.

## Dokumenty według potrzeby

| Gdy pracujesz nad | Przeczytaj |
| --- | --- |
| Zakresem, konfiguracją lub zmianą dostawcy | [PRD](PRD.md), [LA-01–LA-21](requirements.md). |
| Najbliższym etapem | Odpowiednią parę z [indeksu dziewięciu etapów](README.md#requirements-i-sd-każdego-etapu). |
| Kolejką/komendami direct lub recovery od etapu 5 | [Kontrakty runtime](kontrakty-runtime.md) oraz właściwe SD 5/6. |
| Agentem, dowodami i Chrome | [Kwalifikacja](kwalifikacja-runtime.md), kontrakty runtime i SD 7/8. |
| Panelem i komendami | [Requirements panelu](features/panel-zadan/requirements.md), [SD panelu](features/panel-zadan/solution-design.md). |
| Odbiorem i uruchomieniem lokalnym | Etap 9 oraz T01–T05 w kontraktach runtime; wyniki techniczne zapisuj z wersjami. |

## Kolejność i granice zmian

| Etap / Beads | Wynik, który kończy etap |
| --- | --- |
| 1 / `334.2` | Wspólna konfiguracja i budżet bez zależności od profilu, bez zmiany zachowania. Uwzględnić zastane wydzielenia. |
| 2 / `334.3` | Profil wywołuje `StructuredModel`; OpenAI nadal daje zgodne wyniki i rozliczenie. |
| 3 / `334.4` | Budowanie, walidacja i publikacja oceny oddzielone od cyklu OpenAI Batch. |
| 4 / `334.5` | Research OpenAI za `ResearchExecutor`, zachowane oba wywołania i accounting także przy błędzie. |
| 5 / `334.6` | Lokalny profil przez natywne API Ollamy, konfiguracja `.env`, model obecny w `/api/tags`, koszt API zero. |
| 6 / `334.7` | Lokalne oceny, grupy do 20, wyniki niezależne i bez podwójnej publikacji. |
| Kwalifikacja / `334.21` | Manifest przypiętych wersji, headless Chrome w kontenerze, prywatny DevTools/input, nftables/proxy i dowody izolacji; bez benchmarku modelu. |
| 7 / `334.8` | Po etapie 5 i kwalifikacji: Chrome DevTools MCP z kontrolowanym mostem, dowodami i izolacją; techniczne T03–T05, bez własnego silnika przeglądarki. |
| 8 / `334.9` | OpenCode HTTP, sesje i globalna wspólna kolejka jednej lokalnej pracy AI, recovery i wynik walidowany przez domenę; techniczne T01/T02. |
| Panel / `334.15` | Widoki AI i check/stop/skip/retry/resume, oddzielny stan runtime, historia i blokada publikacji. Pełna integracja po 6 i 8. |
| 9 / `334.10` | Odbiór całości z panelem, migracje na kopii i instrukcja uruchomienia/cofnięcia konfiguracji nowych zleceń. |

Pełne ID zadań mają prefiks `oferty-pracy-`. Rzeczywiste zależności sprawdzaj w Beads; [mapa zależności](README.md#kolejność-wynikająca-z-zależności) wyjaśnia ich uzasadnienie. Sam porządek ID lub aktualizacji listy nie jest kolejnością implementacji. W etapie 8 interwencję można testować przez kontrakt komend bez gotowego UI panelu; nie tworzy to zależności cyklicznej. Panel jest osobnym zadaniem, nie zmianą numeracji dziewięciu etapów.

## Zasady, których implementacja ma pilnować

- `gpt-oss:20b` lokalnie. Profil/oceny bezpośrednio Ollama, research OpenCode. Bez automatycznego pobierania modelu i fallbacku do chmury.
- Jedno aktywne lokalne wykonanie AI w całej instalacji (profil, pojedyncza ocena albo research). Kolejne czeka także podczas interwencji lub unknown. Wspólny slot obejmuje także bezpośrednie inferencje profilu i ocen; OpenAI nie zajmuje lokalnego slotu.
- Bez kwot lokalnych tokenów, rund i stałego deadline całej pracy. Lease i timeout pojedynczego transportu nie mogą po cichu kończyć długiego zadania albo uruchamiać duplikatu.
- Jawne retry od razu odbiera poprzedniemu wykonaniu publikację i zapisuje nowe w kolejce. Start czeka na potwierdzony koniec starego agenta. Późny wynik zapisujemy do wglądu.
- Google przez dedykowany headless Chrome w kontenerze i Chrome DevTools MCP, z prywatnym DevTools do podglądu i ręcznej interwencji. Publiczne strony bez logowania; nowy profil per wykonanie, wznowienie w tym samym stanie, bez prywatnego Chrome właściciela.
- Zapis dowodów przed przekazaniem do modelu. Bezterminowa retencja zebranych danych, brak sekretów w archiwum; nie usuwaj historii, żeby uruchomić czysty profil.
- Zachowaj OpenAI/Batch i historyczne migawki. Zmiana konfiguracji wpływa wyłącznie na nowe zlecenia. Budżet usług płatnych nie blokuje lokalnego kosztu zero.
- Brak benchmarku jakości odpowiedzi. Weryfikacja techniczna i domenowe walidatory są wymagane; jakość użytkownik ocenia w normalnym użyciu.

## Weryfikacja i zakończenie etapu

Przed implementacją odczytaj bieżące skrypty `package.json` i sposób uruchomienia PostgreSQL. Użyj istniejących testów jako regresji; dodaj testy nowych stanów, wyścigów i błędów zgodnie z mapowaniem kryteriów w SD. Testy integracyjne uruchamiaj na izolowanych schematach zgodnie z projektem, nie na danych właściciela. Gdy zależność jest niedostępna, zapisz dokładny brak i zakres niewykonanego sprawdzenia.

Przy odbiorze wykonaj `pnpm check` i projektowy build oraz wymagane integracje. Samo przejście atrap HTTP nie zamyka T01–T05. Nie instaluj globalnie usług ani nie modyfikuj osobistej konfiguracji narzędzi w celu obejścia problemów testowych. Kwalifikacja przygotowuje projektowe manifesty/launchery i dowody na wydzielonym środowisku; wymagające uprawnień czynności operatora przedstaw jako konkretną instrukcję. Przygotuj konfigurację i instrukcję w repo; uruchomienie nie może po cichu podpiąć kont, kluczy i MCP właściciela.

Zakończenie etapu: kryteria z właściwej pary spełnione i wyniki zapisane w Beads; braki mają konkretne zadania lub opis blokera. Zmiany istotnego zachowania odzwierciedlone w wymaganiach i SD. Nie zamykaj zadania na podstawie samej obecności pliku. Nie wykonuj git commit/push ani zdalnego Dolt sync bez upoważnienia użytkownika.

## Gotowy komunikat rozpoczynający implementację

> Pracuj w repozytorium `oferty-pracy`. Wdrożenie lokalnego AI realizuj etapami zgodnie z `docs/specs/lokalne-ai/przekazanie-lokalnemu-modelowi.md`. Najpierw odczytaj AGENTS i Beads oraz sprawdź istniejące zmiany. Zacznij od najwcześniejszego niewykonanego etapu z gotowymi zależnościami; nie przepisuj zastanego `lib/ai/`. Realizuj jego Requirements/SD i zweryfikuj kryteria. Zachowaj zatwierdzone `gpt-oss:20b`, OpenCode, Chrome DevTools MCP, wspólną kolejkę jednej lokalnej pracy AI i bezterminową historię. Po etapie zapisz wyniki w Beads i przedstaw zmiany oraz walidację. Nie commituj, nie pushuj i nie synchronizuj zdalnie Dolt.

## Migawka techniczna przy przygotowaniu pakietu

2026-11-05: konfiguracja i budżet nadal w `lib/profile/ai.ts`, brak docelowych `lib/ai/configuration.ts` i `budget.ts`. Kontrakt StructuredModel i adapter OpenAI istnieją w zmianach roboczych, profil częściowo z nich korzysta; normalizację wyniku/błędów trzeba zweryfikować względem etapu 2. Nie ma jeszcze zależności SDK OpenCode/Ollama ani konfiguracji runtime/Chrome w Compose.

Compose rozdziela web i worker od usług hosta; istnieją db/migrate/web/worker/tools. Bieżący `pnpm check` obejmuje lint, typecheck i Vitest; build jest osobnym sprawdzeniem. Te informacje należy odświeżyć przy starcie etapu. Nie stosować hostowego localhost jako adresu usług wewnątrz kontenera.

## Obowiązujące uzupełnienie po grill-me

Wdrażaj cały epik razem z panelem. Wspólny slot i kolejkę dodaj już dla profilu w etapie 5, następnie użyj ich w ocenach i OpenCode; nie twórz osobnego slotu dla researchu. Jednostką oceny jest pojedyncza oferta; grupa do 20 ma osobne żądania i wyniki. Ręczne retry kopiuje stare wejście, instrukcje, schemat i konfigurację; nie czyta nowego profilu lub `.env`. Błędnej odpowiedzi nie naprawiaj nową automatyczną generacją.

Narzędzia publiczne nie otrzymują danych właściciela. Snippet Google nie jest dopuszczalnym dowodem twierdzenia. Sprawdzaj kategorie z ustaleniami lub niewiadomymi; blokada strony oznacza próbę innych publicznych źródeł. Bez logowania; interwencja tylko gdy dalsza publiczna praca jest zablokowana. Chrome można sprzątnąć po końcu i zapisie materiałów; trwałej historii nie usuwaj.

Aplikacja może pokazać awarię i kontrolować własne zadanie, ale nie restartuje/naprawia usług. Przygotuj instrukcję ręcznego restartu OpenCode/Chrome/Ollamy i potwierdzania końca niepewnego wykonania przed zwolnieniem slotu. Health sam nie jest potwierdzeniem. Logowanie i parkowanie sesji realizuje dopiero przyszłe `oferty-pracy-281`. Normatywne kryteria: LA-11/13 i LA-16–LA-21.

## Kolejność po przeglądzie całego pakietu

Dla jednego agenta: **1 → 2 → 3 → 4 → 5 → 6 → kwalifikacja 334.21 → 7 → 8 → panel → 9**. Native profile/matching używają wspólnego slotu już w 5/6; kwalifikacja Chrome nie jest powodem odkładania tych etapów. Rzeczywisty graf i stan zawsze odczytaj z Beads. Etykieta ready-for-agent oznacza gotową specyfikację, nie wykonane zależności i nie pozytywny wynik live.

Przejrzane SD 2–6 rozstrzygają neutralny model, typowane błędy, wstrzykiwanie, walidację/publikację, accounting, format env i migracje, parent API i stan unknown. Nie projektuj tych kontraktów od nowa. Wersje bazowe i zabezpieczenia headless są określone w kwalifikacji; rzeczywiste hashe i /doc powstają w jej wykonaniu. Nie zamykaj jej ani 7/8 na podstawie samych dokumentów.

Każde zadanie kończy się dowodem przypisanych kryteriów w Beads. Dla sprawdzeń aplikacji użyj środowiska projektu:

```sh
docker compose run --rm tools pnpm check
docker compose run --rm tools pnpm build
docker compose run --rm -e RUN_INTEGRATION=1 tools pnpm test
```

Odśwież skrypty/Compose przy starcie; te komendy wymagają działającego Dockera i zainicjalizowanego środowiska testowego. Integracje używają izolowanych schematów, nigdy danych właściciela. Skipped/blocked nie oznacza PASS. Testy HTTP zależne od build uruchamiaj po świeżym build. Przed zamknięciem epiku wymagany jest [odbiór 9](etapy/09-odbior/solution-design.md), wszystkie LA/PZ/E/KR/T z dowodami, bez niesprawdzonych deklaracji sukcesu.

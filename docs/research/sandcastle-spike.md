# Spike: Sandcastle jako sandbox dla runnera agentów

Data: 2026-11-15. Wersja: `@ai-hero/sandcastle` 0.14.0. Branch: `spike/sandcastle`.

## Pytanie

Czy Sandcastle nadaje się na warstwę izolacji dla `scripts/agent-runner.ts`, tak żeby agent pracował bez nadzoru z pełnymi uprawnieniami w środku, ale bez dostępu do danych właściciela, jego stacku i `master`?

## Wybór dostawcy sandboxa

**`docker()`**, nie natywny `seatbelt()`.

`seatbelt()` uruchamia agenta na narzędziach hosta. W tym projekcie zależności istnieją tylko w Dockerze, a Node na hoście (24.14) nie spełnia wymagania projektu (24.15). Agent nie uruchomiłby lintu ani testów. Gniazdo Dockera leży w ukrytym katalogu domowym, a jego odsłonięcie dałoby agentowi kontrolę nad całym Dockerem.

`docker()` uruchamia agenta w obrazie z toolchainem projektu i własnym Postgresem, więc sandbox jest samowystarczalny: nie potrzebuje projektu Compose ani dostępu do sieci Dockera. Na macOS granicą jest dodatkowo maszyna wirtualna Docker Desktop.

Pierwsza wersja spike'u łączyła sandbox z siecią projektu Compose `oferty-pracy-agent`. Zrezygnowaliśmy z niej na rzecz bazy w obrazie: każdy sandbox ma własną bazę i porty, więc zadania są od siebie niezależne, a równoległość nie wymaga dodatkowej infrastruktury.

## Konfiguracja

- `.sandcastle/Dockerfile`: obraz `oferty-pracy-sandbox`.
  - Node 24.15.0, pnpm 10.34.9, git, Claude Code.
  - Użytkownik `agent` z UID/GID hosta.
  - Magazyn pnpm pod stałą ścieżką `npm_config_store_dir=/home/agent/.pnpm-store`, wypełniony przez `pnpm fetch` z lockfile'a.
  - PostgreSQL z repozytorium PGDG (w dniu spike'u 18.7; projekt deklaruje 18.6) i katalog danych `PGDATA=/home/agent/pgdata` ze schematem zmigrowanym w etapie `seed` z kodu commita, z którego zbudowano obraz. `DATABASE_URL=postgresql://oferty@localhost:5432/oferty`, uwierzytelnianie `trust`.
  - Każdy kontener dostaje własną kopię katalogu danych (copy-on-write), więc każde zadanie zaczyna od czystej, zmigrowanej bazy.
  - Budowa z katalogu głównego repo: `docker build -f .sandcastle/Dockerfile -t oferty-pracy-sandbox --build-arg AGENT_UID=$(id -u) --build-arg AGENT_GID=$(id -g) .`
- `.sandcastle/package.json`: Sandcastle instalowany na hoście przez `npm install` w `.sandcastle/`, oddzielnie od zależności aplikacji.
- `docker({ imageName, env })`. W `env` przekazujemy tożsamość git (`GIT_AUTHOR_*`, `GIT_COMMITTER_*`), której Sandcastle w kontenerze nie ustawia.
- `scripts/test-integration.sh`: start Postgresa, `pnpm migrate` (tylko brakujące migracje: nowe w zadaniu lub nowsze niż obraz), `pnpm build`, serwer z `.output` i `pnpm worker` w tle, `WEB_BASE_URL=http://localhost:3000 RUN_INTEGRATION=1 pnpm test`, sprzątanie procesów przez `trap`. Build zawsze w sandboxie, bo musi pochodzić z kodu agenta.
- Logowanie agenta: `CLAUDE_CODE_OAUTH_TOKEN` w `.sandcastle/.env` (wykluczony z gita), wygenerowany przez właściciela poleceniem `claude setup-token`.

## Wyniki

Sprawdzenia bez agenta (`node .sandcastle/spike.ts probe`), w jednym sandboxie, łącznie około 61 s:

| Sprawdzenie | Wynik |
| --- | --- |
| Worktree w `/home/agent/workspace` na branchu `agent/...` | tak |
| `pnpm install --offline --frozen-lockfile` | tak, 12 s |
| `pnpm lint` | tak, 4 s |
| `pnpm typecheck` | tak, 7 s |
| `scripts/test-integration.sh` | tak, 27 s: 589 testów zaliczonych, 1 pominięty, jak w bramce przez Compose |
| Gniazdo i CLI Dockera hosta | niewidoczne |
| Baza deweloperska właściciela | nieosiągalna |
| Pliki głównego checkoutu, w tym `.env` | niewidoczne; widać tylko jego `.git` |
| Sieć wychodząca | otwarta |

Pominięty test to `polish-python.test.ts`, który wymaga Pythona; pomijany jest także w obecnej bramce.

Przebieg agenta (`node .sandcastle/spike.ts agent`, `claude-opus-5-5`, effort `medium`): 36 s, sygnał zakończenia odebrany, jeden commit na branchu agenta z tożsamością właściciela, `master` bez zmian.

Pułapki napotkane po drodze:

- pnpm szuka magazynu u korzenia montowanego urządzenia, więc potrzebna jest stała ścieżka `npm_config_store_dir`.
- `COPY --from` nie zachowuje trybu katalogu; Postgres odmawia startu, gdy `PGDATA` nie ma `0700`.
- Sandbox tworzy worktree z ostatniego commita, więc niezacommitowane pliki trzeba przekazać przez `copyToWorktree`.

## Ryzyko: wspólny `.git` jest zapisywalny

Sandcastle montuje `.git` głównego repo z prawem zapisu, bo commity z worktree trafiają do wspólnej bazy obiektów i referencji. Tylko `hooks`, `config` i `info` są tylko do odczytu. Agent może więc technicznie przestawić `refs/heads/master` albo usunąć inne branche.

Zabezpieczenie w runnerze: zapisać SHA `master` przed uruchomieniem agenta i porównać po zakończeniu. Zmiana oznacza przywrócenie referencji, odrzucenie zadania i powiadomienie właściciela.

## Wnioski dla runnera

1. Zastąpić bezpośrednie `claude -p` przez `createSandbox({ branch: 'agent/<id>', sandbox: docker(...) })` i `sandbox.run({ agent: claudeCode(model, { effort }) })`. Merge zostaje w runnerze.
2. Usunąć listę dozwolonych narzędzi: w sandboxie Sandcastle uruchamia agenta bez pytań o uprawnienia, a granicą jest kontener.
3. Agent uruchamia pełne testy, z integracją, bezpośrednio w sandboxie przez `scripts/test-integration.sh`.
4. Bramkę runnera uruchamiać w świeżym sandboxie z tego samego obrazu (`sandbox.exec()`): `pnpm install --offline --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `scripts/test-integration.sh`. Agent i bramka pracują w identycznym środowisku.
5. Po przejściu runnera na sandbox `scripts/agent-compose.sh`, `scripts/agent-exec.sh` i `scripts/agent-gate.sh` stają się zbędne, a projekt Compose `oferty-pracy-agent` (z wolumenami) można usunąć.
6. Dodać kontrolę SHA `master` przed i po przebiegu agenta.
7. Przebudowywać obraz, gdy zmieni się `pnpm-lock.yaml`. Runner może porównywać hash lockfile'a z etykietą obrazu. Nowe migracje nie wymagają przebudowy.
8. Plik wyniku `.agent-result.json` można zastąpić wyjściem strukturalnym Sandcastle (`output`).

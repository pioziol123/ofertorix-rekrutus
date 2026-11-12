# Przegląd implementacji lokalnego AI — 2026-11-06

**Wynik: zmiany nie są gotowe do wdrożenia.** Implementacja nie obejmuje całego epiku, lokalna ścieżka profilu nie działa zgodnie z kontraktem i wprowadza regresje rozliczeń OpenAI.

Zakres potwierdzony przez właściciela: wszystkie lokalne zmiany, również nieśledzone pliki, względem `6086ce161d4b31d79abdbc463a2993c2febd1cbd`. `HEAD` wskazuje ten sam commit; lista nowych commitów jest pusta. Porównanie to `git diff 6086ce1 --` oraz odczyt plików z `git ls-files --others --exclude-standard`. Trzykropkowy diff między identycznymi commitami nie obejmuje tego zakresu. Dokumenty przygotowania epiku są wymaganiami dla implementacji, nie dowodem jej wykonania.

Przegląd wykonano dwiema niezależnymi osiami według wskazanego skilla code-review. Raport nie łączy ich ocen. Kod aplikacji i zastane testy pozostały niezmienione. Zadanie przeglądu: `oferty-pracy-334.22`.

## Standards

Nie znaleziono odrębnego, jednoznacznego naruszenia udokumentowanych standardów kodowania poza zachowaniami należącymi do osi Spec. `CLAUDE.md` zawiera placeholdery konwencji; dokument architektury rozróżnia decyzje od roboczych propozycji. Nie znaleziono `CODING_STANDARDS.md` ani `CONTRIBUTING.md`. Błędy wykrywane narzędziami są raportowane osobno, zgodnie ze skillem.

- **ST1 — P2, możliwe Primitive Obsession; ocena heurystyczna.** `lib/ai/models/openai.ts:88`, `ollama.ts:122`, `lib/profile/ai.ts:410`: `error.message.includes('429') || error.message.includes('5')`, następnie `throw new Error('retryable')` i porównywanie treści komunikatu. Tekst diagnostyczny pełni rolę protokołu sterującego, tracąc status HTTP i `Retry-After`; dowolne „5” może zmienić klasyfikację. Wspólny typ błędu powinien przenosić kod, status i dane potrzebne do retry oraz rozliczenia. Zachowanie retry jest niezależnie ocenione w S6.
- **ST2 — P3, możliwe Duplicated Code / Data Clumps; ocena heurystyczna.** `lib/ai/models/model.ts:12`, `openai.ts:7`, `ollama.ts:13`: powtarzany blok `model`, `instructions`, `input`, `schema`, `maxOutputTokens`, `reasoning`, `store`, `tools`, `serviceTier`. Zmiana kontraktu wymaga trzech zmian mimo wspólnego portu. Wydzielić jeden typ żądania; ustawienia dostawcy pozostawić przy jego konfiguracji.

Źródła standardów: `AGENTS.md`, `CLAUDE.md`, `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, `GLOSSARY.md`, historyczne `docs/product/ustalenia.md` i aktualna architektura pierwszej wersji. Heurystyki nie są twardymi naruszeniami.

## Spec

Źródło kanoniczne: [wymagania LA-01–21](../specs/lokalne-ai/requirements.md), pary etapów, [kontrakty runtime](../specs/lokalne-ai/kontrakty-runtime.md) oraz [panel](../specs/lokalne-ai/features/panel-zadan/requirements.md).

1. **S1 — P1: OpenAI jest rozliczany jako darmowy.** `lib/profile/ai.ts:426–435` bezwarunkowo zapisuje `settled` i koszt `0`, również dla płatnego wywołania i nieznanego użycia. Zwalnia rezerwację, przez co budżet przestaje ograniczać rzeczywiste wydatki. LA-02: „Refaktor zachowuje istniejące wyniki, historię i aktywne operacje OpenAI”; SD etapu 2: „Nieznany koszt zachowuje rezerwację”. Testy istniejącego rozliczenia i nieznanego usage nie przechodzą. Naprawa: `334.23`.
2. **S2 — P1: lokalny profil nadal wymaga konfiguracji OpenAI.** `lib/profile/ai.ts:77,212,241` blokuje zlecenie bez klucza/cennika, a `:165` rezerwuje płatny budżet. LA-04: „nie wymaga klucza OpenAI ani cennika”; LA-06: „Wyczerpany budżet usług płatnych nie blokuje wyłącznie lokalnej pracy”. Naprawa: `334.24`.
3. **S3 — P1: poprawny wynik Ollamy nie przechodzi ścieżki profilu.** `lib/ai/models/ollama.ts:89` zwraca całe `{done,message,…}`. `lib/profile/ai.ts:402` przekazuje je do parsera wymagającego `status/output` OpenAI (`:33–46`). E05-AC02 wymaga: „powstaje poprawna propozycja z cytatami”. Odtworzone atrapa HTTP → adapter → faktyczny parser profilu. Naprawa: `334.25`.
4. **S4 — P1: konfiguracja oczekującego zadania nie jest niezmienna.** Provider jest odczytywany z aktualnego env w `lib/profile/ai.ts:359`, model z cennika legacy (`:377`), endpoint z bieżącego `OLLAMA_HOST` (`ollama.ts:8`). Ustawienia modelu, endpointRef/endpointVersion i runtimeParameters nowej konfiguracji nie sterują żądaniem zgodnie z migawką. LA-03: „Zmiana konfiguracji środowiska nie przekierowuje oczekującej operacji”. Naprawa: `334.26`.
5. **S5 — P1: wadliwa konfiguracja uruchamia fallback do chmury.** `lib/ai/configuration.ts:35–37` zwraca `null` po błędzie; `lib/profile/ai.ts:364–369` wybiera wtedy OpenAI. E05-D01: „Pusty string, null, nieznane pola lub błędna kombinacja oznaczają błąd bez fallbacku”. Co więcej, dokładny przykład z `.env.example` wywołuje błąd Zod 4 przez jednargumentowe `z.record(z.any())` (`configuration.ts:11`). Jeżeli istnieje konfiguracja płatna, może to wysłać dane do OpenAI mimo wybranej Ollamy. Naprawa: `334.27`.
6. **S6 — P1: błędy retry pozostawiają zadanie `running`.** `openai.ts:88–90` rzuca `retryable`, a `lib/profile/ai.ts:414–416` wyrzuca je ponownie przed zapisem wyniku. `requestStarted` ustawiane dopiero po sukcesie (`:385`) nie zachowuje dotychczasowej obsługi transportu; `Retry-After` jest gubione. LA-02 zachowuje istniejące operacje; SD etapu 2 wymaga retry 429/5xx i poprawnego rozliczania niepewnego żądania. Istniejący test transient retry nie przechodzi. Naprawa: `334.28`.
7. **S7 — P1: brak zasad lokalnego runtime.** `ollama.ts:62` wprowadza deadline 90 s. `lib/profile/ai.ts:325,465` używa zwalnianej blokady profilu, bez trwałego wspólnego slotu zachowywanego przy unknown. LA-08 zabrania „stałego deadline lokalnej pracy”, a LA-11 wymaga: „unknown zachowują zajętość do potwierdzenia zakończenia pracy”. To pozostaje pracą otwartego etapu `334.6`, nie ukończoną implementacją.
8. **S8 — P1: nie dostarczono całego epiku.** Oceny nadal używają OpenAI (`lib/matching/store.ts:38`, `batch.ts:4`), research również (`lib/companies/research-provider.ts:159`). Brak wykonawcy OpenCode, narzędzi przeglądarki, archiwum lokalnych wykonań oraz API/UI panelu. Refaktory wcześniejszych etapów także nie są ukończone, np. konfiguracja i budżet nadal pozostają w profilu. LA-16: „Odbiór wydania obejmuje wszystkie dziewięć etapów i PZ-01–08”. Zadania implementacyjne pozostają otwarte; nie dublowano ich nowymi zadaniami.
9. **S9 — P1: adaptery nie realizują zadeklarowanego kontraktu schematu i zakończenia.** `openai.ts:22` i `ollama.ts:27` wywołują `z.toJSONSchema` na parametrze zadeklarowanym jako gotowy JSON Schema; próba zgodna z interfejsem rzuca `TypeError` w obu adapterach. SD etapu 2: „Adapter otrzymuje gotowy JSON Schema, nigdy Zod”. `ollama.ts:52–57` wysyła otoczkę `type=json_schema/name/strict/schema` zamiast samego schematu, a `:82–89` ignoruje `done_reason=length`. SD etapu 5: „format z JSON Schema” i „completed wymaga zakończenia i akceptowalnego done_reason”. Odtworzone osobnymi testami kontraktu. Naprawa wraz z S3: `334.25`.

Nie stwierdzono osobnej, uzasadnionej funkcjonalności poza zakresem.

## Weryfikacja

Wykorzystano lokalny obraz `oferty-pracy-tools`, ale jego stary zestaw zależności najpierw odtworzono przez `pnpm install --frozen-lockfile`. Wstępne wyniki na starych zależnościach nie stanowią dowodów usterek. Właściwe porównanie wykorzystuje Node 24.15.0, pnpm 10.34.9, identyczny lockfile i jednorazowy PostgreSQL 18.6. Kopie repozytorium w kontenerze: `/baseline` i `/app`. Baza testowa nie ma wolumenu ani portu hosta. Nie używano bazy użytkownika ani prawdziwych kluczy AI. Serwery HTTP uruchomiono tylko wewnątrz kontenera, a po zakończeniu usunięto kontenery testowe.

| Kontrola | `6086ce1` | Stan lokalny |
| --- | --- | --- |
| `pnpm lint` | PASS; 2 zastane ostrzeżenia Vue | FAIL; 19 błędów i te same 2 ostrzeżenia |
| `pnpm typecheck` | PASS | FAIL; kontrakty JSON Schema, Zod record, importy typów i nullable usage |
| `pnpm build` | PASS | PASS |
| Testy jednostkowe i integracyjne, `RUN_INTEGRATION=1` | 554 PASS; 28 plików PASS | 543 PASS, 11 FAIL; dodatkowo pusty suite `test/ollama-adapter.test.ts` |
| Dodatkowe próby kontraktów adapterów | Nie dotyczy — brak nowych adapterów | 7 FAIL, każda odtwarza naruszenie wymaganego kontraktu |

Polecenie testów porównawczych: `pnpm exec vitest run --exclude tests/setup.integration.test.ts --exclude tests/polish-python.test.ts`. Włączono integracje przez `RUN_INTEGRATION=1`; zapewniono testową bazę, migracje, zbudowaną aplikację i `WEB_BASE_URL`. Wyłączono dwa testy smoke wymagające osobnego workera Compose oraz jeden test adaptera Python/JobSpy. Nie są raportowane jako zaliczone. Pozostałe 554 istniejące testy wykonano na obu stanach.

11 regresji dotyczy profilu: rozliczenia znanego użycia, użycia po odrzuceniu propozycji, utrzymania nieznanego kosztu oraz retry. Nowy `test/ollama-adapter.test.ts` jedynie loguje konstrukcję obiektu i przechwytuje błędy; Vitest zgłasza `No test suite found`. To nie jest test działania adaptera. Naprawa kontroli i testów: `334.29`.

Siedem dodatkowych prób sprawdza: przykład konfiguracji env, odrzucenie niepoprawnej konfiguracji, JSON Schema w obu adapterach, poprawną odpowiedź Ollamy w parserze profilu, pole format oraz niekompletną odpowiedź. Wywołania HTTP były atrapami. Nie uruchamiano prawdziwej inferencji Ollamy ani OpenCode; wynik nie jest kwalifikacją usług live/T01–T05.

## Dowody i przekazanie

Trwałe kopie logów i dodatkowych prób znajdują się w [katalogu dowodów](review-lokalne-ai-2026-11-06/). Plik prób ma rozszerzenie `.txt`, aby samo zachowanie raportu nie dodawało nieprzechodzących testów do zestawu projektu. Skrypt odtwarzający jest zapisem faktycznego przebiegu; wymaga przygotowania kontenera, mountów `/review` i `/results`, bazowego archiwum i bazy testowej tak jak opisano powyżej.

Naprawy `oferty-pracy-334.23`–`334.29` podpięto jako blokady odbioru `334.10`. Zadania pierwotnych etapów pozostają otwarte. Graf sprawdzony przez `bd dep cycles --json`: brak cykli. Przegląd nie zamyka implementacji ani bramek live. Nie wykonano commit, push ani synchronizacji Dolt.

Standards: 2 uwagi heurystyczne, najwyższa P2 — błędy sterujące zakodowane w tekście. Spec: 9 problemów P1, w tym bezwarunkowe zerowanie płatnych kosztów i niejawny fallback do OpenAI.

# Etap 2: Profil niezależny od protokołu OpenAI — Solution design

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Beads: `oferty-pracy-334.3`, przygotowanie `334.20`. To projekt docelowy, nie wynik testów. Podstawa: [Requirements](requirements.md), [LA-02/03](../../requirements.md), [plan](../../README.md). Etap wymaga ukończenia etapu 1.

## Stan bazowy i granice

Przejrzano robocze [profile/ai.ts](../../../../../lib/profile/ai.ts), [model.ts](../../../../../lib/ai/models/model.ts), [openai.ts](../../../../../lib/ai/models/openai.ts) oraz wersję profilu z HEAD. Zastany adapter zwraca cały Responses jako tekst, zawsze deklaruje completed, gubi semantykę retry i ponownie konwertuje schemat Zod mimo typu JSON Schema. Profil tworzy konkretny adapter, ustawia requestStarted dopiero po odpowiedzi i uzależnia responseId od usage. To częściowa implementacja do poprawienia w tym zadaniu; nie usuwać innych zmian.

Profil posiada instrukcje, factSchema, JSON.parse i checkProposal. Adapter posiada HTTP, normalizację Responses i politykę transportu OpenAI. Zapis próby, retry i propozycji pozostaje w profilu. Narzędzia, Batch i sesje nie należą do StructuredModel.

## E02-D01 — Kontrakt pojedynczego modelu

Docelowy interfejs w `lib/ai/models/model.ts`:

```ts
type ModelRequest = {
  model: string
  instructions: string
  input: string
  output: { name: string; schema: Record<string, unknown> }
}
type ModelResult = {
  outcome: 'completed' | 'refused' | 'incomplete'
  text: string | null
  usage: { inputTokens: number | null; outputTokens: number | null }
  responseId: string | null
}
type StructuredModel = {
  generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResult>
}
```

Wszystkie pola request wymagane; input/instructions/name niepuste. Domena konwertuje Zod do draft-7 JSON Schema i usuwa `$schema` raz. Adapter otrzymuje gotowy JSON Schema, nigdy Zod. completed ma dokładnie jedną niepustą końcową treść assistant; reasoning nie jest treścią. Odmowa daje refused, status inny niż completed daje incomplete; oba text=null. Zero/wiele treści przy status completed to błąd format. Każdy licznik usage niezależnie: bezpieczny nieujemny integer albo null. responseId zachowujemy także bez usage. Walidacja cytatów i JSON należy do profilu.

`OpenAiAdapter` otrzymuje przez konstruktor fetcher, resolver klucza i zapisane opcje płatnego wywołania. `maxOutputTokens`, reasoning, store, tools, serviceTier nie są parametrami neutralnego interfejsu. Fabryka adaptera w `lib/ai/models/` dobiera implementację z zapisanej konfiguracji. Punkt wejścia workera składa zależności; wewnętrzna funkcja wykonania profilu przyjmuje StructuredModel. Zachować publiczny punkt `executeAi(pool,boss,id,fetcher)` jako fasadę aktualnych konsumentów/testów; nie wymagać HTTP w testach domeny.

Payload OpenAI identyczny z bazowym profilem: `/v1/responses`, model, store=false, tools=[], service_tier=default, max_output_tokens z migawki, reasoning low, istniejące instrukcje/input_text i strict json_schema `profile_proposal`. Płatny timeout 90 s pozostaje opcją tego adaptera; zewnętrzny signal łączy się z nim. Nie przenosić tego deadline do Ollamy.

## E02-D02 — Błędy i zgodność retry

Typowany błąd adaptera ma `code: configuration|network|http|format|aborted`, `requestSent:boolean`, `responseReceived:boolean`, `httpStatus:number|null`, `retryAfterMs:number|null`, `responseId:string|null` i znormalizowane usage. Bez surowego body/CV/klucza w message. `requestSent=true` ustawić przed wywołaniem fetch; oznacza możliwość wysłania, nie dowód przyjęcia. Nie wnioskować o HTTP z tekstu wyjątku. Błąd parsowania body po odpowiedzi HTTP nie staje się błędem sieciowym przed odpowiedzią. Zachować dostępne metadane także przy błędzie formatu.

Koordynator zachowuje politykę HEAD płatnego profilu: maksymalnie dwie próby w generation; retry dla HTTP 429/5xx oraz niepewnego requestSent bez responseReceived. Domyślne opóźnienie 1000 ms. Retry-After: liczba sekund lub data HTTP; niepoprawna wartość albo >60000 ms wyłącza retry, pozostałe minimum 1000 ms. Błędny JSON, odmowa, incomplete i walidacja cytatów nie uruchamiają automatycznej poprawki. Zastana regresja wrappera nie jest nową polityką produktu.

Nieznany koszt zachowuje rezerwację. Rozliczenie wymaga obu liczników mieszczących się w limitach płatnej migawki. Nie wyliczać tokenów z tekstu i nie zerować kosztu przy błędzie walidatora. Zapis próby i enqueue płatnego retry pozostają atomowe. Lokalna polityka ręcznego retry powstaje dopiero w etapie 5.

## Zmiana i zgodność

Bez migracji i zmian env. Stare queued konfiguracje nadal OpenAI. `readAiProposal` rozdzielić na prywatną normalizację dostawcy i publiczną walidację tekstu propozycji; przełączyć testy zamiast pozostawić domenę zależną od Responses. Bez eksportowania parsera OpenAI z profilu jako drugiego kontraktu. Historia i zatwierdzanie propozycji bez zmian.

## Weryfikacja i zakończenie

| Kryterium | Dowód wymagany w implementacji |
| --- | --- |
| E02-AC01 | Kontrakt HTTP na atrapie porównuje pełny payload z HEAD; test domeny wstrzykuje StructuredModel, bez sieci. |
| E02-AC02 | Obecne przypadki cytatów w `tests/profile.test.ts` oraz propozycja/akceptacja/konflikt rewizji w `tests/profile.integration.test.ts`. |
| E02-AC03 | Macierz completed/refused/incomplete, 0/2 treści, zły JSON, błąd parsowania HTTP i sieci, osobno brak każdego usage i zachowane ID; komunikaty bez sekretów. |
| E02-AC04 | 429/500/401, Retry-After sekundy/data/złe/>60 s, utrata odpowiedzi przed/po nagłówkach, podwójna dostawa, brak podwójnej propozycji/kosztu; regresje recovery w testach profilu. |

Test adaptera może powstać w `tests/ai-models.test.ts`. Zachować istniejące przypadki, przenieść je na właściwy interfejs zamiast duplikować parser. `pnpm check`, build i integracje z RUN_INTEGRATION=1 według [przekazania](../../przekazanie-lokalnemu-modelowi.md). Workflow implement-with-tester. Nie ma otwartej decyzji produktowej tego etapu; aktualizacja zastanego kodu jest obowiązkiem wykonawcy.

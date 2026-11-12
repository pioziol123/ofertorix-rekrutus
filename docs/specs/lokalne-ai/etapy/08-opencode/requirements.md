# Etap 8: OpenCode jako agent researchu z gpt-oss:20b — Requirements

Status: **przegląd wykonany, specyfikacja gotowa do implementacji**, 2026-11-05. Etap 8 z dziewięciu; przegląd w ramach 334.20, bez wykonania implementacji. Beads: `oferty-pracy-334.9`.

Podstawa: [PRD](../../PRD.md), [wymagania przekrojowe](../../requirements.md), [plan](../../README.md). Potwierdzone: lokalnie `gpt-oss:20b`, OpenCode dla agenta i brak kwot Ollamy. Kontrakty techniczne doprecyzowano w SD, runtime i kwalifikacji; ich sprawność wymaga testów.

## Cel i granice

Zintegrowanie gotowego runtime OpenCode z ręcznym researchem podstawowym. OpenCode prowadzi rozmowę i używa narzędzi; aplikacja odpowiada za zlecenie, dowody, koszty, walidację i publikację. Bez własnej pętli agenta.

Pokrycie przekrojowe: LA-01, LA-03, LA-06, LA-07, LA-08, LA-09. Aktorzy: właściciel zlecający lub przeglądający operację oraz worker wykonujący jej zapisany zakres; mechanizm dostępu pozostaje zgodny z istniejącą prywatną aplikacją.

## Warunki wejścia

Etapy 4, 5 i 7 (w tym kwalifikacja 334.21); sprawdzenie kontraktu sesji O-L3/T01/T02 w implementacji. Należy przeczytać aktualny kod i istniejące niezacommitowane zmiany przed realizacją.

## Wymagania i kryteria akceptacji

Identyfikatory w wierszu łączą wymaganie z jego obserwowalnym kryterium. Oba pozostają stabilne przy kolejnych przeglądach.

| Wymaganie / kryterium | Zachowanie | Warunek akceptacji |
| --- | --- | --- |
| E08-R01 / E08-AC01 | Lokalny agent bez OpenAI | Research używa OpenCode i gpt-oss:20b w Ollamie bez klucza OpenAI; nie włącza chmury ani alternatywnych modeli automatycznie. |
| E08-R02 / E08-AC02 | Kontrolowana sesja | Każde zlecenie jest powiązane z konkretną sesją i wersją runtime. Zmiana konfiguracji lub restart nie wybiera ostatniej globalnej sesji i nie tworzy drugiego aktywnego researchu. |
| E08-R03 / E08-AC03 | Raport sprawdzany przez domenę | Zakończenie sesji bez prawidłowego raportu jest błędem. Nieznane dowody, URL i cytaty są odrzucane; poprzedni raport pozostaje dostępny. |
| E08-R04 / E08-AC04 | Brak kwot i możliwość anulowania | Długi research nie jest ucinany przez limit rund, wywołań, tokenów ani stały deadline. Anulowanie zatrzymuje publikację i jest odróżnialne od ukończenia oraz niepewnego stanu sesji. |
| E08-R05 / E08-AC05 | Wyłącznie uzgodnione uprawnienia | Agent może używać tylko narzędzi etapu 7, nie powłoki, plików, delegacji lub interaktywnych pytań; nie dziedziczy osobistych pluginów, sekretów i konfiguracji. |
| E08-R06 / E08-AC06 | Oddzielne koszty i retencja | Koszt modelu pozostaje zero, narzędzia płatne są rozliczane mimo błędu raportu. Sesje, rozmowy, zdarzenia, dowody i raporty są zachowywane bezterminowo, bez automatycznego usuwania; restart i wymiana runtime zachowują dane. |

## Zależności i gotowość

O-L3 opisano w kontraktach runtime; przed live wymagane T01/T02: wersja i korelacja sesji, rozpoznanie startu/wyniku, anulowanie, odtwarzanie. Retencja jest zamknięta: materiały bezterminowo, profil Chrome usuwalny po końcu i archiwizacji. Proponowana tabela nie dowodzi, że obecne API spełnia kontrakt. O-L2 ma zamknięte decyzje produktowe; etap 7 dostarcza weryfikację T03–T05. Nie ma otwartej decyzji o modelu, runtime ani kwotach Ollamy.

Rozwiązanie i mapowanie weryfikacji: [SD](solution-design.md). Reguły LA zachowują jedno miejsce utrzymania w wymaganiach przekrojowych; ta para określa ich zakres dla etapu. Nie zmienia reguł domenowych poza jawnym zakresem.

## Kolejka i wznowienie — potwierdzone 2026-11-05

E08-AC02/04 obejmują [LA-11 i LA-15](../../requirements.md): trwała wspólna kolejka profilu, ocen i researchu, z jednym aktywnym lokalnym wykonaniem w całej instalacji, także przy wielu workerach. Kolejne czeka na potwierdzone zakończenie poprzedniego; waiting-for-user, cancelling i unknown nie zwalniają miejsca. Jawne retry zapisujemy od razu, lecz jego uruchomienie czeka na zwolnienie miejsca. Wznów kontynuuje to samo wykonanie; restart najpierw sprawdza istniejącą sesję. Bezpośrednie inferencje profilu/ocen korzystają z tej samej kolejki i slotu. E08-AC01/02 obejmują uruchomienie osobnych usług według LA-14. Nadal bez kwot modelu i stałego deadline całej pracy.

## Zakończenie researchu i zakres wydania — po grill-me

E08-AC03 obejmuje LA-19–21: dowody wyłącznie odczytanych stron, próba sprawdzenia każdej kategorii i jawne niewiadome, bez wymogu znalezienia wszystkich odpowiedzi. Brak podstaw do poprawnego raportu nie zastępuje poprzedniego raportu. E08-AC04 obejmuje bezwzględnie wspólny slot ze ścieżkami direct; interwencja blokuje również profil i oceny. LA-17/18: błędny wynik wymaga ręcznego retry z tą samą migawką, awarie infrastruktury nie powodują automatycznych restartów. Logowanie/parkowanie sesji poza epikiem w backlogu281. Wydanie obejmuje komplet epiku i panel (LA-16).

## Gotowość wykonawcza po przeglądzie

Przegląd 2026-11-05 rozstrzyga kontrakty techniczne, w tym headless Chrome w kontenerze z prywatnym DevTools do ręcznej interwencji. [Kwalifikacja](../../kwalifikacja-runtime.md) określa wersje i zabezpieczenia oraz dowody wymagane przed integracją. Nie ma otwartego wyboru modelu, przeglądarki lub kwot; działanie sprawdza wykonawca. Negatywny test blokuje włączenie, nie uprawnia do obejścia kryteriów.

# Moduły i zasady pisania kodu

Moduły wyznaczamy według odpowiedzialności i operacji udostępnianych innym częściom aplikacji. Każdy moduł ma własny podkatalog w `modules/`. Tabela wskazuje docelowe ścieżki.

## Mapa modułów

| Moduł | Za co odpowiada | Co udostępnia innym | Katalog |
| --- | --- | --- | --- |
| Źródła ofert | Katalog źródeł, zakres pobierania, synchronizacja, dostępność oraz treść i rewizje ogłoszeń źródłowych | Zlecenie przebiegu, jego status, odczyt ogłoszenia z identyfikatorem rewizji | `modules/sources/` |
| Oferty | Listę i szczegóły zapisanych ogłoszeń, filtry widoku, sortowanie i prezentację wynagrodzeń | Zapytania listy i szczegółów. Widok może dołączać podsumowania ocen | `modules/offers/` |
| Profil zawodowy | Import CV, wydobyty tekst, szkic, zatwierdzone wersje, propozycję AI i jej zastosowanie | Zapis szkicu, zatwierdzenie, przygotowanie propozycji, odczyt zatwierdzonej wersji | `modules/profile/` |
| Dopasowanie | Zlecenia ocen, reguły walidacji, rating i kompletność, wagi, historię oraz aktualność względem wejścia | Zlecenie oceny pojedynczej lub grupowej, zapis oceny ręcznej i odczyt wyników | `modules/matching/` |
| Firmy | Profile firm, powiązania firm z ofertą i ich role, wersje researchu oraz dowody | Zapis profilu i powiązań, zlecenie researchu i odczyt raportów | `modules/companies/` |
| AI | Konfigurację wykonawców, rezerwację i rozliczenie budżetu oraz stan wykonania | Operacje na budżecie i stanie wykonania oraz wynik modelu dla modułu zlecającego | `modules/ai/` |

Punkty wejścia aplikacji przekazują polecenia i zapytania do modułów przez ich publiczne operacje.

## Reguły zależności

1. **Jeden właściciel reguł i zapisów.** Każdy moduł publikuje własne wyniki i pilnuje swoich reguł. Dopasowanie pobiera zatwierdzoną wersję profilu i rewizję ogłoszenia. Zapis oceny i jej historii należy do Dopasowania.
2. **Odczyty można składać.** Oferty mogą dołączyć oceny do listy ogłoszeń. Regułę aktualności oceny definiuje Dopasowanie, które pobiera wejście do oceny ze Źródeł ofert i Profilu zawodowego.
3. **Interfejs modułu opisuje przypadek użycia.** Wywołujący przekazuje identyfikator i dane polecenia, otrzymuje wynik albo znany stan błędu. Moduł odpowiada za kolejność walidacji, zapisu i zlecenia pracy.
4. **Dostawca wykonania jest wymienny.** Adapter tłumaczy żądanie i wynik dostawcy. Dopasowanie odpowiada za dowody, historię i warunki publikacji, a AI za wspólny budżet. Stan wykonania, koszt i ważność treści są rozpatrywane osobno. Koszt można rozliczyć również po odrzuceniu treści oceny.
5. **Wspólne mechanizmy mają neutralnego właściciela.** Mechanizm transakcji jest dostępny dla wszystkich modułów. Moduł wykonujący operację decyduje, które zapisy obejmuje transakcja.

## Zasady pisania kodu

- **Nazwy opisują operację i przedmiot.** `enqueueMatching`, `publishAiRating` i `readRatings` wskazują, które wywołanie zleca pracę, zapisuje wynik lub czyta historię. Nazwy typów i statusów opieramy na pojęciach ze [słownika domeny](../../GLOSSARY.md).
- **Dane wejściowe walidujemy przy wejściu.** Trasa sprawdza kształt żądania HTTP, adapter sprawdza odpowiedź zewnętrzną, moduł pilnuje reguł domeny. Po walidacji przekazujemy typowany wynik. Na przykład poprawny JSON oceny nadal wymaga sprawdzenia dowodów względem zapisanej wersji profilu i rewizji ogłoszenia.
- **Reguły obliczeniowe zwracają wynik.** Walidację oceny, wyliczanie ratingu czy dopasowanie wynagrodzenia da się wywołać na danych wejściowych. Zapis, połączenie z dostawcą i publikacja wyniku mają własne, widoczne miejsce w przepływie.
- **Operacja zapisu jest właścicielem transakcji.** Określ, które zmiany muszą zostać zapisane razem. Zadanie workera może zostać dostarczone ponownie. Przed publikacją sprawdź tożsamość operacji oraz wersję wejścia, a przed ponowieniem płatnego żądania uwzględnij stan poprzedniej próby.
- **Stany wymagające innej reakcji rozróżniamy jawnie.** Brak budżetu, błąd walidacji i niepewny wynik wysyłki prowadzą do różnych reakcji. Zapisujemy potrzebne identyfikatory i stan. Komunikaty oraz logi pomijają dane kontaktowe z CV i sekrety.
- **Używamy istniejących narzędzi i zależności.** TypeScript, walidacja Zod przy wejściach, SQL z parametrami, ESLint i Prettier. Nową warstwę uzasadnia reguła, którą może ukryć, albo rzeczywista różnica między wykonawcami.
- **Sprawdzamy zachowanie przez operację używaną przez klienta modułu.** Dla zmiany w Dopasowaniu istotne są ponowne dostarczenie, wynik dla starszej rewizji, częściowa porażka grupy oraz rozliczenie przy odrzuconej treści. Istniejące testy pojedynczej i grupowej oceny stanowią punkt wyjścia. [Ocena pojedyncza](../../tests/matching.integration.test.ts) · [Ocena grupowa](../../tests/matching-groups.integration.test.ts)

## Pierwsza zmiana w kodzie

Zacząć od oddzielenia wykonania Batch od walidacji i publikacji oceny. Dziś `prepareMatching` od razu buduje żądanie OpenAI, a `applyMatchingLine` łączy obsługę odpowiedzi Batch, koszt i publikację. Ścieżki pojedyncza i grupowa już współdzielą `applyMatchingLine`. Istniejące zadanie „Oddzielić oceny i grupy zleceń od OpenAI Batch” obejmuje ten krok. Można je otworzyć lokalnie poleceniem `bd show oferty-pracy-334.4`. [Przygotowanie zlecenia](../../lib/matching/store.ts#L76) · [Odbiór wyniku](../../lib/matching/store.ts#L196) · [Wspólne wywołanie z grupy](../../lib/matching/groups.ts#L444)

# Triage i ocena dopasowania — projekt rozwiązania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Uzasadnienie: [wymagania tej funkcjonalności](requirements.md) → [PRD](../../PRD.md). Pokrycie: R-03/AC-03, R-12/AC-12, R-13/AC-13, R-14/AC-14.

## Granice i decyzje

Potwierdzone wybory D-01–D-06 i proponowane D-07–D-08 są utrzymywane we [wspólnej architekturze](../../architecture.md). Pozostałe mechanizmy w tym pliku są **propozycjami SD**, a nie zatwierdzonymi decyzjami właściciela. Nazwy encji i komend opisują plan, nie istniejący kod. Wspólna semantyka null, wersji i komend obowiązuje przez odnośnik, nie przez kopię.

## Własność danych i kontrakty

| Encja / grupa | Istotne pola i niezmienniki |
| --- | --- |
| Assessment / RatingRevision | Wersja profilu, komplet wersji ogłoszeń i wybranych danych, model/prompt/schema version, składowe/uzasadnienia, wagi i wynik, autor `ai/owner/system`. Aktualność i wskazanie bieżącej oceny oddzielne od historii. |

## Kwalifikacja i wejście

Propozycja SD: przed triage lokalnie sprawdzamy wymagania konieczne na wersjonowanych danych. Wynik to potwierdzona zgodność, potwierdzona sprzeczność lub niewiadoma z dowodem. Sprzeczność wyklucza z automatycznej oceny, lecz nie usuwa zapisu i nie ustawia własnej decyzji właściciela. Triage używa wyłącznie wejściowych wersji profilu i ogłoszeń; wspólny adapter nie udostępnia mu WWW.

## Sprzeczne warianty

**Potwierdzone po korekcie Q7–Q8:** wariant spełniający wymaganie powoduje uznanie tego kryterium za spełnione. Wynik zachowuje identyfikatory wszystkich wariantów i dowodów, wskazanie wariantu stanowiącego podstawę dopasowania oraz znacznik rozbieżności. Nie zamieniamy rozbieżności w `unknown` i nie blokujemy oferty tylko dlatego, że drugi wariant nie pasuje. Zgodność kryterium nie jest potwierdzeniem, że korzystniejszy wariant jest jedyną prawdziwą informacją.

Nie łączymy niepowiązanych wariantów w wymyślony pakiet warunków ani nie pomijamy innych wymagań koniecznych. Zasada dotyczy wariantów tego samego kryterium; interpretacja kilku współzależnych pakietów wymaga przykładów przy dalszym doprecyzowaniu.

## Kalkulacja i aktualność

**Potwierdzone Q6:** kompletność jest ważona znaczeniem ocenialnych kryteriów; pełne technologie 40% i doświadczenie 25% przy pozostałych niewiadomych dają 65%. Rating uwzględnia tylko ocenialną część. Q9 potwierdza uwzględnienie częściowej kompletności wewnątrz składowej; znajomość części warunków nie oznacza znajomości wszystkich. Szczegóły technicznej reprezentacji kryteriów i wag wewnętrznych poniżej pozostają propozycją SD do przeglądu.

**Propozycja techniczna kalkulatora, zgodna z Q6 i Q9:** w każdej składowej lista jawnych kryteriów; nieznane bez oceny. Rating składowej to średnia ocen jej ocenialnych kryteriów. Rating łączny to suma `waga × rating składowej` podzielona przez sumę wag ocenialnych składowych. Kompletność to ważona proporcja ocenialnych kryteriów względem wszystkich jawnie określonych kryteriów składowych. Pusta składowa nie daje 100% kompletności; zero łącznej podstawy daje `rating=null`. Przed implementacją przejrzeć dokładny wzór, jednostki kryteriów i wagi wewnętrzne: zmiana liczby kryteriów lub częściowo rozpoznana składowa wpływa na znaczenie wyniku.

Ręczna ocena tworzy rewizję, nie modyfikuje historii ani składowych AI bez śladu. Nowa ocena AI może stać się aktualna mimo ręcznego poprzednika. Zmiana samych wag tworzy nową kalkulację z tymi samymi wynikami AI i wersją wag. Badanie firmy nie aktualizuje triage po cichu.

## Porównanie wynagrodzenia

**Potwierdzone Q10:** oczekiwane minimum wystarczy osiągnąć w części porównywalnych widełek; wynagrodzenie nie jest przez to gwarantowane. Kryteria i przykłady są utrzymywane w R-13, a nie jako osobna reguła filtra widoku.

Propozycja SD: dla znanej górnej granicy i porównywalnej jednostki sprawdzamy `upper >= expected_minimum`. Jeżeli dolna granica jest niższa niż minimum, zwracamy także znacznik częściowego pokrycia; przy nieznanej dolnej granicy pokazujemy brak tej informacji zamiast zgadywać pokrycie. Brak górnej granicy wymaga oceny znanych danych: dolna co najmniej równa minimum potwierdza spełnienie, natomiast dolna poniżej minimum bez górnej nie wystarcza do potwierdzenia. Warianty powiązane z różnymi umowami oceniamy jako całe warianty, bez łączenia kwoty z jednego i umowy z drugiego.

## Przekazanie do researchu

Po ukończeniu oceny sprawdzamy konfigurowalne progi ratingu i kompletności oraz osobny wynik wymagań koniecznych. Wyjściem jest kwalifikacja, nie drugi profil firmy. Moduł researchu sam rozstrzyga ponowne wykorzystanie już istniejącego raportu. Zmiana wyniku nie aktualizuje własnej decyzji ani aplikacji.


## Komendy

Nazwy logiczne, nie zamrożone endpointy. Wspólny kontrakt walidacji/wersji/odpowiedzi: [architektura](../../architecture.md#wspólny-kontrakt-komend).

| Komenda | Wejście i skutek |
| --- | --- |
| ReassessOffer | Offer id, profil i wersja danych; zlecenie, aktualizacja/oczekiwanie z zachowaniem starego wyniku. |

## Integracja z pozostałymi funkcjonalnościami

[profil](../profil/requirements.md), [oferty](../oferty/requirements.md), [operacje](../operacje/requirements.md). Status wykonania, rezerwacje i ponowienia zapewnia [kontrakt operacji](../operacje/solution-design.md); prywatny dostęp i trwałe uruchomienie określa [uruchomienie](../uruchomienie/solution-design.md). Zależności te są kontraktami, nie listą kolejności ticketów implementacyjnych.

## Weryfikacja funkcjonalności

Kontrolne kryteria z niewiadomymi i sprzecznością konieczną; powtarzalny kalkulator, zmiana wag bez API, ręczna ocena zastąpiona przez AI, późny wynik starego profilu. Sprawdzić liczbę wywołań i aktualność. Pokrycie obejmuje wszystkie R/AC wskazane na początku dokumentu. [Odbiór integracyjny](../odbior/solution-design.md) sprawdza współpracę modułów; nie zastępuje ich kryteriów. Testów produktu jeszcze nie wykonano.

## Otwarte decyzje i gotowość

O-02, O-05, O-06 — [rejestr i skutki](../../open-decisions.md). Przed oznaczeniem tej pary jako gotowej należy rozstrzygnąć dotyczące jej kontrakty i przejrzeć zgodność z wymaganiami. Samo utworzenie dokumentów nie zatwierdza propozycji.

## Projekt etapu na żądanie — 2026-11-03

Potwierdzone: jednakowe wagi kryteriów w grupie. Grupy zachowują40/25/20/15. Kalkulator: średnia znanych ocen w grupie; rating łączny średnią tych grup ważoną ich wagami; kompletność sumą iloczynów wagi grupy i udziału znanych kryteriów. Pusta grupa ma0% kompletności. Kryteria jawnie obojętne w profilu pomijamy. Niewypełnione oczekiwania pozostają nieznane. Technologii nieobecnej w profilu nie oceniamy jako braku. Więcej kryteriów technologicznych nie zmienia całkowitej wagi grupy.

Implementacja etapu: `lib/matching/model.ts` (kryteria, kalkulator, dowody), `batch.ts` (ograniczony transport OpenAI), `store.ts` (trwały przebieg). Nowe tabele `matching_requests` i `matching_batches` referują niezmienne wersje profilu/ogłoszenia. `ai_attempts` otrzymuje możliwość niezależnej operacji matching bez import_id; dotychczasowa obsługa CV ogranicza swoje zapytania do operation_type=profile. Rezerwacja nadal blokuje wiersz miesiąca, co serializuje wydatki obu funkcji. Konfiguracja `AI_MATCHING_PRICING_JSON` używa tego samego kontraktu jednostek co CV, ale zawiera stawki Batch, bez zgadywania połowy ceny.

Przed siecią zapisujemy upload/submitting; po utracie odpowiedzi tworzenia partii oznaczamy unknown i nie wysyłamy ponownie. Brak automatycznego retry tworzenia jest świadomym kosztem dostępności przy braku gwarancji exactly-once. Użytkownik widzi identyfikatory diagnostyczne; ponowienie jest jawnym nowym zleceniem. Pula odzyskiwania pg-boss co minutę odczytuje znane partie (bez oczekiwania workera przez24h) i odtwarza brakujące dostarczenie. Blokada doradcza per zlecenie uniemożliwia równoczesny odbiór. Częściowy wynik terminalnej partii jest mapowany przez custom_id i walidowany niezależnie od stanu partii; nieznane/zdublowane ID są błędem kontraktu. Brak usage lub niejednoznaczny błąd pozostawia koszt unknown.

Transport ma stały host api.openai.com, brak redirect/retry, ograniczenia czasu60s i odpowiedzi8MiB. JSONL ma limit2MiB/100 zleceń. Przekazujemy wyłącznie zawodowe dane profilu bez źródeł CV, identyfikatorów umiejętności i kontaktów oraz projektowaną treść oferty; bez surowego pliku CV i bez narzędzi WWW. store=false w Responses. Pliki wejściowe wygasają po48h, wynikowe po7dniach; sprzątanie po odbiorze dopuszcza404 i jest ponawiane w tle. Granice dostawcy zweryfikowano w [Batch guide](https://developers.openai.com/api/docs/guides/batch), [create batch](https://developers.openai.com/api/reference/resources/batches/methods/create) i [upload file](https://developers.openai.com/api/reference/resources/files/methods/create)2026-11-03.

Weryfikacja AC-B1–B6: syntetyczne wejścia i podstawiony transport, PostgreSQL w izolowanym schemacie, kontrola braku podwójnej wysyłki/rezerwacji, restart/unknown, częściowe odpowiedzi, utrata aktualności. Próba płatna nie jest częścią odbioru offline.

Doprecyzowanie implementacyjne: pełne żądanie Responses zapisujemy w request_payload przed kolejką, wraz z prompt_version=matching-v1 i schema_version=1. Zmiana kodu instrukcji nie zmienia już oczekujących zleceń. Statusy kosztów utrzymuje wspólny ledger; plik przy nieznanym utworzeniu partii pozostaje do wygaśnięcia48h, ponieważ usunięcie mogłoby przerwać aktywną pracę. Nieprawidłowy JSONL/identyfikatory lub utracony plik terminalnego wyniku kończą zlecenie błędem, zachowując nieznany koszt; przejściowe błędy pobrania są wznawiane.

Konfiguracja lokalna2026-11-03: ten sam co CV model gpt-6-luna, jawne konserwatywne stawki Batch0.10USD/1M wejścia i0.375USD/1M wyjścia, kurs buforowy5PLN/USD, limit200000bajtów wejścia i6000tokenów wyjścia. To górny szacunek, nie zmierzony koszt. [Model i progi długiego kontekstu](https://developers.openai.com/api/docs/models/gpt-6-luna) potwierdzają standard0.10/0.50USD, wyższe stawki powyżej272K i50%Batch. Konfiguracja zachowuje bufor względem krótszych wejść. Nie wykonano płatnej próby.

## Odbiór etapu na żądanie — 2026-11-03

Zaimplementowano AC-B1–B6: tabele i migracje6/7, transport, wersjonowanie dokładnego żądania, wspólny budżet, kolejka, odczyt i historia w szczegółach. Tester:64testy nowego obszaru (34model,17transport,13PostgreSQL) PASS. Całe pnpm check:306testów PASS,99integracyjnych domyślnie pominiętych; oddzielnie wykonano regresje profilu27 i ofert4 oraz finalne13dopasowania PASS. Build PASS. Lokalnie migracje zastosowane, worker zdrowy, UI pokazuje aktywny przycisk i rezerwację0.11125PLN. W rzeczywistej bazie0zleceńmatching: nie wykonano płatnej próby; jakość odpowiedzi wybranego modelu nie została jeszcze potwierdzona na realnej ofercie.

Dalszy zakres jest śledzony odrębnie:8kt.2 (listowanie i zbiorcze partie),8kt.3 (ręczne oceny i zmiana wag). Nie uznawać całej funkcjonalności R-03/R-12–R-14 za ukończoną przez ten etap. Rozpoznawanie dowolnych tekstowych wymagań koniecznych nadal wymaga ręcznego sprawdzenia.

## Projekt rozszerzenia8kt.2 — 2026-11-03

`matching_groups` jest właścicielem wspólnego przebiegu i plików zdalnych; `matching_requests.group_id` wiąże pozycje. Dotychczasowe `matching_batches` i ścieżka pojedyncza pozostają kompatybilne. Nowa kolejka `offer-matching-group` obsługuje blokadę per grupa i recovery co minutę. Single recovery nie obsługuje pozycji grupowych; historia odczytuje identyfikator partii ze wspólnego przebiegu.

Komenda POST/api/matching zawiera offerIds(UUID[],1–100,bez powtórzeń) i commandId(UUID). Zapisy w jednej transakcji, blokada komendy oraz blokady ofert w porządkuID; commandId powtórzone z inną listą to konflikt. Każda nowa pozycja korzysta z istniejącego przygotowania wersji wejść; nie dublujemy oczekujących pozycji. Wspólna partia obejmuje wyłącznie nowe, lokalnie dopuszczone pozycje. Maksymalnie2MiBJSONL; za duża grupa jest odrzucana przed commitem, bez cichego dzielenia ani pomijania ofert.

Wspólna rezerwacja używa istniejącego serializowanego ledgeru i savepointu: albo wszystkie nowe pozycje otrzymują rezerwację i stanqueued, albo rollback rezerwacji i waiting_budget. Każda ma swój miesiąc, konfigurację i kwotę. Po upload i przed create trwale zapisujemy stan grupy oraz członków. Unknown tworzenia nie wyzwala ponowienia. Wyniki terminalne pobierane raz per odczyt; każdy nierozliczony członek otrzymuje niezależną walidację, rozliczenie i wynik w transakcji. Restart może pobrać plik ponownie, ale pomija zakończonych członków. Cleanup dopiero po terminalnym stanie wszystkich członków; nie dotyka danych niepewnej aktywnej partii.

Odczyt listy dekoruje istniejący readOffers jednym zapytaniem o ostatnie zlecenia i ostatnie udane oceny. Zależności bazowej projekcji od tabelAI nie dodajemy, dzięki czemu dotychczasowe adaptery i czytnik pozostają niezależne. Filters rozszerzamy o rating/kompletność/składowe i stan. Parametry0–100, brak wartości wyłącza filtr, brak oceny nie jest zerem. Frontend przechowuje zaznaczenia jawnie i wysyła konkretną listęID; commandId pozostaje ten sam po błędzie sieci aż do zmiany zaznaczenia lub potwierdzonego przyjęcia.

Weryfikacja: rozszerzenie testów filtrów oraz odizolowane testy PostgreSQL grupowania, deduplikacji komendy/ofert, budżetu atomowego, różnych wyników jednej partii i wznowienia odbioru. Bez płatnych prób; zachowujemy testy pojedynczej ścieżki iCV.

### Odbiór8kt.2

Zaimplementowano AC-G1–G7: odczyt ocen na liście, aktualność i składowe, filtry0–100 i sortowanie, wybór do100ofert z podglądem kosztu, idempotentne grupy i osobne rozliczenia. Migracja8 zastosowana lokalnie, kolejka zarejestrowana i worker uruchomiony ponownie. Testy:318domyślnych PASS; oddzielnie testy PostgreSQL:11grup,13pojedynczych ocen,6listy,27profilu,4ofert PASS. Kontrola typów/lint/build PASS. UUID komendy i ofert normalizowane do małych liter przed porównaniem; test potwierdza idempotencję i odrzucenie duplikatów niezależnie od wielkości liter.

W UI sprawdzono wybór20ofert na stronie1, zachowanie wyboru na stronie2 i rozszerzenie do40, prawidłowy podgląd4.45PLN, wyczyszczenie zaznaczenia po filtrze oraz filtr ratingu bez waluty/okresu płacy. API: sortowanie200, próg0wyklucza brak oceny, nieprawidłowy próg400, obcyOrigin403, nieprawidłowy wybór422. Nie wysłano rzeczywistych analiz; w bazie0grup i0zleceń. Odbiór sprawdza przebieg na podstawionych odpowiedziach, bez dowodu jakości modelu na rzeczywistej ofercie.

Przy testowaniu limitu danych naprawiono dodatkowo złożoność regexu redakcji e-maili dla długich ciągów bez separatorów; regresja syntetyczna200000znaków oraz50testów profilu PASS. Nadal pozostaje8kt.3 (ręczne oceny i zmiana wag), a dowolne tekstowe wymagania konieczne wymagają sprawdzenia przez właściciela.

## Projekt8kt.3 — 2026-11-03

`matching_rating_revisions` jest właścicielem historii wyniku, niezależnej od historii zleceńAI. Rewizja zawiera wynik, kalkulację, snapshot wejścia, wersje profilu/ogłoszenia/wag, autora operacji oraz autora samej oceny (`assessment_author`, zachowanego przy przeliczeniu systemowym). `matching_rating_heads` wskazuje bieżącą rewizję per ogłoszenie. Każde udane zakończenieAI publikuje najwyżej jedną rewizję dla request_id; stara odpowiedź jest archiwizowana bez promocji, gdy istnieje bieżąca ocena dla aktualnych wejść. AutorAI może zastąpić ręczny wynik dla tych samych aktualnych wejść.

`matching_weight_versions` i singleton `matching_weight_head` przechowują globalne procenty. Nowe publikacje/ręczne oceny/zmiana wag serializowane wspólną transakcyjną blokadą doradczą. Przeliczenie tworzy rewizje systemowe bieżących głów, kopiuje wynik bez zmiany treści i wskazuje poprzednika oraz wersję będącą podstawą. Kalkulator przyjmuje jawny obiekt wag; historia nie zależy od obecnego ustawienia. Migracja9 kopiuje istniejące ukończone oceny, preferując przy wyborze głowy wynik dla aktualnego wejścia.

POST ręcznej oceny zawiera commandId, expectedRevisionId(null tylko przy braku głowy), profileVersionId, adRevisionId, assessment i reason. PowtórzeniecommandId z inną treścią jest konfliktem. Serwer sprawdza wersje i komplet kryteriów, nie akceptuje nieznanychID ani oceny liczbowej przy stanieunknown. Odrębny walidator właściciela dopuszcza ocenę niewiadomej z własnym uzasadnieniem bez cytatówAI; dostarczone cytaty nadal muszą występować w snapshotach. To nie jest furtka walidacji odpowiedzi modelu. Pusty formularz opiera się na aktualnych wersjach; stara ocena nie wypełnia automatycznie zmienionych kryteriów.

POST wag zawiera commandId, expectedVersionId i cztery procenty. Suma100, zero dopuszczalne. W jednej transakcji powstaje wersja oraz przeliczone głowy; błędy wycofują całość. Równoległa edycja otrzymuje409. Żadna z komend nie korzysta z transportuBatch, kolejki ani ledgeru kosztów.

Weryfikacja: tester jednostkowy kalkulatora i odizolowany PostgreSQL; ręczna ocena bezAI, konflikt i idempotencja, unknown/null, przeliczenie i dawne wagi, powrótAI po ręcznej korekcie, stare wejście nie wypiera aktualnego wyniku, zgodność listy ze szczegółami i brak nowych prób/rezerwacji.

### Weryfikacja etapu ręcznych ocen — 2026-11-04

Wdrożono migrację9 i formularze własnej oceny oraz globalnych wag. Lista i szczegóły czytają wspólną głowę historii ocen. Bezpieczne ponawianie obejmuje także zapis identycznych wag (osobne potwierdzenia poleceń, bez nowej wersji wag). Formularz nie jest resetowany przez nadejście wynikuAI; nieaktualny zapis wymaga jawnego wczytania danych.

Walidacja: `pnpm check` (323 testy), 77 izolowanych testów integracyjnych dopasowania/profilu/ofert, `pnpm build`; tester dodatkowo potwierdził102 testy całego obszaru dopasowania. W przeglądarce sprawdzono sumę wag101% blokującą zapis, wczytanie aktualnych wag i formularz własnej oceny. Nie zapisywano fikcyjnej oceny w danych użytkownika i nie wysyłano nowych analizAI.

W bazie zastano20 wcześniejszych błędów uploadu partii. Osobne zadanie `oferty-pracy-5t4` obejmuje diagnostykę transportu i zachowanie bezpiecznego kodu błędu; nie ponowiono tych zleceń.

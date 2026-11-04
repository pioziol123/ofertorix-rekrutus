# Triage i ocena dopasowania — wymagania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **roboczy szkic — do dopracowania przed realizacją tej funkcjonalności**, 2026-10-31. Funkcjonalność pod wspólnym [PRD](../../PRD.md). Źródła i decyzje właściciela: [PRD](../../PRD.md#źródła-i-odpowiedzialność-dokumentów). Projekt techniczny: [solution-design.md](solution-design.md). Terminologia: [słownik](../../../../../GLOSSARY.md).

## Zakres i zależności

Ten dokument jest właścicielem wymagań R-03, R-12, R-13, R-14 i odpowiadających im AC. Powiązania: [profil](../profil/requirements.md), [oferty](../oferty/requirements.md), [operacje](../operacje/requirements.md). Nie przejmuje reguł innych funkcjonalności. Aktorem jest właściciel; scenariusze są przyszłymi kryteriami, nie wynikiem testów.

### R-03 — brak informacji i wykluczenia

Niewiadoma sama nie odrzuca oferty. Potwierdzona sprzeczność z wymaganiem koniecznym blokuje dalszą automatyczną ocenę; zapisany powód jest widoczny. Nie oznacza to własnej decyzji właściciela o odrzuceniu. Gdy źródła podają sprzeczne warianty i co najmniej jeden spełnia wymaganie, to kryterium traktujemy jako spełnione, zachowując warianty oraz jawny komunikat o rozbieżności. Taki przypadek nie jest niewiadomą ani potwierdzonym wykluczeniem.

**AC-03:** oferta bez widełek lub potwierdzenia pracy z Polski pozostaje zapisana z komunikatem do sprawdzenia. Potwierdzona niezgodność ma wskazane kryterium i dowód; automatyczna ocena nie jest zlecana. Każda już pobrana oferta pozostaje dostępna niezależnie od kwalifikacji, błędu AI lub wygaśnięcia. Dla sprzecznych wariantów „zdalnie” i „hybrydowo”, przy wymaganej pracy zdalnej, kryterium jest spełnione, a rozbieżność pozostaje widoczna wraz ze źródłami. Nie obniżamy tej kwalifikacji do „nieznane” ani nie wymagamy ręcznego rozstrzygnięcia przed jej uznaniem.

### R-12 — składowe i uzasadnienia

Triage wykorzystuje profil i ogłoszenia, bez wyszukiwania WWW. AI proponuje składowe: technologie, doświadczenie, warunki i kierunek zawodowy. Każda wskazuje podstawę w ogłoszeniu i profilu, dopasowanie/potwierdzony brak/niewiadomą, uzasadnienie, mocne strony i luki.

**AC-12:** można prześledzić uzasadnienia do wejściowych wersji profilu/ogłoszeń. Technologia nieobecna w CV nie jest opisana jako potwierdzony brak. Błąd AI nie zmienia decyzji na „odrzucona”. Research firmy pozostaje osobnym wynikiem, nie zmienia po cichu znaczenia ratingu triage.

### R-13 — rating i kompletność

Kod oblicza rating 0–100 z ocen możliwych do ustalenia, według konfigurowalnych wag: początkowo 40% technologie, 25% doświadczenie, 20% warunki, 15% kierunek zawodowy. Niewiadome nie otrzymują zera ani zgadywanej oceny. Kompletność jest oddzielną miarą; bez podstaw rating pozostaje nieokreślony. Wymagania konieczne sprawdzane są osobno.

**AC-13:** te same składowe i wagi dają ten sam wynik. Zmiana samych wag przelicza rating bez wywołania AI i zachowuje poprzedni wynik. Dla całkowitego braku podstaw widoczny jest brak oceny, a nie 0/100. Wysoki rating nie znosi wykluczenia. Kompletność uwzględnia wagi ocenialnych kryteriów: przy w pełni ocenialnych technologiach (40%) i doświadczeniu (25%) oraz nieznanych warunkach i kierunku wynosi 65%. Rating normalizujemy do ocenialnej części bez zer za niewiadome. Kompletność uwzględnia również rozpoznaną część wewnątrz składowej: znajomość umowy i trybu pracy przy nieznanych płacy/godzinach nie daje pełnej kompletności warunków. Pominięte i jawnie obojętne kryteria rozróżnia się zgodnie z profilem; brak danych nie staje się oceną zerową.

#### Wynagrodzenie a oczekiwane minimum (Q10)

Jeśli oferta ma porównywalną walutę, okres, umowę i podstawę kwoty, kryterium minimum jest spełnione, gdy widełki obejmują kwotę co najmniej równą oczekiwaniu. Przy minimum 25 tys. i widełkach 20–28 tys. oferta spełnia kryterium, ale pokazujemy częściowe pokrycie oraz brak gwarancji uzyskania 25 tys. Zakres w całości poniżej minimum nie spełnia kryterium; brak wystarczających danych pozostaje niewiadomą.

**Dodatkowe warunki AC-13:** minimum 25 i widełki 20–28 dają spełnienie z komunikatem o częściowym pokryciu; widełki 20–24 nie spełniają, 25–28 spełniają. Porównanie nie konwertuje domyślnie netto/brutto, walut ani okresów.

### R-14 — historia i ręczne oceny

Każda ocena ma wersje wejścia i historię do wglądu. Właściciel może zmienić ocenę. Kolejna ocena AI może zastąpić ręczną, zachowując wcześniejsze wartości. Decyzja właściciela i stan aplikacji są niezależne.

**AC-14:** po ręcznej ocenie i ponownej ocenie AI widoczny jest aktualny wynik AI oraz obie poprzednie operacje w historii z autorem i datą. Notatki, decyzja i etap aplikacji pozostają bez zmian. Wynik dla starego wejścia nie może zostać przedstawiony jako aktualny dla nowego.

## Otwarte kwestie

Powiązane: O-02, O-05, O-06. Szczegóły, konsekwencje i sposób zamknięcia: [wspólny rejestr](../../open-decisions.md). Otwarte kwestie rozpatrujemy przy podejmowaniu tej funkcjonalności; sam szkic nie oznacza gotowości implementacji.

## Etap wykonawczy — ocena na żądanie, 2026-11-03

Właściciel potwierdził jednakowe wagi kryteriów wewnątrz grup. Pierwszy pionowy etap obejmuje ocenę pojedynczego ogłoszenia źródłowego na żądanie z aktywnym, zatwierdzonym profilem. Każde zlecenie jest osobną partią Batch, również dla jednej oferty; przyszłe grupowanie nie zmienia kontraktu wyników. Bez automatycznego researchu i harmonogramu triage w tym etapie. Przyszłe połączenia ofert zachowają oddzielne wersje ogłoszeń.

- AC-B1: zlecenie wymaga aktywnego profilu i jawnej konfiguracji cen Batch; brak konfiguracji nie wysyła danych. Zapisane są wersje wejść, kryteria oraz konfiguracja modelu i cennika.
- AC-B2: rezerwacja korzysta ze wspólnego budżetu z CV. Brak środków pozostawia zlecenie oczekujące. Wyniki rozliczamy w miesiącu rezerwacji. Wątpliwy koszt zachowuje rezerwację.
- AC-B3: stan wysyłania jest trwały przed żądaniem utworzenia partii. Po przerwaniu lub niejednoznacznym błędzie nie ponawiamy płatnego zlecenia automatycznie. Znany identyfikator partii umożliwia dalszy odczyt po restarcie.
- AC-B4: wyniki przypisujemy przez custom_id, nigdy kolejność. Błąd/wygaśnięcie/odmowa/niepełna odpowiedź pozostawiają poprzednie oceny i decyzje bez zmian. Poprawny wynik ma dowody w obu wersjach wejść; brak umiejętności w CV jest niewiadomą.
- AC-B5: szczegóły pokazują stan (w tym możliwość oczekiwania do24h), wynik, składowe, kompletność, uzasadnienia i historię. Zmiana wersji wejść oznacza nieaktualność bez usuwania oceny.
- AC-B6: pliki wejściowe i wynikowe mają ograniczoną retencję; po trwałym odbiorze terminalnego wyniku sprzątamy zdalne pliki, a błąd sprzątania jest ponawiany niezależnie od oceny.

Lokalna kontrola koniecznych warunków rozpoznaje jednoznaczne, strukturalne porównania płacy i trybu pracy. Dowolny tekst pozostałych wymagań pozostaje do sprawdzenia, jeżeli nie można bez zgadywania potwierdzić sprzeczności. Ocena nie jest potwierdzeniem spełnienia wszystkich wymagań koniecznych. Jawna sprzeczność rozpoznana lokalnie blokuje zlecenie. Ręczne oceny, zmiana wag, oceny zbiorcze i filtrowanie listy ocen stanowią dalsze fragmenty R-13/R-14, nie są uznawane za ukończone przez ten etap.

## Oceny na liście i zlecenia zbiorcze — 2026-11-03

Zakres zadania8kt.2: właściciel porównuje zapisane oferty i zleca do100ocen w jednej operacji. Obejmuje R-12–R-14 oraz przegląd listy; ręczne oceny i edycja wag pozostają8kt.3.

- AC-G1: lista pokazuje rating, kompletność, składowe i aktualność najnowszej udanej oceny oraz stan ostatniego zlecenia. Nowe oczekiwanie/błąd nie usuwa wcześniejszego wyniku.
- AC-G2: można filtrować po minimalnym ratingu, kompletności i czterech składowych oraz stanie oceny. Niewiadome nie spełniają progu0; stare oceny nie przechodzą progów bez jawnego wybrania stanu nieaktualne. Sortowanie po dopasowaniu pokazuje aktualne znane wyniki przed nieaktualnymi i bez ratingu; równe wartości mają stałą kolejność.
- AC-G3: zaznaczenie całej strony obejmuje wyłącznie widoczne pozycje; właściciel widzi łączną liczbę oraz maksymalną rezerwację przed zleceniem. Można zaznaczać na kolejnych stronach, a zmiana filtrów czyści zaznaczenie. Nie ma domyślnego zlecenia całej bazy.
- AC-G4: operacja ma identyfikator zapobiegający ponownej wysyłce po utracie odpowiedziHTTP. Oferta już oczekująca jest wykorzystana ponownie; lokalnie wykluczona otrzymuje uzasadnienie bez kosztu. Nowe dopuszczone oferty trafiają do wspólnej partii, każda ma osobne wejście, historię i rezerwację.
- AC-G5: rezerwacja nowych dopuszczonych pozycji jest atomowa dla grupy. Jeśli budżet nie wystarcza na całość, grupa czeka bez częściowo zajętych środków. Po zwiększeniu/odnowieniu budżetu worker wznawia grupę. Nie automatyzuje ponawiania zakończonych ocen.
- AC-G6: nieuporządkowane wyniki są przypisywane przez custom_id. Błąd jednej oceny nie blokuje poprawnych ocen pozostałych pozycji. Po przerwaniu odbioru już rozliczone pozycje nie są rozliczane drugi raz. Pliki partii usuwamy dopiero po trwałym zakończeniu wszystkich jej pozycji.
- AC-G7: przekroczenie100pozycji lub2MiBJSONL jest odrzucane bez nowych rezerwacji i zleceń. Starsze zlecenia pojedynczych ofert oraz importCV nadal działają.

## Ręczne oceny i edycja wag — etap8kt.3, 2026-11-03

- AC-M1: właściciel może utworzyć ocenę bez wcześniejszejAI lub skorygować istniejącą na poziomie kryteriów. Każde kryterium ma ocenę0–100 albo niewiadomą; znana ocena wymaga uzasadnienia. Własna informacja może pozwolić ocenić niewiadomą profilu — pozostaje jawnie oceną właściciela, nie potwierdzeniemAI ani zmianą profilu. Decyzja o aplikowaniu pozostaje odrębna.
- AC-M2: każda operacja tworzy niezmienną rewizję z autoremAI/właściciel/system, wersjami wejść i wag, uzasadnieniem oraz poprzednikiem. Bieżący wynik na liście i w szczegółach korzysta z tej samej rewizji. Poprzednie wartości można przeglądać.
- AC-M3: zapis ręczny wymaga wskazania bieżącej rewizji i wersji wejść; równoległa zmiana powoduje konflikt bez utraty własnego formularza. Powtórzona ta sama komenda nie tworzy kolejnej rewizji. Świeży wynikAI może zastąpić ocenę ręczną, zgodnie z wcześniejszą decyzją właściciela. Wynik starego wejścia pozostaje w historii i nie zastępuje aktualnej oceny dla nowego profilu/ogłoszenia.
- AC-M4: globalne wagi czterech grup można ustawić jako całkowite procenty0–100 sumujące się do100. Początek40/25/20/15, kryteria wewnętrzne równe. Zmiana tworzy wersję wag i przelicza bieżące oceny bezAI i bez nowej rezerwacji budżetu. Historia i źródło składowych pozostają zachowane; niewiadome nie stają się zerami. Nowe wynikiAI korzystają z wag aktualnych w momencie publikacji.
- AC-M5: edycja wag ma kontrolę wersji i idempotencję. Identyczne wagi nie powodują zbędnego przeliczania. Wyniki historyczne zachowują dawne wagi. Przeliczenie nie zmienia treści ocen, profilu, wersji oferty, decyzji ani procesów rekrutacji.

# Lokalne AI i agent researchu — wymagania przekrojowe

Status: **zakres i decyzje produktowe zatwierdzone**, aktualizacja 2026-11-05. Rozmowa właściciela rozstrzygnęła reguły opisane jako potwierdzone. Kontrakty techniczne służą implementacji etapowej, a próby integracji pozostają do wykonania. Przygotowanie tego pakietu nie jest dowodem wdrożenia.

Cel i zakres produktu: [PRD](PRD.md). Kolejność: [plan etapów](README.md). Projekt techniczny: [solution design](solution-design.md). Stan wykonania utrzymuje Beads: `bd show oferty-pracy-334`.

## Potwierdzone decyzje właściciela — aktualizacja 2026-11-04

- Model wszystkich lokalnych zastosowań: **`gpt-oss:20b` w lokalnej Ollamie**, bez wariantu `-cloud`.
- Agent researchu: **OpenCode**. Projekt integruje jego wykonanie i wynik; nie implementuje własnej pętli agenta.
- **Bez limitów korzystania z Ollamy**: brak budżetu, kwot tokenów, liczby wywołań lub rund agenta narzuconych przez aplikację. Nie kopiujemy limitów płatnego OpenAI do lokalnej ścieżki. Parametry rzeczywistego okna kontekstu są właściwością modelu i uruchomienia, nie limitem zużycia aplikacji. Zachowujemy walidację i obsługę błędów, przerwania oraz restartu.

Decyzje te zastępują wcześniejsze propozycje wyboru modelu, własnej pętli agenta oraz limitowania lokalnej pracy. Kontrakty implementacyjne utrzymują przejrzane SD; weryfikacja wykonania nie została przeprowadzona.

## Doprecyzowanie potwierdzone 2026-11-05

Właściciel potwierdził osobny wybór modelu i sposobu wykonania dla profilu, ocen i researchu. Początkowy zestaw: profil i oceny — bezpośrednio Ollama `gpt-oss:20b`; research — OpenCode korzystający z Ollamy `gpt-oss:20b`. Jest to wybór dla lokalnej ścieżki po jej włączeniu, nie automatyczne przekierowanie istniejących instalacji i zleceń OpenAI. OpenCode jest runtime agenta, nie modelem.

Potwierdzono również następujące reguły:

- Konfiguracja serwerowa w `.env`, bez ekranu wyboru przy każdym zleceniu. Dokładny format zmiennych pozostaje kontraktem SD.
- Dostępność skonfigurowanego modelu sprawdzamy przez API listy modeli Ollamy (`GET /api/tags`). Brak modelu daje jawny błąd bez automatycznego pobierania lub fallbacku. Nie wymagamy benchmarków ani osobnego pilota jakości odpowiedzi; przydatność ocenia właściciel podczas normalnego używania. Walidacja odpowiedzi i testy techniczne integracji pozostają.
- Anulowanie próbuje zatrzymać agenta, jeśli runtime to umożliwia. Samą utratą połączenia nie potwierdzamy zatrzymania. Zasady restartu/unknown, kolejki i jawnego retry określają LA-11/15 oraz kontrakty runtime.
- Bezterminowo zachowujemy raporty, dowody, sesje, rozmowy, zdarzenia i diagnostykę; bez automatycznego usuwania lub rotacji niszczącej dane. Sekretów nadal nie zapisujemy. Dotyczy danych tej integracji, nie zmienia istniejącego cleanup plików u dostawcy OpenAI.
- Każda nowa lokalna grupa ocen ma maksymalnie 20 pozycji. Większe zlecenie dzielimy na grupy do 20, np. 30 → 20 + 10; wszystkie pozycje pozostają w zleceniu. To porcjowanie pracy, nie kwota korzystania z modelu. Zachowujemy osobne wyniki i liczniki stanów.

Potwierdzono Google przez przeglądarkę jako początkowy sposób wyszukiwania. Nie korzystamy na tym etapie z płatnego API wyszukiwarki. Chrome DevTools MCP, interwencja i zakres materiałów zostały wybrane; sprawność integracji podlega bramkom technicznym T03–T05. Nie gwarantujemy dostępności Google. Właściciel rozszerzył zakres o [panel zarządzania zadaniami](features/panel-zadan/requirements.md): sprawdzenie, zatrzymanie i pominięcie. Semantyka tych poleceń i zakres panelu zostały potwierdzone w wymaganiach panelu; najnowsze uzupełnienie dotyczące kolejki znajduje się poniżej. Kontrakt integracji/restartu opisują SD i kontrakty runtime; jego działanie wymaga testów przypiętej wersji.

## Relacja do istniejących wymagań

To rozszerzenie sposobów wykonywania AI, nie nowa definicja profilu, oceny ani researchu. Nadal obowiązują reguły [profilu](../pierwsza-wersja/features/profil/requirements.md), [dopasowania](../pierwsza-wersja/features/dopasowanie/requirements.md), [researchu](../pierwsza-wersja/features/firmy-research/requirements.md) oraz [operacji i budżetu](../pierwsza-wersja/features/operacje/requirements.md).

Dotychczasowe wymagania AC-B1 i AC-G4–G7 opisują wykonanie ocen przez Batch. Proponowane rozszerzenie zachowuje je dla OpenAI Batch; lokalne oceny mają grupę niezależnych zadań, bez obowiązku tworzenia pliku JSONL. Przed tym etapem trzeba dopisać ten zakres do kanonicznej pary dopasowania. Nie zmieniamy po cichu znaczenia dotychczasowych kryteriów.

Szczegółowy zakres każdego etapu, lokalne kryteria E01–E09 i ich weryfikację zawierają [osobne pary Requirements/SD](README.md#requirements-i-sd-każdego-etapu). LA-01–LA-21 poniżej pozostają kanonicznymi kryteriami przekrojowymi.

## Wymagania i akceptacja

| ID | Zachowanie | Kryterium akceptacji |
| --- | --- | --- |
| LA-01 | Dostawcę i model można wybrać osobno dla profilu, ocen i researchu; nieobsługiwana kombinacja jest jawnie odrzucana. | Konfiguracja mieszana działa. Brak konfiguracji lub wymaganej zdolności nie wysyła danych; nie przełącza dostawcy automatycznie. |
| LA-02 | Refaktor zachowuje istniejące wyniki, historię i aktywne operacje OpenAI. | Starsze konfiguracje i partie można odczytać, odebrać i posprzątać po wdrożeniu. Identyczne komendy nie tworzą kolejnych operacji; dotychczasowe testy przechodzą. |
| LA-03 | Wybór wykonawcy, modelu, wersji instrukcji, wejść, parametrów uruchomienia oraz cen usług płatnych jest utrwalany przy zleceniu. | Zmiana konfiguracji środowiska nie przekierowuje oczekującej operacji. Dla agenta zapisujemy runtime OpenCode i identyfikator sesji. Sekrety nie są zapisywane w migawce. Nowe zlecenie korzysta z nowych ustawień. |
| LA-04 | Lokalny import profilu nie wymaga klucza OpenAI ani cennika płatnego modelu. | Przy pustym kluczu i cenniku Ollama przygotowuje propozycję przechodzącą dotychczasową kontrolę cytatów. Profil zmienia się dopiero po zatwierdzeniu. |
| LA-05 | Lokalne oceny pojedyncze i zbiorcze zachowują zasady dopasowania. | Te same walidatory dowodów, niewiadomych, ratingu, aktualności i historii co dla OpenAI. Błąd jednej pozycji nie usuwa poprawnych wyników innych; ponowne dostarczenie nie publikuje drugi raz tej samej oceny. |
| LA-06 | Koszt i zużycie są niezależne od powodzenia zadania. | Lokalny model ma koszt API równy zero nawet przy braku telemetrii tokenów; nie udajemy zerowego zużycia. Wyczerpany budżet usług płatnych nie blokuje wyłącznie lokalnej pracy. Płatne narzędzia nadal wymagają rezerwacji. |
| LA-07 | OpenCode wykonuje research z modelem `gpt-oss:20b`, wyszukiwaniem i odczytem stron; raport sprawdza moduł researchu. | Projekt nie implementuje drugiej pętli agenta. OpenCode nie zapisuje bezpośrednio raportów ani powiązań firm. Twierdzenia odwołują się do rzeczywiście otrzymanych dowodów; brak źródeł pozostaje jawnym niepowodzeniem lub niewiadomą zgodną z istniejącym kontraktem. Stary raport pozostaje dostępny. |
| LA-08 | Lokalna praca nie ma kwot zużycia Ollamy; ma kontrolowany stan wykonania i przebieg po restarcie. | Długi przebieg nie jest przerywany z powodu kwoty tokenów, wywołań, rund ani stałego deadline lokalnej pracy. Brak modelu, zły JSON, przekroczenie fizycznego kontekstu, błąd narzędzia, przerwanie i awaria procesu mają jawny stan. Restart sprawdza konkretną sesję OpenCode, nie uruchamia drugiego agenta dla już aktywnej operacji ani ponownego płatnego wywołania o nieznanym skutku. |
| LA-09 | Narzędzia researchu czytają wyłącznie dozwolone publiczne zasoby. | Brak dostępu do plików, powłoki i zapisu danych przez agenta. Odczyt blokuje adresy prywatne i lokalne także po przekierowaniu oraz rozwiązaniu DNS; treść stron i argumenty narzędzi podlegają limitom i walidacji. Wyjątek dla skonfigurowanego lokalnego adresu Ollamy nie obejmuje narzędzi WWW. |
| LA-10 | Jedno wspólne wdrożenie zachowuje rozpoznawalność sposobu wykonania i możliwość zmiany nowych zleceń. | UI i historia pokazują dostawcę/model oraz właściwy stan lokalny lub Batch. Można wrócić do OpenAI dla nowych zadań bez kasowania lokalnej historii i bez przepisywania oczekujących zadań. |

Koszt API równy zero nie oznacza zerowego kosztu energii lub sprzętu. Lokalność modelu nie oznacza pracy researchu offline: zapytania trafiają do wybranego źródła wyszukiwania, a odczyt odwiedza strony publiczne. Nie przekazujemy wyszukiwarce CV ani pełnego profilu zawodowego.

## Granice zakresu

Pierwszy agent obsługuje istniejący ręczny research podstawowy. Research pogłębiony i automatyzacja progów pozostają osobnymi pracami; nie uznajemy ich za ukończone przez ten refaktor. Nie zmieniamy zasad ratingu, decyzji właściciela, importu ogłoszeń, kopii zapasowych ani stosu aplikacji.

Pierwsze wydanie nie obejmuje automatycznego wyboru modelu, pobierania modeli, fallbacku do chmury, dowolnych narzędzi agenta ani budowy ogólnej platformy agentowej. Nowy ekran ustawień nie jest warunkiem pierwszego wydania — potwierdzona konfiguracja jest serwerowa w `.env`.

## Rozstrzygnięcia i warunki techniczne

| ID | Co ustalić | Co blokuje |
| --- | --- | --- |
| O-L1 | Wybór modelu zamknięty: `gpt-oss:20b`; runtime agenta zamknięty: OpenCode. Sprawdzać dostępność modelu przez GET /api/tags i poprawność technicznej integracji. Bez osobnego pilota jakości odpowiedzi; jakość ocenia właściciel w normalnym użyciu. | Gotowość połączenia i obecność modelu; nie wymaga benchmarku, ponownego wyboru modelu ani runtime. |
| O-L2 | Decyzje zamknięte: Google, Chrome DevTools MCP, stan per wykonanie, interwencja i archiwum. Kontrakt techniczny opisany w kontraktach runtime. | Weryfikacja T03–T05 przed włączeniem narzędzi live; nie blokuje profilu ani ocen. |
| O-L3 | HTTP OpenCode, sesje, wspólna kolejka jednej lokalnej pracy AI, restart, anulowanie, wynik i retencja opisane w kontraktach runtime. | T01/T02 przed włączeniem agenta live: dowód działania przypiętej wersji, bez benchmarku jakości. |
| O-L4 | Przegląd pary właściwego etapu i aktualnego kodu przed realizacją. Decyzje właściciela zapisane powyżej są zatwierdzone; nie otwieramy ich ponownie przy każdym etapie. | Gotowość wykonawcza konkretnego zadania; odchylenie od zatwierdzonego zachowania zgłaszamy właścicielowi, rutynowe szczegóły wykonawca rozstrzyga w ramach SD. |

OpenCode jest wybranym runtime agenta. Projekt potrzebuje adaptera uruchomienia/sesji, konfiguracji dedykowanego agenta researchu i integracji dowodów; nie potrzebuje własnego frameworka agentowego.

## Potwierdzenie panelu — 2026-11-05

Pierwszy zakres to zadania AI. Akcje obejmują pojedynczą pozycję albo grupę do 20, nie całe zlecenie nadrzędne. Pomiń próbuje zatrzymać i blokuje publikację, pozwalając kontynuować grupę. Jawne ponowienie jest dozwolone także przy running/unknown: poprzednie wykonanie traci prawo publikacji i otrzymuje próbę zatrzymania; jego późną odpowiedź zachowujemy do wglądu. Automatyczne recovery nadal nie uruchamia duplikatu. Pozostałe potwierdzone reguły: [panel zadań](features/panel-zadan/requirements.md). Flow Google przez dedykowaną przeglądarkę z interwencją użytkownika przy blokadzie został zaakceptowany.

Potwierdzona decyzja 2026-11-05: OpenCode steruje dedykowanym Google Chrome przez **Chrome DevTools MCP** (`chrome-devtools-mcp`). Playwright MCP nie wchodzi do wybranej integracji. Szczegóły: [SD etapu 7](etapy/07-narzedzia-www/solution-design.md). Wybór nie oznacza uruchomienia implementacji ani instalacji usług.

## Kolejka agentów, przeglądarka i wznowienie — potwierdzone 2026-11-05

Poniższe decyzje zastępują wcześniejsze sprzeczne propozycje. Ich potwierdzenie nie uruchamia implementacji.

| ID | Potwierdzona reguła | Kryterium akceptacji |
| --- | --- | --- |
| LA-11 | Ze względu na małe zasoby komputera wykonania profilu, pojedynczych ocen i researchu trafiają do wspólnej trwałej kolejki; najwyżej jedna lokalna praca AI trwa naraz w całej instalacji. To samo ograniczenie obejmuje bezpośrednie wywołania Ollamy dla profilu i ocen. | Dwa zlecenia dowolnych lokalnych rodzajów, także pobrane przez różne workery, nie wykonują dwóch lokalnych prac AI równolegle. Oczekiwanie na interwencję, cancelling i unknown zachowują zajętość do potwierdzenia zakończenia pracy. Retry można zapisać od razu, lecz jego start czeka na zwolnienie miejsca. Restart lub wygaśnięcie lease nie pozwala uruchomić drugiego agenta przy niepewnym stanie pierwszego. |
| LA-12 | Każde wykonanie ma własną sesję OpenCode i stan dedykowanego Chrome. Publiczne strony, bez logowania na konta właściciela; nowe wykonanie zaczyna z czystym stanem. Cookies pozostają w obrębie wykonania, także podczas interwencji i wznowienia. | Kolejne wykonanie nie dziedziczy cookies ani kart poprzedniego; wznowienie tego samego wykonania zachowuje jego stan, o ile środowisko nadal istnieje. Stan wykonania jest powiązany z jego ID, a brak możliwości odtworzenia jest jawny. |
| LA-13 | Zachowujemy faktycznie przekazany agentowi tekst, URL, tytuł, czas odczytu i ID wykonania, rozróżniając snippet Google od odczytanej strony. Zachowujemy rozmowę i wywołania narzędzi. Zrzuty ekranu wykonujemy przy blokadach, błędach i interwencji użytkownika. | Raport wskazuje zapisane wersje dowodów. Nie zapisujemy domyślnie wszystkich zasobów strony ani całego ruchu sieciowego. Zebrane materiały zachowują bezterminową retencję bez sekretów. Profil Chrome, cookies i cache są usuwalnym stanem roboczym po potwierdzonym zakończeniu i zapisie materiałów; nie usuwamy ich podczas aktywności lub interwencji. Sprzątanie nie usuwa archiwum. |
| LA-14 | Ollama i OpenCode są osobnymi lokalnymi usługami uruchamianymi przygotowanymi poleceniami/skryptem. Aplikacja łączy się z adresami z `.env`, sprawdza dostępność i pokazuje błędy; środowisko researchu zarządza Chrome. | Instrukcja uruchomienia obejmuje usługi i przeglądarkę. Niedostępna usługa daje jawny stan bez automatycznego przełączenia do chmury. Nie powstaje osobna aplikacja użytkowa. |
| LA-15 | Po usunięciu blokady użytkownik wybiera „Wznów” w panelu. Kontynuowane jest to samo wykonanie; restart najpierw sprawdza istniejącą sesję. Brak potwierdzenia stanu daje unknown. | Wznów nie tworzy nowego wykonania ani drugiej aktywnej sesji. Jawne ponowienie tworzy nowe ID i blokuje publikację poprzedniego wyniku, ale start nadal respektuje LA-11. |

O-L2: decyzje produktowe o przeglądarce, cookies, dowodach i interwencji są zamknięte; pozostaje weryfikacja techniczna izolacji i przechwytywania materiałów. O-L3: wybrano headless HTTP OpenCode i osobne usługi; korelacja, recovery, wynik i przerwanie wymagają technicznego sprawdzenia przypiętej wersji. Nie jest potrzebny benchmark jakości modelu.

Szczegóły techniczne wykonania i ich bramki mają jedno miejsce utrzymania: [kontrakty runtime](kontrakty-runtime.md). Instrukcja wejścia wykonawcy: [przekazanie lokalnemu modelowi](przekazanie-lokalnemu-modelowi.md).

## Wynik wywiadu grill-me — zatwierdzone 2026-11-05

Właściciel potwierdził wspólne rozumienie Q1–Q13. Poniższe reguły wraz ze zmienionymi LA-11/13 zastępują wcześniejsze propozycje. Etapy wyznaczają implementację, nie osobne wydania.

| ID | Potwierdzona reguła | Kryterium akceptacji |
| --- | --- | --- |
| LA-16 | Cały epik wdrażamy wspólnie, z panelem zadań. | Odbiór wydania obejmuje wszystkie dziewięć etapów i PZ-01–08. Profil/oceny/research można testować kolejno podczas implementacji, ale nie stanowi to oddzielnego wydania dla właściciela. |
| LA-17 | Ponów jest ręczne i zachowuje wejście, instrukcje, schemat, model i parametry poprzedniego wykonania. | Po zmianie profilu lub `.env` retry nadal ma identyczną migawkę i nowe execution ID; brak zapisanej wersji modelu daje błąd, bez podmiany. Użycie nowych danych/ustawień wymaga nowego zlecenia. Zły JSON, cytaty i raport kończą próbę bez kolejnej automatycznej generacji; odpowiedź i błąd zostają do wglądu. |
| LA-18 | Aplikacja raportuje problemy infrastruktury, nie naprawia usług. | Nie restartuje ani nie rekonfiguruje automatycznie Ollamy, OpenCode lub infrastruktury sieciowej. Instrukcja awaryjna opisuje ręczne zakończenie dedykowanego środowiska OpenCode/Chrome oraz w razie potrzeby ręczny restart Ollamy. Health sam nie potwierdza końca starego wykonania; kolejkę zwalnia dopiero potwierdzenie. |
| LA-19 | W lokalnym researchu Google służy do znalezienia źródła, a ustalenie raportu wymaga faktycznie odczytanej publicznej strony. | Sam snippet z Google nie wystarcza do publikacji faktu/opinii; pozostaje w archiwum, nie w zbiorze dopuszczalnych dowodów twierdzenia. Gdy nie ma podstaw do poprawnego raportu, jawny brak danych nie zastępuje poprzedniego raportu. |
| LA-20 | Zapytania korzystają wyłącznie z danych firmy i stanowiska, bez danych z profilu zawodowego. | Dozwolone nazwa firmy, domena, kraj, stanowisko i technologie z ogłoszenia. Dane kontaktowe, historia zatrudnienia, doświadczenie i preferencje właściciela nie trafiają do zapytań ani narzędzi publicznych. |
| LA-21 | Research sprawdza dotychczasowe kategorie i kończy je ustaleniami lub jawnymi niewiadomymi. | Instrukcja wymaga próby sprawdzenia każdej kategorii, bez obowiązku znalezienia wszystkich odpowiedzi. Blokada pojedynczej strony powoduje próbę innych znalezionych publicznych źródeł, bez logowania lub obchodzenia blokad. Interwencja dotyczy blokady dalszej publicznej pracy, np. CAPTCHA Google, i nadal zajmuje lokalny slot. |

Logowanie do portali i parkowanie sesji z przejściem do następnego zadania nie należą do tego wydania. Osobne przyszłe zadanie: `oferty-pracy-281`, po odbiorze epiku. Samo oczekiwanie na interwencję w obecnej wersji nie zwalnia slotu. Grupa do 20 oznacza do 20 niezależnych ocen/żądań, a nie jeden prompt z wieloma ofertami.

## Doprecyzowanie gotowości technicznej — 2026-11-05

Przegląd specyfikacji etapów zapisano w ich parach. Po sugestii właściciela projekt wykorzystuje headless Chrome w kontenerze, z podglądem i ręczną interwencją przez DevTools; Google, Chrome DevTools MCP, publiczne źródła i brak logowania pozostają zatwierdzone. [Kwalifikacja](kwalifikacja-runtime.md) (`334.21`) jest zależnością etapu 7 i pośrednio 8/odbioru. Nie blokuje refaktorów ani lokalnego profilu/ocen. Testy izolacji i ręcznej interwencji są obowiązkowe; wybór headless nie usuwa tych kryteriów.

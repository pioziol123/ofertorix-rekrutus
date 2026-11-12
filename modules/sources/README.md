# Źródła ofert

Docelowa architektura modułu `modules/sources/`. Moduł odpowiada za katalog źródeł, zakres i wykonanie pobierania oraz zapis ogłoszeń źródłowych, ich rewizji i dostępności.

**Ogłoszenie źródłowe** to wpis w konkretnym portalu. Ta sama rekrutacja może mieć kilka ogłoszeń z osobnymi linkami, historią i dostępnością. Moduł **Oferty** odpowiada za powiązanie ich z jedną ofertą pracy i jej prezentację. **Dopasowanie** korzysta z zapisanej rewizji ogłoszenia i odpowiada za aktualność oceny. **Firmy** korzystają z treści ogłoszenia przy wiązaniu go z firmą. [Słownik domenowy](../../GLOSSARY.md) · [Mapa modułów](../../docs/architecture/moduly.md)

## Publiczne operacje

| Operacja | Kontrakt |
| --- | --- |
| Odczyt katalogu źródeł | Udostępnia identyfikatory źródeł i informacje potrzebne do wyboru źródła oraz zakresu pobierania. |
| Zlecenie pobrania | Przyjmuje źródło, parametry zakresu i przyczynę uruchomienia. Zwraca identyfikator przebiegu, jeśli zlecenie tworzy przebieg lub korzysta z aktywnego. |
| Odczyt statusu przebiegu | Udostępnia źródło, zapisany zakres, status, daty, liczniki wyników i diagnostykę. |
| Odczyt ogłoszeń | Udostępnia zapisane ogłoszenia do listy i szczegółów. Aktualna treść i jej identyfikator rewizji pochodzą z tej samej wersji. Można odczytać historię oraz wskazaną rewizję. |

API, CLI i harmonogram przekazują zlecenia do modułu. Oferty, Dopasowanie i Firmy korzystają z interfejsu odczytu ogłoszeń. Moduł ukrywa przed klientami sposób przechowywania danych.

## Zakres i przebieg pobierania

**Zakres** określa, co sprawdzamy w jednym źródle. Obejmuje filtry, np. technologię i seniority, oraz ustawienia pobierania, np. sortowanie i limity. Zlecenie może korzystać z parametrów podanych przez użytkownika albo z konfiguracji źródła. Moduł przypisuje zakres przy tworzeniu przebiegu i używa zapisanego zakresu przy wykonaniu.

**Przebieg** to jedno wykonanie pobierania dla jednego źródła i zakresu. Może obejmować wiele zapytań i porcji wyników. W ścieżce kolejkowej utworzenie przebiegu i zlecenie zadania są atomowe. Zadanie przekazuje identyfikator jednego przebiegu, a worker deleguje jego wykonanie do modułu.

| Stan | Znaczenie |
| --- | --- |
| `queued` | Przebieg zapisany i oczekujący na wykonanie. |
| `running` | Przebieg przejęty do wykonania. Powtórne dostarczenie zadania nie uruchamia drugiego wykonania. |
| `complete` | Sprawdzono cały ustalony zakres. |
| `partial` | Sprawdzono część zakresu. Poprawnie zapisane wyniki są dostępne. |
| `failed` | Pobierania nie udało się wykonać, np. nie dało się rozpocząć pracy albo wystąpił błąd przed uzyskaniem użytecznych wyników. |

### Odpowiedzialności wewnątrz modułu

| Część modułu | Odpowiedzialność |
| --- | --- |
| Serwis uruchamiania kolektora | Przejmuje przebieg, odczytuje źródło i zakres, odnajduje konektor przez `ConnectorProvider` i uruchamia go przez wspólny interfejs. Przekazuje wyniki do zapisu, ustala końcowy status i uruchamia wspólną regułę dostępności. |
| Serwis zapisu metadanych przebiegu | Tworzy i odczytuje przebiegi oraz utrwala ich przejęcie i zakończenie. Przechowuje źródło, zakres, przyczynę uruchomienia, daty, identyfikator zadania, status, liczniki i diagnostykę. Udostępnia stan potrzebny do obsługi przerwanych przebiegów. |
| Serwis zapisu wyników | Zapisuje porcje ogłoszeń, ich rewizje i obserwacje w przebiegu. Zwraca liczniki potrzebne do podsumowania. Zapisuje porcje w miarę ich otrzymywania, więc późniejszy błąd zachowuje wcześniej zapisane wyniki. |

## Konektory

Każdy konektor ma własny podkatalog w `modules/sources/infrastructure/adapters/connectors/` i implementuje wspólny interfejs. Przyjmuje zakres, zwraca ujednolicone ogłoszenia w jednej lub wielu porcjach oraz raportuje kompletność wyniku. Jeśli źródło podaje status ogłoszenia lub datę ważności, konektor przekazuje tę informację wraz z ogłoszeniem. Brak takiej informacji pozostaje niewiadomą.

`ConnectorProvider` jest wspólnym miejscem rejestracji i wyszukiwania konektorów po stałej, unikalnej nazwie. Kod uruchamiający korzysta z providera i wspólnego interfejsu. Dodanie konektora wymaga implementacji interfejsu we własnym podkatalogu i rejestracji. Szczegóły dostępu do portalu, walidacji odpowiedzi i przechodzenia przez strony pozostają w konektorze.

## Ogłoszenia i rewizje

- **Tożsamość.** Ogłoszenie identyfikuje para źródło i identyfikator w tym źródle. Ponowne pobranie tego samego wpisu, również w innym zakresie, aktualizuje to samo ogłoszenie.
- **Rewizja.** Pierwszy zapis i każda zmiana zapisanej treści tworzą rewizję. Identyczna treść zachowuje aktualną rewizję. Starsze rewizje pozostają dostępne przez interfejs odczytu.
- **Obserwacja.** Moduł zapisuje, że dany przebieg widział ogłoszenie, również gdy jego treść się nie zmieniła. Obserwacja wiąże przebieg z ogłoszeniem i pozwala porównać wyniki po zakończeniu pobierania.

## Dostępność ogłoszenia

Moduł stosuje wspólną regułę dostępności. Konektor dostarcza dane z portalu i informację o kompletności pobrania. Konfiguracja źródła określa, czy brak w pełnym wyniku jest podstawą do oznaczenia ogłoszenia jako niedostępnego.

- **Informacja ze źródła.** Jawny status jest częścią danych ogłoszenia. Wygaśnięcie może też wynikać z upływu daty ważności podanej przez portal.
- **Brak w pełnym wyniku.** Jeśli konfiguracja źródła na to pozwala, moduł porównuje zapisane ogłoszenia z obserwacjami bieżącego przebiegu w tym samym źródle i zakresie. W SOLID.Jobs, jeśli znane były A, B i C, a pełny przebieg znalazł A, C i D, moduł oznacza B jako niedostępne w źródle. Zapis niedostępności i oznaczenie przebiegu jako `complete` odbywają się w jednej transakcji.
- **Brak wystarczających danych.** Niepełny lub nieudany przebieg pozostawia dostępność niewidzianych ogłoszeń bez zmian. To samo dotyczy pełnego wyniku, jeśli źródło nie daje podstaw do wnioskowania z braku, jak w wyszukiwaniu Himalayas.

Niedostępność, wygaśnięcie i ponowne pojawienie się dotyczą konkretnego ogłoszenia. Jego historia pozostaje dostępna. Stan rekrutacji i stan pozostałych ogłoszeń tej samej oferty są odrębne.

## Refaktoryzacja

Realizację modelu śledzi epik Beads `oferty-pracy-0mq` **Poprawki architektury kodu**. Odczyt ogłoszeń i rewizji opisuje `oferty-pracy-0mq.6`, a wspólną regułę dostępności po pełnym przebiegu `oferty-pracy-0mq.7`.

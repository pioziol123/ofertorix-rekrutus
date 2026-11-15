# Architektura modułów — PRD

Epik Beads: `oferty-pracy-0mq`. Szczegóły: [wymagania](requirements.md), [rozwiązanie](solution-design.md). Uzgodniony podział na moduły: [mapa modułów](../../architecture/moduly.md) i [zasady architektury](../../architecture/moduly-i-zasady-kodu.md).

## Problem

System jest rozwijany przez właściciela i agentów kodujących. Podział na moduły jest uzgodniony, ale kod go nie odzwierciedla:

- moduły korzystają bezpośrednio z cudzych danych;
- każde źródło ofert ma własną kopię procesu pobierania, więc reguły różnią się między źródłami przypadkiem;
- zmiany kilku modułów nie mogą zapisać się razem;
- profil zawodowy zna szczegóły dostawców AI.

Każda zmiana źródła, dostawcy AI albo reguły biznesowej wymaga przez to poprawek w wielu miejscach, co podnosi ryzyko błędów i koszt pracy.

## Cel

- Każdy moduł jest właścicielem swoich danych i reguł. Pozostałe części systemu korzystają z niego wyłącznie przez jego publiczne operacje.
- Wszystkie źródła ofert są pobierane jednym procesem i według jednych reguł, niezależnie od sposobu uruchomienia.
- Operacja obejmująca kilka modułów zapisuje się w całości albo wcale.
- Moduły zlecające pracę AI nie znają szczegółów dostawców.

## Co zmienia się dla właściciela

Aplikacja działa jak dotąd, z kilkoma wyjątkami:

- **Synchronizacja źródeł** ma jednakowe reguły dla wszystkich źródeł i sposobów uruchomienia. Jedno źródło pobiera naraz jeden zakres. Kolejne zlecenia czekają w kolejce bez dublowania, a ponowne pobranie tego samego dnia jest dozwolone.
- **Harmonogram** pobiera dane codziennie także wtedy, gdy właściciel uruchomił pobieranie ręcznie tego samego dnia.
- **Przebiegi oczekujące** w chwili wdrożenia nowej kolejki trzeba zlecić ponownie.
- **Powtórzone ogłoszenie** nie przerywa pobierania.
- **Niedostępność ogłoszenia** po pełnym sprawdzeniu zakresu wynika z historii, w których zakresach ogłoszenie było widziane.
- **Zadania w tle** poza synchronizacją źródeł (oceny, import CV, research firm) do czasu osobnego zadania `oferty-pracy-0mq.15` nie wykrywają przerwania pracy. Zmiana jest świadomie zaakceptowana.

## Poza zakresem

- Przeniesienie widoków aplikacji.
- Wdrożenie grupowania ogłoszeń w oferty pracy.
- Nowe gwarancje obsługi i rozliczania zadań AI. Należą do epiku `oferty-pracy-sq2`.
- Zabezpieczenie zadań w tle przed przerwaniem pracy: zadanie `oferty-pracy-0mq.15`.

## Sukces

- Po każdym zadaniu epiku aplikacja działa i przechodzi wszystkie kontrole jakości.
- Właściciel sprawdza na `master` listę i szczegóły ofert, synchronizację źródeł, import CV, oceny dopasowania i research firm.
- Dodanie nowego źródła ofert albo dostawcy AI nie wymaga zmian w pozostałych modułach.

## Etapy

| Etap | Zadania |
| --- | --- |
| Wspólny dostęp do danych | [0mq.13](requirements.md#a13) |
| Jeden proces synchronizacji źródeł | [0mq.1](requirements.md#a1), [0mq.2](requirements.md#a2), [0mq.3](requirements.md#a3), [0mq.4](requirements.md#a4), [0mq.5](requirements.md#a5), [0mq.16](requirements.md#a16), [0mq.7](requirements.md#a7) |
| Moduły Oferty i Profil zawodowy z publicznymi odczytami | [0mq.8](requirements.md#a8), [0mq.6](requirements.md#a6), [0mq.10](requirements.md#a10) |
| Moduł AI z ogólnym kontraktem | [0mq.14](requirements.md#a14), [0mq.9](requirements.md#a9), [0mq.11](requirements.md#a11), [0mq.17](requirements.md#a17) |
| Usunięcie obejść i docelowe katalogi | [0mq.18](requirements.md#a18), [0mq.12](requirements.md#a12) |

Ten epik przejmuje etapy 1–4 epiku `oferty-pracy-334` (zadania `334.2`–`334.5`).

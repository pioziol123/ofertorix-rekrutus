# Ponowny przegląd po rozstrzygnięciach Q1–Q15

Status: **historyczny przegląd; zalecenie globalnego dopracowywania SD zastąpione pracą per funkcjonalność**. Zapis decyzji Q1–Q15 pozostaje aktualny. Obowiązuje [nowy cykl pracy](README.md#cykl-pracy-nad-funkcjonalnością).

Pierwotny zakres: przegląd zgodności dokumentacji z ostatnimi decyzjami właściciela; nie odbiór produktu ani potwierdzenie gotowości całej implementacji. Podstawa: potwierdzenia Q1–Q15 oraz korekta rozbieżności Q7–Q8 w rozmowie. Status pracy: `bd show oferty-pracy-boe`.

## Przeniesione decyzje

| Decyzje | Miejsce utrzymania reguł | Wynik uzgodnienia |
| --- | --- | --- |
| Q1–Q5 | [Profil, R-01](features/profil/requirements.md#r-01--profil-zawodowy) | Tekstowy PDF/DOCX lub wklejenie, bez OCR, propozycja do zatwierdzenia. Ponowny import zachowuje profil/preferencje; osobny formularz oczekiwań, pomijanie pytań i późniejszy powrót. |
| Q6–Q10 | [Dopasowanie, R-03 i R-13](features/dopasowanie/requirements.md) | Ważona i częściowa kompletność, bez zer za niewiadome. Pasujący wariant spełnia kryterium z komunikatem rozbieżności. Minimum osiągalne w części widełek kwalifikuje ofertę, bez gwarancji płacy. |
| Q11 | [Firmy/research, R-15](features/firmy-research/requirements.md#r-15--tożsamość-i-role-organizacji) | Research dostępnej marki/agencji mimo nieznanego pracodawcy/klienta, bez zgadywania tożsamości i przenoszenia zakresu. |
| Q12 | [Oferty, R-09](features/oferty/requirements.md#r-09--odwracalne-połączenie) | Właściciel rozstrzyga tożsamość aktywnych procesów przed połączeniem; odrębne aplikacje i ich dane nie giną. |
| Q13 | [Operacje, R-25](features/operacje/requirements.md#r-25--budżet) | Miesiąc rezerwacji jest miesiącem kosztu próby; niepewna rezerwa nie znika, nowe retry ma nową rezerwację. |
| Q14–Q15 | [Rekrutacje, R-22–R-23](features/rekrutacje/requirements.md) | Jawne etapy/wyniki, ręczna zmiana, rozmowy/zadania osobno; archiwizacja zamiast trwałego kasowania w v1. |

## Naprawiona spójność między dokumentami

- Usunięto nieaktualną propozycję traktowania sprzecznych wariantów jako niewiadomej; kwalifikacja i komunikacja UI wskazują teraz tę samą regułę.
- Uzupełniono badanie marki/agencji i deduplikację po typowanym celu raportu, zamiast wymagania zawsze rozpoznanej organizacji.
- Uzgodniono dokumenty ofert i rekrutacji: połączenie nie może usuwać odrębnej aktywnej aplikacji przez założenie „zawsze jeden proces na ofertę”.
- Zastąpiono otwarte zapisy o granicy miesiąca i etapach potwierdzonymi regułami.
- Archiwizacja jest odrębna od dostępności źródła, wygaśnięcia i wyniku rekrutacji. Zakres PRD oraz widoki uwzględniają archiwum bez trwałego kasowania.
- Zachowano jeden PRD i 10 par requirements/solution-design. Nie przywrócono zbiorczej pary, nie zmieniono identyfikatorów R/AC.

## Pozostałe luki projektu rozwiązania

| Obszar | Stan i konsekwencja |
| --- | --- |
| Dokładny kalkulator i filtry (O-02) | Reguły produktowe potwierdzone. Przed implementacją kalkulatora należy dopisać jednoznaczne jednostki kryteriów, wagi wewnętrzne, zachowanie „bez znaczenia”, przykłady liczbowe oraz współzależne warianty. Obecny opis SD jest propozycją, nie kompletnym kontraktem algorytmu. |
| Relacje ofert/aplikacji oraz celu raportu (O-03) | Reguły zachowania danych potwierdzone. Schemat i komendy muszą precyzyjnie obsłużyć odrębne rekrutacje i odwracalne powiązania, a raport wskazywać organizację lub markę. Wymaga dopracowania SD, bez zmiany zaakceptowanego zachowania. |
| Przelicznik i limit płatnego wywołania (O-04/O-06) | Miesiąc kosztu potwierdzony. Pozostaje techniczny dobór wersjonowanego przelicznika i twardych limitów wejścia/wyjścia/narzędzi. Estymacja średniego kosztu nie dowodzi górnej granicy. |
| Konfiguracja właściciela (O-05) | Konkretne wartości profilu i zakresu oraz godzina pobrania do ustawienia przed startem; progi automatycznego researchu po próbce ocen. Nie trzeba wymyślać tych wartości przy projektowaniu formularza. |
| Weryfikacja techniczna (O-06) | Wersje, biblioteki ekstrakcji, migracje, timeouty i retencja kolejki do dobrania i sprawdzenia. Dostęp, koszty i jakość AI nadal niezmierzone. |

To są kolejne prace nad dokumentacją/projektem, a nie zatwierdzone zadania implementacyjne. Zgodnie z późniejszą decyzją właściciela wracamy do tych kontraktów dopiero przy wyborze właściwej funkcjonalności. Przegląd jej wymagań i SD poprzedza kod, lecz nie wymaga wcześniejszego ukończenia całego pakietu.

## Granice weryfikacji

Sprawdzono lokalne odnośniki i kotwice, pojedynczą własność 30 wymagań/AC oraz wskazanie ich we właściwych SD. Kryteria pozostają planem przyszłych testów. Nie wykonano testów aplikacji, płatnych wywołań, wdrożenia, commitu ani push.

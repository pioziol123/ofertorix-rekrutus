# Przeglądanie ofert i firm — wymagania

Potwierdzone decyzje właściciela zachowują ważność. Pozostały opis i propozycje techniczne wymagają aktualizacji względem wybranego zakresu i stanu aplikacji zgodnie z [cyklem pracy](../../README.md#cykl-pracy-nad-funkcjonalnością). Wcześniejsza akceptacja pakietu nie oznacza zamrożenia tego szkicu.

Status: **bieżący wycinek listy zrealizowany; reszta szkic**, 2026-10-31. Funkcjonalność pod wspólnym [PRD](../../PRD.md). Źródła i decyzje właściciela: [PRD](../../PRD.md#źródła-i-odpowiedzialność-dokumentów). Projekt techniczny: [solution-design.md](solution-design.md). Terminologia: [słownik](../../../../../GLOSSARY.md).

## Zakres i zależności

Ten dokument jest właścicielem wymagań R-20, R-21 i odpowiadających im AC. Powiązania: [oferty](../oferty/requirements.md), [firmy-research](../firmy-research/requirements.md), [dopasowanie](../dopasowanie/requirements.md), [rekrutacje](../rekrutacje/requirements.md). Nie przejmuje reguł innych funkcjonalności. Aktorem jest właściciel; scenariusze są przyszłymi kryteriami, nie wynikiem testów.

## Bieżący etap po importerze — 2026-10-31

Potwierdzona kolejność właściciela: setup → pobieranie → lista. Teraz tabela ogłoszeń źródłowych i panel aktualnych szczegółów, bez ratingu, researchu, firm i rekrutacji. Pełne R-20/R-21 poniżej pozostają docelowym zakresem, nie deklaracją wykonania wszystkich modułów.

AC bieżącego wycinka:

- Lista prezentuje tytuł, firmę ze źródła, technologie, widełki z walutą/okresem/kontraktem, lokalizację/tryb i dostępność; brak danych oznacza „Brak danych”.
- Otwarcie oferty pokazuje aktualny opis, wymagane i opcjonalne technologie, warunki, link źródłowy, daty odczytu/publikacji/wygaśnięcia i historię dat zmian. Dawna treść nie jest wyświetlana. Nie tworzymy jeszcze logicznych połączeń ofert ani profilu firmy.
- Wyszukiwanie po tytule/firmie/technologii oraz filtry: technologia any/all/excluded (wymagane/opcjonalne/wszystkie), lokalizacja, tryb pracy, kontrakt, wymiar pracy, seniority, dostępność i oferty bez widełek. Sort: najnowsze/najstarsze wykrycie, publikacja, tytuł i firma, z id przy remisie. Paginacja 20 wpisów. Jawne filtry warunków wybierają znane pasujące wartości; brak pola nie pasuje do wskazanej wartości. Nie zmienia to reguły importu zachowującej niewiadome. Wyjątek płacy opisany niżej. Zmiana filtrów wraca do strony 1.
- Minimum płacy sprawdza górną granicę co najmniej jednego wariantu (częściowe pokrycie ma komunikat), wyłącznie przy wskazaniu waluty i okresu, opcjonalnie kontraktu. Nie przeliczamy brutto/netto, walut ani okresów. Nieznana górna granica pozostaje niepewna i widoczna przy włączonym uwzględnianiu nieznanych płac (domyślnie włączone).
- Filtry, strona, sort i wybrana oferta są w URL. Powrót i odświeżenie zachowują kontekst. Brak wyników, błąd i ładowanie mają czytelne stany, pusty wynik nie kasuje filtrów.
- Decyzja właściciela 2026-10-31: bez logowania; UI i API dostępne lokalnie przez loopback. Widok działa również na małym ekranie; opis źródłowy nie wykonuje HTML/skryptów.

### R-20 — widoki ofert i firm

Tabela ofert z panelem szczegółów (A) oraz widok firm (C) są kierunkiem UI. Szczegóły oferty obejmują warunki, źródła/rozbieżności, ocenę, własną decyzję, rekrutację, research i historię. Profil firmy pokazuje jej informacje, raporty, technologie ogólne i per oferta oraz powiązane oferty.

**AC-20:** przejście oferta → firma → inna oferta zachowuje właściwe powiązania. Lista pozwala przeglądać również odrzucone, wygasłe i zarchiwizowane oferty; archiwizacja jest odrębna od dostępności w źródle i etapu rekrutacji. Niewiadome i nieaktualne oceny są widoczne. Oferta z dopasowaniem opartym na jednym ze sprzecznych wariantów ma na liście znacznik rozbieżności; w szczegółach widoczne są warianty, ich źródła i podstawa uznania wymagania za spełnione. Nie wymaga się tablicy etapów B. Prototyp to materiał kierunkowy, nie komplet ekranów produkcyjnych.

### R-21 — filtrowanie i sortowanie

Dostępne wymiary: technologie (dowolna/wszystkie/wykluczone, wymagane/opcjonalne), widełki z walutą/okresem/podstawą, lokalizacja i dostępność z Polski, kontrakt, godziny, seniority, tryb i dni biurowe, specjalizacja, język, strefy/godziny wspólne/dyżury, typ firmy/projektu/branża, publikacja/pierwsze wykrycie/dostępność, rating/składowe/kompletność, decyzja, etap, stan researchu, firma, źródło i własne tagi. Lista jest sortowalna co najmniej po ratingu, kompletności i dacie pierwszego wykrycia.

**AC-21:** dla kontrolnych ofert działają kombinacje filtrów oraz reguły any/all/excluded; wymagania opcjonalne są odróżnialne. Nie porównuje się bez wyjaśnienia UoP brutto z B2B netto ani kwot różnych okresów/walut. Właściciel może włączyć/wyłączyć oferty bez widełek w widoku; nie jest to domyślna reguła odrzucenia podczas importu. Przy kwalifikacji wynagrodzenia pokazujemy także częściowe pokrycie oczekiwanego minimum zgodnie z [R-13](../dopasowanie/requirements.md#r-13--rating-i-kompletność), bez sugerowania gwarancji kwoty. Dokładna semantyka ręcznie ustawianych filtrów zakresu pozostaje do przeglądu technicznego; decyzja o kwalifikacji nie oznacza dowolnego przeliczenia walut/podstaw.

## Otwarte kwestie

Powiązane: O-02. Szczegóły, konsekwencje i sposób zamknięcia: [wspólny rejestr](../../open-decisions.md). Otwarte kwestie rozpatrujemy przy podejmowaniu tej funkcjonalności; sam szkic nie oznacza gotowości implementacji.

### Korekta filtrów płacy — 2026-11-01

Filtr wynagrodzenia jest jawnie opcjonalny. Wyłączenie przełącznika pomija minimum, walutę, okres i ustawienie nieznanych widełek, również jeśli formularz zachował poprzednie wartości. Pozostałe filtry można zastosować bez waluty i okresu. Po włączeniu porównania minimum nadal wymagane są waluta oraz okres. Aktywne warunki płacy z URL przywracają włączony przełącznik.

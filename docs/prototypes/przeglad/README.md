# Prototyp przeglądu ofert i firm

Makieta jednorazowa do decyzji „Przegląd ofert i firm oraz obsługa etapów procesu” (`bd show oferty-pracy-v4t.8`). Nie jest implementacją produktu. Samodzielny HTML/CSS/JS pozwala ocenić przepływ bez instalowania aplikacji; docelowy stos pozostaje Nuxt + Nuxt UI.

Otwórz `index.html` w przeglądarce albo uruchom z katalogu repozytorium:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs/prototypes/przeglad
```

Adres: http://127.0.0.1:8765/?variant=A

Trzy układy na jednej stronie, przełączane dolnym paskiem lub strzałkami klawiatury:

- A — tabela do triage z panelem szczegółów oferty.
- B — tablica etapów z kontekstem oferty i firmy poniżej.
- C — lista firm, profil i technologie oraz oferty danej firmy.

Sprawdź przejście oferta → firma → inna oferta, odróżnienie ratingu od kompletności i własnej decyzji, zapis notatki/etapu, historię ocen i symulację researchu podstawowego/pogłębionego. Brak widełek i nieujawniony klient mają być widoczne bez automatycznego odrzucenia.

Dane i dowody są fikcyjne. Nie ma API, wywołań AI, trwałego zapisu, pełnych filtrów, edycji kontaktów/terminów ani faktycznego łączenia ofert. Liczby są ilustracyjne; nie jest to prototyp algorytmu ratingu. Odświeżenie resetuje stan. Dolny przełącznik i podgląd stanu należą wyłącznie do makiety; plik nie jest dołączony do żadnego buildu produktu.

Właściciel zaakceptował A jako kierunek przeglądania ofert i C jako widok firm oraz odłożył B poza pierwszą wersję. Zarządzanie rekrutacją pozostaje w szczegółach oferty. Wariant B zachowano wyłącznie jako materiał porównawczy. Rozstrzygnięcie zapisano w Beads; akceptacja układu nie oznacza weryfikacji wszystkich funkcji i reguł. Zgodnie z polityką repozytorium nie wykonano commitu ani archiwizacji na gałęzi; kod pozostaje lokalnym materiałem do oceny, poza istniejącym kodem produktu (którego jeszcze nie ma).

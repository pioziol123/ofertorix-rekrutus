# Pochodzenie płacy Indeed — requirements

Status: wybrane do realizacji 2026-11-02 na podstawie [PRD](../../PRD.md). Zakres: odczyt danych już dostarczonych przez adapter, bez uruchamiania portalu i bez kwalifikacji finansowej w aplikacji.

## Reguły i kryteria akceptacji

- **R-P01 — pochodzenie.** Wynagrodzenie ma niezależne oznaczenie: pracodawca, oszacowanie portalu lub nieustalone. Gdy wybrana kwota pochodzi z `baseSalary`, wynik wskazuje pracodawcę; gdy z `estimated.baseSalary`, wskazuje szacunek. Stare `salary_source` opisujące sposób ekstrakcji nie zastępuje tej informacji.
- **R-P02 — wybór kwoty.** Poprawne dane pracodawcy mają pierwszeństwo. Przy braku jego obiektu płacy używany jest szacunek, jak dotychczas. Nie zmieniamy reguł wyboru dla niepoprawnego lub nieobsługiwanego okresu; nie wyprowadzamy wtedy wiarygodnej kwoty. Brak obu kwot pozostaje niewiadomą, a zero nie jest brakiem.
- **R-P03 — dowód pochodzenia.** Jeżeli źródło przekazało dane płacy, wynik zachowuje oryginalne wartości, okres i walutę zarówno pracodawcy, jak i szacunku, jeśli są dostępne. Dotyczy to również nieobsługiwanego okresu. Przy braku wszystkich danych płacy dowód jest pusty. Nie przypisujemy brutto/netto, VAT ani rodzaju umowy na podstawie domysłów.
- **R-P04 — eksport i przeliczenia.** Dane pochodzenia przechodzą z adaptera przez wynik `scrape_jobs` i pełny eksport JSON bez zmiany na tekst. Annualizacja kwot nie zmienia dowodu zawierającego ich oryginalne wartości i okres. Dotychczasowe pola pozostają dostępne; nowe są dodatkiem. Dla adapterów poza Indeed pochodzenie pozostaje nieustalone, dopóki nie zostaną osobno dostosowane.
- **R-P05 — weryfikacja offline.** Przypadki: pracodawca, szacunek, oba, brak, kwota pojedyncza, zero i nieobsługiwany okres mają sprawdzalne wyniki bez dostępu do sieci. Test przekazania do tabeli i eksportu używa podstawionej odpowiedzi adaptera i nie odpytuje portalu.

Poza zakresem: zmiana filtrów aplikacji, nowy eksport obejmujący jakość przebiegu, uzupełnianie walut/umów, parser polskich widełek z opisów oraz dostosowanie pozostałych portali. Dostęp live pozostaje osobnym warunkiem inicjatywy i nie blokuje tej zmiany offline.

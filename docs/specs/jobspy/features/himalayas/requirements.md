# Himalayas — ręczny pilot źródła

2026-11-03. Kontynuacja zatwierdzonej rekomendacji z [przeglądu źródeł](../../../../research/jobspy-nowe-zrodla.md). Beads: `oferty-pracy-y81.16`. Jest to dodatkowe źródło aplikacji, niezależne od biblioteki JobSpy.

- **R-H1:** Ręczne pobranie `q=PHP`, `country=PL`, `seniority=Senior`, sortowanie recent. Wyniki są kandydatami z wyszukiwarki, a nie potwierdzonym dopasowaniem; niewiadome PHP/senior pozostają widoczne. Nie rozszerzamy obecnie wspólnej kwalifikacji ról.
- **R-H2:** Oferty trafiają do istniejącej listy i szczegółów ze źródłem Himalayas oraz niezmienionym `applicationLink`. Stabilna tożsamość to `guid`. Ponowne pobranie zachowuje historię i nie tworzy kolejnego ogłoszenia dla tego samego identyfikatora.
- **R-H3:** Zachować surowy rekord, pełny opis i ograniczenia geograficzne/czasowe. `pubDate` jest aktualizacją, nie datą publikacji. Brakujące kwoty i jednostki pozostają niewiadomymi; nie zgadywać brutto/netto, B2B ani pochodzenia płacy.
- **R-H4:** Strony są pobierane kolejno, co najmniej sekundę od zakończenia poprzedniego odczytu, z timeoutem i limitem 5 stron. Nie ponawiać 403/429 ani przekierowań; ujawnić przyczynę zakończenia. Zachować poprawne wyniki po błędzie kolejnej strony. Duplikaty, błędne rekordy, zmienny licznik lub niepełny opis oznaczają niepełny odczyt, nie poprawne zero.
- **R-H5:** Zniknięcie z wyszukiwania nigdy nie zamyka ogłoszenia. Zachować datę ważności; osobne sprawdzanie 200/410/404 i automatyczny harmonogram pozostają poza pilotem. Import nie uruchamia AI.

Akceptacja: testy offline R-H1–5 i osobnego testera, pilot publicznego API z liczbą zapisanych kandydatów i oceną ograniczeń, sprawdzenie listy/źródła/linku, lint oraz typecheck. Brak odpowiedzi źródła nie może usunąć istniejących danych. Weryfikacja nie dowodzi pełnego pokrycia rynku ani poprawności kwalifikacji.

Kontrakt operatora: [API](https://himalayas.app/api), [referencja](https://himalayas.app/docs/remote-jobs-api). Wymagane widoczne źródło i niezmieniony link aplikowania, bez dalszego publikowania bazy w innych agregatorach.

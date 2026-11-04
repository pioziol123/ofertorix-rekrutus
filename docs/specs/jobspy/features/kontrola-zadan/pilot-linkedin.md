# LinkedIn — pilot po potwierdzeniu zgody

Data: 2026-11-02. Właściciel potwierdził zgodę na scraping LinkedIn i Indeed z limitem jednego query/s. Potwierdzenie pochodzi od właściciela; dokumentu zgody nie przechowujemy w repo.

## Zakres i wynik

Ręczny import `Senior PHP`, Polska, opisy włączone. Brak logowania, proxy, obchodzenia blokad i harmonogramu. Wspólny runner serializuje przebiegi JobSpy; żądania w przebiegu mają odstęp co najmniej 2 s, granica między przebiegami co najmniej 1 s.

Przebieg: `49b02ae0-2370-4ab7-bfe4-79ab6cadea20`.

- Zapisano 10 ogłoszeń źródłowych i 10 pierwszych rewizji.
- Wykonano 10 prób HTTP (ustawiony limit), bez odrzuconych lub zdublowanych rekordów w przebiegu.
- 9 ogłoszeń ma opis, 1 opis pozostał niepobrany.
- Status `partial`, powód `request_limit`, ostrzeżenie adaptera. Nie komunikujemy kompletnego pobrania portalu ani potwierdzonego dopasowania PHP/senior wszystkich wyników.
- Wyniki są dostępne na liście aplikacji; kwalifikacja nadal jest osobnym zadaniem.

Indeed pozostaje wyłączony: istniejący adapter korzysta z GraphQL, natomiast planowany scraper HTML jest zadaniem `oferty-pracy-y81.8`. Zgoda usuwa blokadę dostępu do scrapowania stron; nie zastępuje implementacji i testów tego adaptera.

## Weryfikacja

67 testów jednostkowych aplikacji dotyczących JobSpy, 54 testy forka oraz 4 testy runnera przeszły. Testy runnera używają rzeczywistych procesów i blokady bez ruchu sieciowego: równoległość, odstęp co najmniej 1 s, wyjątek, nagłe zakończenie, zachowanie inode i brak połączeń przy niedostępnej blokadzie. ESLint, TypeScript i healthcheck workera przeszły. Tester przygotował testy, lecz zakończył się limitem użycia; agent główny przejrzał je i uruchomił samodzielnie.

Ograniczenie: wspólna blokada dotyczy procesów używających runnera i tego samego wolumenu. Niezależna instalacja na innym hoście musi mieć wspólny limiter lub nie pobierać równolegle.

# Próba lokalnej ekstrakcji CV

Data: 2026-11-01. Osobny eksperyment techniczny, bez zmian aplikacji, bez prawdziwego CV i bez wywołań AI. Syntetyczny scan.pdf jest pustą stroną bez warstwy tekstowej; nie jest testem OCR ani rzeczywistego skanu z obrazem.

Wybrano `pdfjs-dist` 6.4.299 i `mammoth` 1.13.0. Wersje i silniki odczytano z npm; pierwsza wymaga Node >=22.13 lub >=24, druga >=12. Próba przeszła na Node 24.15.0 używanym przez projekt. Biblioteki są przypięte w osobnym package.json/lockfile, nie dodano ich do zależności aplikacji.

Odtworzenie bez modyfikowania aplikacyjnego node_modules, z katalogu projektu:

```sh
docker compose run --rm --no-deps -v "$PWD/docs/research/profil-import-spike:/spike" tools sh -c 'cd /spike && pnpm install --ignore-scripts && node check.mjs'
```

Wynik:

| Próbka | Obserwacja |
| --- | --- |
| text.pdf | 1 strona, 43 znaki, zachowana kolejność dwóch kontrolnych wierszy. |
| scan.pdf | 1 strona, 0 znaków — można wykryć potrzebę wklejenia tekstu. |
| text.docx | 54 znaki, zachowane polskie litery, 0 komunikatów Mammoth. |
| Niepoprawne bajty PDF | Odrzucone; diagnostyczny komunikat PDF.js o indeksowaniu błędnego dokumentu. |

PDF.js importuje wariant legacy dla Node; wskazano lokalny katalog standardowych fontów. Użyto getTextContent, bez renderowania stron. Mammoth wywołuje extractRawText, bez generowania HTML i bez dostępu do plików zewnętrznych. Podstawa: [przykład PDF.js dla Node](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs), [API Mammoth](https://github.com/mwilliamson/mammoth.js#api).

Próba potwierdza kompatybilność podstawowej ścieżki. Nie dowodzi jakości odczytu CV wielokolumnowego, tabel, nietypowych fontów, zaszyfrowanych plików, limitów pamięci ani bezpieczeństwa każdego dokumentu. Te przypadki i zachowanie oryginału po awarii wymagają testów implementacji. Zewnętrzna usługa nie otrzymała żadnego CV.

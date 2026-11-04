# Próba Bayt — 2026-11-02

Run: `fd84a21e-5c0c-42a7-bfc9-df5e63a20eb6`, rzeczywista usługa worker, zainstalowany wheel `1.4.1+oferty.2`.

Zapytanie: Senior PHP, Poland, maksymalnie 50 wyników. 10 żądań w około 21 sekund; zatrzymanie `request_limit`, status `partial`. Zapisano 12 ofert i 12 pierwszych rewizji. Trzy oferty bez opisów. Zero odrzuceń domeny/tożsamości/kraju i duplikatów w tej próbie.

Wszystkie rekordy zawierają lokalizację Poland. Wyniki są jednak luźno związane z frazą: obejmują m.in. Java, Ruby, Staff i Principal. Nie potwierdzono 12 dopasowań do Senior PHP. Aplikacja jawnie przechowuje kwalifikację PHP/senior jako niewiadomą; ranking i późniejsza kwalifikacja nie mogą uznać frazy wyszukiwania za dowód dopasowania. Zachowujemy oryginalne rekordy dla dalszej oceny. Nie wykonano kolejnego pobrania tylko po to, by zwiększyć liczbę ofert.

LinkedIn nie był odpytywany: jego [robots.txt](https://www.linkedin.com/robots.txt) wymaga wyraźnej zgody na automatyczny dostęp; podaje `whitelist-crawl@linkedin.com`. Bayt: sprawdzono [robots.txt](https://www.bayt.com/robots.txt) i [warunki](https://www.bayt.com/en/pages/terms/); próba dotyczyła publicznego wyszukiwania ofert, bez kont, danych kandydatów i proxy.

Pozostałe adaptery nie były odpytywane: Glassdoor bez domeny Polski, ZipRecruiter USA/Kanada, Naukri Indie, BDJobs Bangladesz, HelloWork Francja. Google Jobs oznaczone jako niedostępne przez JobSpy. Indeed pozostaje odłożone na koniec. Testy offline potwierdzają routing, nie dostępność tych portali na żywo.

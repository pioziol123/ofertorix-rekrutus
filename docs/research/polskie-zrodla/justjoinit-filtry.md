# Parametry filtrowania Just Join IT — 2026-11-03

Potwierdzono publiczny kod strony operatora oraz odpowiedzi JSON z kontenera. [Strona PHP](https://justjoin.it/job-offers/all-locations/php), [fragment frontendowego mapowania filtrów](https://justjoin.it/_next/static/chunks/30gohgkd8h2e6.js?dpl=19c2798).

Frontend mapuje kategorię na tablicę `categories`, technologię jako `skills: [skill]`, `keywords: [skill]`, `keywordType: "skill"`, a poziomy na `experienceLevels`. W pojedynczych próbach wartości jednej tablicy przekazane jako zwykłe parametry tekstowe API faktycznie działały:

- `categories=php&experienceLevels=senior`: 43 oferty w tej próbce.
- `keywords=PHP&keywordType=skill&skills=PHP&experienceLevels=senior`: 49 ofert, także z kategorią python i wymaganą umiejętnością PHP.
- Odpowiednik dla Go: 72 oferty, także z kategorii devops wymagające Go.
- `category=php` i `categories[]=php` nie filtrowały kategorii — odpowiedź miała licznik 10000 i inne kategorie. Nie stosować tych wariantów.

Źródłowy endpoint: `https://justjoin.it/api/candidate-api/offers`. Jest to obserwowany interfejs aplikacji, nie oficjalny gwarantowany kontrakt integracyjny. Liczniki są zmienne w czasie. Jednostkowe próby obejmowały po trzy pozycje; osobna próba `itemsCount=50` zwróciła 49 pozycji dla PHP Senior.

Istotny szczegół paginacji: mimo zwrócenia wszystkich 49 pozycji API nadal wskazało `next.cursor=49`. Connector kończy ten zakres po zgodności liczby różnych ID z `totalItems`; brak null kursora nie wymusza dodatkowej pustej strony. Przy granicy 10000 kompletność pozostaje niepotwierdzona. Błędny lub powtarzający się kursor, zmiana licznika, przerwanie i limity oznaczają niepełny przebieg.

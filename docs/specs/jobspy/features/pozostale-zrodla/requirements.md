# Pozostałe źródła JobSpy — requirements

Wybrane do realizacji 2026-11-02: właściciel polecił podłączyć pozostałe integracje z forka; Indeed pozostaje na końcu. Podstawa: [PRD](../../PRD.md), rozszerzenie zakresu o adaptery inne niż Indeed. Nie zmieniamy poszukiwań Polska / PHP / senior na inne kraje.

- **R-S01:** katalog obejmuje wszystkie adaptery forka: LinkedIn, Bayt, Glassdoor, ZipRecruiter, Naukri, BDJobs, HelloWork, Google oraz odłożony Indeed. Każdy ma nazwę, wsparcie zakresu Polski, informację o podłączeniu, aktywacji i ostatnim przebiegu. Obecność adaptera nie jest przedstawiana jako pobranie ofert.
- **R-S02:** adaptery mają wspólne wejście, strukturalny wynik, ograniczenia żądań/czasu i walidację tożsamości oraz URL właściwego źródła. Nie tracimy poprawnych rekordów po błędzie szczegółów, nie wyprowadzamy gwarancji kompletności rynku z zakończenia zapytania.
- **R-S03:** nieobsługiwany kraj i źródło deklarowane jako niedostępne kończą się jawnym statusem przed siecią. Adapter nie może po cichu rozszerzyć Polski na cały świat. Brak możliwości uruchomienia jest widoczny w statusie, a nie jako poprawny pusty odczyt.
- **R-S04:** każde źródło ma osobną kolejkę, blokadę, zakres i historię. Recovery, identyfikatory i błędy nie przenikają między portalami. Pozostają reguły braku automatycznego wygaszania po nieobserwowaniu ogłoszenia oraz braku automatycznego łączenia między portalami.
- **R-S05:** operator wybiera źródło przy ręcznym uruchomieniu i statusie; interfejs pokazuje stan każdego źródła. Aktywacja jest jawna per źródło; Indeed nie zostaje aktywowany przez dodanie innych adapterów. Bez automatycznego harmonogramu na tym etapie.
- **R-S06:** próba na żywo zapisuje prawdziwy wynik i liczbę zachowanych ofert albo konkretny powód niewykonania. Wymagania nie nakazują obchodzić ograniczeń źródła ani kupować proxy. Źródło nie jest ogłaszane jako sprawne na podstawie testu syntetycznego.

Odbiór: testy strukturalnych wyników każdego adaptera, kontroli obu transportów requests/curl, odrzuceń kraju, błędów/limitów, mapowania źródeł i izolacji PostgreSQL. Kontrolowany pilot dla źródeł adekwatnych i dostępnych dla Polski; inne otrzymują jawny powód, nie wymyśloną liczbę ofert. Szczegóły ograniczeń zapisujemy w rejestrze źródeł i w wyniku prac.

Aktualizacja: R-S03 w zakresie zagranicznych ofert zdalnych zastępuje [R-R01–R-R05](../zdalne-zagraniczne/requirements.md). Nieobsługiwany kraj zapytania nadal daje unsupported_scope, ale aplikacja może jawnie pytać o rynek zagraniczny z filtrem remote.

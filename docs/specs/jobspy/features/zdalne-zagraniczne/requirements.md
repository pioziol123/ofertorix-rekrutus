# Zagraniczne oferty zdalne — wymagania

Właściciel zatwierdził 2026-11-02 pobieranie ofert zdalnych z zagranicznych rynków. Zastępuje to blokadę geograficzną R-S03 poprzedniej funkcjonalności w tym zakresie. PHP/senior pozostają wymaganiami; brak danych pozostaje niewiadomą.

- R-R01: Glassdoor, ZipRecruiter, Naukri, BDJobs i HelloWork można aktywować ręcznie w trybie zdalnym, z jawnym rynkiem wyszukiwania właściwym dla adaptera. Brak harmonogramu.
- R-R02: kraj ogłoszenia lub siedziby nie dowodzi ograniczenia miejsca wykonywania pracy. Zagraniczne rekordy zdalne są zachowane; wynik filtra źródła nie dowodzi pełnej zdalności.
- R-R03: osobna ocena możliwości pracy z Polski: allowed / excluded / unknown, uzasadnienie i fragment dowodowy. Jednoznaczne ograniczenie do innego kraju oznacza niezgodność; worldwide/Europa/UE/Polska oznacza zgodność tylko w kontekście miejsca wykonywania pracy. Sprzeczność daje unknown z komunikatem. Brak dowodu nie powoduje odrzucenia.
- R-R04: ocena widoczna na liście i w szczegółach, bez automatycznego ukrywania niezgodnych rekordów. Zachowujemy rekord źródłowy, historię, braki i diagnostykę.
- R-R05: limity HTTP i procesu nadal obowiązują. Pilot raportuje prawdziwy wynik; brak dostępu lub awaria nie są pustym sukcesem. LinkedIn i Indeed pozostają wyłączone zgodnie z dotychczasowymi decyzjami.

Odbiór: testy parametrów i kraju BDJobs, źródłowego remote, zachowania zagranicznych i nieznanych lokalizacji, dowodów pozytywnych/negatywnych/sprzecznych, reguł UI oraz limity/izolacja istniejących testów.

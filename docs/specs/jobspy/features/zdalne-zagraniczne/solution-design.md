# Zagraniczne oferty zdalne — solution design

Implementuje R-R01–R-R05. Rejestr źródeł określa remoteOnly i searchCountry: Glassdoor UK, ZipRecruiter USA, Naukri Indie, BDJobs Bangladesz, HelloWork Francja. To rynki portali, nie deklarowane miejsca pracy kandydata. Query ma is_remote=true, location=null i właściwy country_indeed. Pozostałe źródła zachowują obecne parametry. Fingerprint obejmuje nową wersję adaptera i parametry.

Fork rozszerza SourceRequest o boolean is_remote i opcjonalną lokalizację; Country o Bangladesz, aby istniejący adapter BDJobs był osiągalny. Schema2 pozostaje zgodna, pakiet otrzymuje wersję 1.4.1+oferty.3.

Nowy moduł aplikacji remote-eligibility używa konserwatywnych wzorców zdań, bez AI i dodatkowych kosztów. Przechowuje status, reason i evidence. Rozpoznaje ograniczony zestaw jednoznacznych angielskich, polskich i francuskich deklaracji; nie jest pełnym parserem języka naturalnego. Wszystko poza rozpoznanym zakresem pozostaje unknown. Negacje i sprzeczne deklaracje nie mogą tworzyć fałszywego allowed. Jawne is_remote=false/hybryda oznaczają excluded dla zapytania fully remote. Sam is_remote=true nie wystarcza do allowed. Kraju źródła nie używamy jako ograniczenia.

Normalizacja zapisuje remoteEligibility w payload rewizji. Projekcja i UI udostępniają ocenę i dowód. Dla dawnych rekordów bez oceny projekcja wylicza ją z zachowanego sourceRecord, bez przepisywania historii. Testy tworzy osobny tester. Wheel weryfikowany hashami i porównaniem modułów z lokalnym forkiem, bez commit/push bez osobnej autoryzacji.

Również w zapytaniu krajowym jawne sourceRecord.is_remote=true pozwala zachować rekord zagraniczny; ocena możliwości pracy z Polski pozostaje osobna. Dotychczasowy filtr kraju pozostaje dla krajowych zapytań i rekordów bez potwierdzenia zdalności.

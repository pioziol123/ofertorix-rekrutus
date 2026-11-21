# Epic oferty-pracy-sq2 and its tickets (bd export, 2026-11-20)

---

○ oferty-pracy-sq2 [EPIC] · Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: epic
Created: 2026-11-15 · Updated: 2026-11-18

DESCRIPTION

  Celem epiku jest zaprojektowanie i wdrożenie obsługi zadań AI w module AI:  
  cyklu życia, odzyskiwania, ponowień, rozliczeń, budżetu oraz kontroli i     
  widoczności zadań (komendy i panel), wspólnie dla ścieżki płatnej (OpenAI) i
  lokalnej (Ollama, OpenCode). Epik sq2 blokuje epik oferty-pracy-334,        
  ograniczony do adapterów lokalnego AI.                                      
                                                                              
  ## Zasada projektowania                                                     
                                                                              
  Decyzja właściciela 2026-11-18: epik projektujemy od początku. Wszystkie    
  dotychczasowe ustalenia dotyczące tego obszaru, także zatwierdzone wcześniej
  przez właściciela, traktujemy wyłącznie jako sugestie do ponownej oceny, a  
  nie jako wiążące decyzje. Dotyczy to m.in. decyzji o budżecie z wywiadu     
  oferty-pracy-v4t.6 (Q9, Q10, Q13), wymagania R-25 (docs/specs/pierwsza-     
  wersja/features/operacje/requirements.md), ustaleń epiku 334 z 2026-11-05   
  (LA-06, LA-08, LA-11, LA-15, LA-17, LA-18), specyfikacji panelu PZ-01–PZ-08 
  oraz kontraktów w docs/specs/lokalne-ai/kontrakty-runtime.md.               
                                                                              
  ## Stan obecny                                                              
                                                                              
  Wspólny kontrakt modułu AI działa dla pojedynczych wywołań OpenAI i Ollamy  
  (oferty-pracy-0mq.14, 0mq.9), w tym wspólny slot pracy lokalnej z dzierżawą,
  stan uncertain, rezerwacja budżetu i rozliczenie. Opis działania i          
  uproszczeń: sekcja State of implementation w modules/ai/README.md. Stan kodu
  jest punktem wyjścia, nie przesądza o projekcie.                            
                                                                              
  ## Tematy do zaprojektowania                                                
                                                                              
  • Czym jest zadanie AI: jednostki (operacja, wykonanie, próba), model stanów,
  rozdzielenie stanu procesu, zamiaru właściciela i wyniku, grupy zadań.      
  • Wykonanie i zasoby: kolejka, ograniczenie równoległości pracy lokalnej,   
  kolejność i pierwszeństwo, potwierdzenie końca pracy i zwolnienie zasobu.   
  • Niepewność i awarie: niepewny wynik i koszt, czy niepewność blokuje       
  kolejne zadania, przerwana praca workera, restart aplikacji, awarie         
  infrastruktury.                                                             
  • Ponowienia: automatyczne, ręczne, dane ponowienia, ponowienie trwającej   
  pracy.                                                                      
  • Wynik i jego zastosowanie: kto przyjmuje wynik, prawo do publikacji, wynik
  nieprzyjęty przez moduł zlecający, zmiana danych w trakcie pracy, archiwum. 
  • Koszty i budżet: limit i okres, zmiana limitu przez właściciela,          
  rezerwacja, koszt nieznany, przełom miesiąca, brak środków, koszt pracy     
  lokalnej, cennik i kurs.                                                    
  • Kontrola zadań: zestaw i znaczenie komend, interwencja i wznowienie,      
  zakres komend, powtórzone komendy i wyścigi z publikacją.                   
  • Widoczność: panel zadań, zakres panelu, widok budżetu, diagnostyka,       
  historia.                                                                   
  • Ścieżki i dostawcy: wspólne i różne zasady dla OpenAI, Ollamy i OpenCode, 
  tryb Batch, stare rekordy, podział odpowiedzialności między koordynację a   
  adaptery.                                                                   
  • Granice epiku i sposób wdrożenia.                                         
                                                                              
  ## Powiązane prace                                                          
                                                                              
  • oferty-pracy-qld: ręczne rozliczanie prób o nieznanym koszcie.            
  • oferty-pracy-0mq.15: wykrywanie przerwanej pracy workera w kolejkach.     
  • oferty-pracy-0mq.17: przeniesienie ocen i researchu za kontrakt AI.       
  • oferty-pracy-334: adaptery lokalnego AI (zadanie panelu 334.15 formalnie  
  pozostaje w 334).                                                           
  • oferty-pracy-rss, oferty-pracy-0dv: reguły modułów zlecających dla        
  lokalnego AI.                                                               
  Przynależność tych prac do epiku jest częścią projektowania granic.         
                                                                              
  ## Przygotowanie realizacji                                                 
                                                                              
  Zweryfikować istniejące zachowania i zadania, aby wykorzystać wykonane prace
  i nie dublować otwartych napraw. Rozstrzygnąć z właścicielem tematy powyżej,
  następnie przygotować PRD, wymagania i solution design oraz wydzielić       
  zadania implementacyjne ze scenariuszami awarii.                            
                                                                              
  ## Rezultat                                                                 
                                                                              
  Zaprojektowane od nowa, uzgodnione i wdrożone zasady obsługi zadań AI,      
  rozliczeń i kontroli zadań, zweryfikowane dla objętych zakresem dostawców i 
  procesów. Dokładny zakres oraz kryteria szczegółowe wymagają dopracowania   
  przed implementacją.                                                        



ACCEPTANCE CRITERIA

                                                                              
  1. Uzgodniono zakres epiku, model stanów i odpowiedzialności bez naruszania 
  przyjętych granic modułu AI.                                                
  2. Zdefiniowano wymagania dla trwałości wyniku, ponowień, odzyskiwania,     
  budżetu i rozliczeń oraz jawnie zaakceptowane ograniczenia.                 
  3. Powiązano istniejące zadania i wydzielono brakujące prace bez dublowania 
  epiku 334.                                                                  
  4. Wdrożono uzgodniony zakres i zweryfikowano scenariusze awarii,           
  współbieżności i ponownego wykonania wynikające z przyjętych wymagań.       
  Utworzenie epiku nie oznacza spełnienia tych kryteriów.                     



LABELS: needs-info

DEPENDS ON
  → ○ oferty-pracy-2ba: (EPIC) Rozdzielić kolejkę, workera, harmonogram i moduły w pracy w tle P2
  → ✓ oferty-pracy-0mq.15: Wykrywać przerwaną pracę płatnych wykonań AI P2

CHILDREN
  ↳ ○ oferty-pracy-sq2.11: Migracja budżetu AI i usunięcie starej drogi zlecania P2
  ↳ ○ oferty-pracy-sq2.1: Weryfikacja adaptera OpenAI względem reguł obsługi zleceń AI (sq2) P2
  ↳ ○ oferty-pracy-sq2.10: Firmy na nowym kontrakcie zleceń AI P2
  ↳ ○ oferty-pracy-sq2.4: Operacje AI startują po kolei i w ramach budżetu P2
  ↳ ○ oferty-pracy-sq2.8: Profil na nowym kontrakcie zleceń AI P2
  ↳ ○ oferty-pracy-sq2.12: Panel zadań AI: lista i szczegóły zleceń P2
  ↳ ○ oferty-pracy-sq2.3: Wykonawcy AI za wspólnym interfejsem P2
  ↳ ○ oferty-pracy-sq2.6: Przerwana operacja AI kończy się jako niepewna P2
  ↳ ○ oferty-pracy-sq2.14: Zarządzanie budżetem AI w panelu P2
  ↳ ○ oferty-pracy-sq2.7: Jedna dostawa wyniku zlecenia AI i limit czasu zlecenia P2
  ↳ ○ oferty-pracy-sq2.13: Akcje właściciela w panelu zadań AI: Ponów i Odrzuć P2
  ↳ ○ oferty-pracy-sq2.5: Automatyczne ponowienia zlecenia AI i status „wymaga uwagi” P2
  ↳ ○ oferty-pracy-sq2.9: Dopasowanie na nowym kontrakcie zleceń AI P2
  ↳ ○ oferty-pracy-sq2.2: Zlecenie AI: moduł zlecający składa zlecenie i czyta jego status P2
  ◐ 0/14 complete (0%)

BLOCKS
  ← ○ oferty-pracy-rss: Reguły modułu Firm dla researchu wykonywanego przez lokalnego agenta P2
  ← ○ oferty-pracy-334: (EPIC) Adaptery lokalnego AI: Ollama gpt-oss:20b i agent OpenCode P2
  ← ○ oferty-pracy-0dv: Reguły modułu Dopasowania dla lokalnych ocen w grupach do 20 P2

RELATED
  ↔ ✓ oferty-pracy-0mq.15: Wykrywać przerwaną pracę płatnych wykonań AI P2

COMMENTS
  2026-11-18 10:52 Piotr Ziółkowski
    
      Decyzja właściciela 2026-11-18: sq2 przejmuje z oferty-pracy-334 koordynację
      zadań AI (kolejka, slot, odzyskiwanie, publikacja, ponowienia, komendy) oraz
      panel zadań AI; 334 ograniczono do adapterów lokalnego AI i zablokowano     
      przez sq2. Reguły domenowe wydzielono do oferty-pracy-rss i oferty-pracy-   
      0dv. Ścieżki lokalne wdrażane po kawałku (LA-16 usunięte). Kryteria         
      akceptacji epiku bez zmian.                                                 
  2026-11-18 10:55 Piotr Ziółkowski
    
      Decyzja właściciela 2026-11-18 (późniejsza): epik projektujemy od początku; 
      wszystkie wcześniejsze ustalenia dla tego obszaru, łącznie z przejętymi z   
      334, budżetowymi z v4t.6 i R-25 oraz panelem PZ-01–08, są tylko sugestiami. 
      Zastępuje sformułowanie z poprzedniej wersji opisu, że przejęte ustalenia   
      nie podlegają ponownemu otwarciu.                                           
  2026-11-18 12:29 Piotr Ziółkowski
    
      ## Ustalenia projektowe — grupa A: czym jest zadanie AI (wywiad z           
      właścicielem 2026-11-18)                                                    
                                                                                  
      Projektujemy od początku; poniższe zastępuje wcześniejsze sugestie dla tego 
      obszaru. Numery Q odnoszą się do wywiadu w sesji z 2026-11-18.              
                                                                                  
      ### Byty i nazwy                                                            
                                                                                  
      • **Assignment (zlecenie)**: składa je moduł zlecający; należy do modułu AI.
      Zawiera typ (single, batch, agent), zamrożone dane wejściowe, instrukcję i  
      ustawienia, limit automatycznych operacji (3, zapisany w tabeli assignmentu,
      nieedytowalny, ustala moduł AI), status, zamiar właściciela, etykietę dla   
      panelu i sumy kosztów. (Q1, Q2, Q7, Q32, Q33)                               
      • **Operation (operacja)**: jedno wywołanie wykonawcy w ramach assignmentu. 
      Ma stan, koszt potencjalny i koszt faktyczny. (Q18, Q32, Q33)               
      • Moduł AI nie zna spraw modułów zlecających ani ich identyfikatorów; moduł 
      zlecający przechowuje identyfikator assignmentu, a przy złożeniu podaje     
      tylko etykietę dla właściciela, której AI nie interpretuje. (Q34)           
      • Typ assignmentu jest publiczną informacją modułu AI; wybiera go moduł     
      zlecający. Obsługę typu przez wykonawcę sprawdzamy przy konfiguracji;       
      adapter dodatkowo rzuca błąd przy nieobsługiwanym typie. Konfiguracja przez 
      moduł zlecający docelowo, dziś na stałe w kodzie. (Q15)                     
      • Moduł AI nie sprawdza, ile assignmentów ma moduł zlecający dla jednej     
      swojej sprawy; to jego odpowiedzialność. (Q3)                               
                                                                                  
      ### Status assignmentu (publiczny)                                          
                                                                                  
      in_progress, needs_attention, succeeded, partially_succeeded (tylko batch), 
      failed. Każdy typ ma podzbiór statusów wyrażony w typach TypeScript (unia   
      rozróżniana po typie); w bazie jedna kolumna z ograniczeniem. (Q10, Q16,    
      Q24)                                                                        
                                                                                  
      Przejścia:                                                                  
                                                                                  
      • in_progress → succeeded: operacja udana (dla batch: wszystkie pozycje     
      udane).                                                                     
      • in_progress → in_progress: błąd i limit nie wyczerpany → kolejna operacja 
      automatyczna. Domyślnie każdy błąd pozwala ponowić. (Q13)                   
      • in_progress → needs_attention: limit wyczerpany, albo adapter rzucił      
      dedykowany wyjątek „nie ponawiaj” (także dla wyniku niepewnego). (Q1, Q13,  
      Q17)                                                                        
      • batch: limit wyczerpany i co najmniej jedna pozycja udana →               
      partially_succeeded automatycznie. (Q16, Q27)                               
      • batch: kolejna operacja obejmuje tylko pozycje bez poprawnej odpowiedzi,  
      także pozycje „nie ponawiaj”; gdy zostały wyłącznie pozycje „nie ponawiaj”  
      albo żadna pozycja się nie udała → needs_attention. (Q21, Q22, Q23)         
      • needs_attention → in_progress: Ponów — jedna operacja, tylko pozycje bez  
      poprawnej odpowiedzi; jej niepowodzenie wraca do needs_attention. (Q12, Q30)
      • in_progress / needs_attention → failed: Odrzuć (także batch z udanymi     
      pozycjami). (Q28, Q31)                                                      
      • in_progress / needs_attention → partially_succeeded: Zatwierdź, tylko     
      batch z co najmniej jedną udaną pozycją. (Q29, Q31)                         
      • Odrzuć i Zatwierdź próbują zatrzymać trwającą operację; jej późny wynik   
      trafia tylko do historii, koszt rozliczany normalnie. (Q20, Q31)            
      • Moduł zlecający może porzucić assignment: status failed, nic mu nie       
      przekazujemy. (Q11, Q31)                                                    
                                                                                  
      ### Moduł zlecający                                                         
                                                                                  
      • Dostaje wynik raz, przy statusie końcowym; przy porażce bez przyczyny     
      (przyczyna i historia tylko w module AI i panelu). Batch zwraca pozycje     
      udane i nieudane, żeby moduł zlecający mógł zlecić nieudane w nowym         
      assignmencie. (Q6, Q9, Q16)                                                 
      • Oczekiwanie na budżet widzi jako in_progress; komunikaty „Czeka na budżet”
      znikają z modułów zlecających. (Q19)                                        
      • Ponowienie (automatyczne i ręczne) używa danych zamrożonych w assignmencie;
      nowe dane lub ustawienia to nowy assignment. (Q4)                           
                                                                                  
      ### Operacja                                                                
                                                                                  
      • Stany: oczekuje (na budżet lub slot; przyczyna to szczegół w panelu), w   
      toku, udana, nieudana (z przyczyną i znacznikiem „nie ponawiaj”), niepewna. 
      (Q18, Q18e)                                                                 
      • Powstaje od razu przy złożeniu assignmentu i przy każdym ponowieniu.      
      (Q18a)                                                                      
      • Rezerwuje budżet przy przejściu do „w toku”, w jednej transakcji ze       
      sprawdzeniem środków; operacja oczekująca nie obciąża budżetu. (Q18b)       
      • Operacja batch jest udana, gdy wykonawca obsłużył całą partię; wynik      
      każdej pozycji zapisany osobno. (Q18c)                                      
      • Brak stanu „zatrzymywana”: po Odrzuć/Zatwierdź operacja pozostaje w toku  
      do potwierdzenia końca przez wykonawcę. Zamiar właściciela jest na          
      assignmencie, stan procesu na operacji. (Q5, Q18d)                          
                                                                                  
      ### Koszt                                                                   
                                                                                  
      • Operacja: jeden koszt potencjalny (rezerwacja, także dla całej sesji      
      agenta) i jeden faktyczny; nieznany koszt faktyczny jest pusty, nie zero.   
      (Q8, Q36, Q37)                                                              
      • Assignment sumuje: koszty potencjalne, koszty faktyczne, koszt obciążający
      budżet (każda operacja raz: faktyczny jeśli znany, inaczej potencjalny) oraz
      liczbę operacji o nieznanym koszcie. (Q35, Q37)                             
                                                                                  
      ### Odłożone                                                                
                                                                                  
      • Limit czasu assignmentu: pozycja 8 w oferty-pracy-sz5.                    
      • Czy batch w Ollamie to jedna operacja z wieloma wywołaniami czy wiele     
      operacji: sprawa adaptera (epik 334).                                       
      • Pozycje 4 i 5 w oferty-pracy-sz5 (stan adaptera zamiast end_state;        
      rozdzielenie etapu i wyniku) do włączenia przy specyfikacji sq2; model z    
      grupy A rozstrzyga dużą część pozycji 5.                                    
                                                                                  
      Następna grupa: B — kolejka, ograniczenie równoległości pracy lokalnej,     
      kolejność i pierwszeństwo, potwierdzenie końca pracy.                       
  2026-11-18 15:09 Piotr Ziółkowski
    
      Ustalenia grupy B (kolejka, równoległość, kolejność, koniec pracy) – wywiad 
      z właścicielem 2026-11-18.                                                  
                                                                                  
      Kolejka i równoległość                                                      
                                                                                  
      • Q38: kolejkę operacji prowadzi wyłącznie moduł AI. Moduł zlecający składa 
      zlecenie i dostaje wynik; nie wie nic o kolejce.                            
      • Q39: wiele zleceń może być w toku jednocześnie; workerów może być więcej  
      niż jeden. Każdy wykonawca ma własny limit operacji działających naraz      
      (konfiguracja wykonawcy). Otwarte: czy lokalny model i lokalny agent dzielą 
      jeden limit – temat „konfiguracja wykonawcy”.                               
      • Q40: płatnych wykonawców zdalnych ogranicza w domenie tylko budżet; limity
      zapytań dostawcy obsługuje adapter jako błąd, który można ponowić.          
                                                                                  
      Kolejność                                                                   
                                                                                  
      • Q41: kolejność według chwili, w której operacja stała się pending. Ręczne 
      „Ponów” ustawia nową operację na końcu.                                     
      • Q42: brak priorytetów zleceń.                                             
      • Q43: worker bierze pierwszą w kolejności operację, która może ruszyć      
      teraz: jej wykonawca ma wolne miejsce w limicie, a dla płatnej jest budżet  
      na koszt potencjalny. Operacja, na którą brak budżetu, jest pomijana, ale   
      nie traci miejsca w kolejce; po doładowaniu budżetu rusza przy najbliższym  
      wyborze. Jedna kolejka, bez algorytmu wyboru kolejek. Świadomie przyjęte:   
      droga operacja może czekać dłużej niż tańsze.                               
      • Q47: operacja droższa niż cały miesięczny limit nie ma osobnej reguły –   
      czeka jak każda inna i kończy ją limit czasu zlecenia.                      
                                                                                  
      Limit czasu zlecenia (TTL)                                                  
                                                                                  
      • Każde zlecenie ma limit czasu. Po przekroczeniu zlecenie dostaje status   
      failed z zapisaną przyczyną „przekroczony limit czasu” (widoczną dla        
      właściciela). Moduł zlecający dostaje tylko failed, bez przyczyny (zgodnie z
      grupą A).                                                                   
      • Q50: limit liczy się od złożenia zlecenia, przez cały jego czas życia.    
      • Q51: limit biegnie także w stanie „wymaga uwagi”.                         
      • Q52: operacji w toku nie przerywamy; status failed zapada dopiero po jej  
      zakończeniu, a jej sukces kończy zlecenie sukcesem. Limit dotyczy czekania, 
      nie pracy.                                                                  
      • Q53: wartość domyślna z możliwością nadpisania przez moduł zlecający przy 
      składaniu; zapisana w zleceniu, niezmienna. Konkretna wartość domyślna – do 
      ustalenia przy konfiguracji.                                                
      • Q54: zamyka punkt 8 zrzutu oferty-pracy-sz5.                              
                                                                                  
      Awarie i koniec pracy                                                       
                                                                                  
      • Q44: awaria w trakcie operacji (wygasła dzierżawa workera) → operacja     
      uncertain, zlecenie „wymaga uwagi”.                                         
      • Q45: maksymalny czas działania operacji ustala adapter dla swojego        
      wykonawcy; przekroczenie = błąd, który można ponowić automatycznie w ramach 
      limitu 3 operacji.                                                          
      • Q46: zajęte miejsca wykonawcy = liczba jego operacji running (bez osobnego
      slotu/dzierżawy jako źródła prawdy). Zakończenie operacji to jedna          
      transakcja: stan końcowy, koszt faktyczny (albo pusty, gdy nieznany) i      
      rozliczenie budżetu (obciążenie = faktyczny, gdy znany, inaczej potencjalny).
      Brak stanu „kończenie”.                                                     
                                                                                  
      Nowe tematy na liście sq2                                                   
                                                                                  
      • Q48: konfiguracja wykonawcy (limit operacji naraz, maksymalny czas        
      działania, wspólne miejsce, wartości domyślne). Właściciel zauważył, że     
      wykonawca przestaje być tylko adapterem i systemem zewnętrznym: dochodzi    
      model i tabela w bazie, podobnie jak źródło w module źródeł ofert.          
      • Q49: zarządzanie budżetem, w tym doładowanie budżetu przez właściciela –  
      razem z grupą o budżecie.                                                   
  2026-11-18 17:22 Piotr Ziółkowski
    
      Ustalenia o wykonawcy – wywiad z właścicielem 2026-11-18 (kontynuacja grupy 
      B).                                                                         
                                                                                  
      • Wykonawca to encja z własną konfiguracją, która wykonuje operacje i       
      udostępnia usługi dla typów zleceń (pojedyncze zapytanie, batch, agent).    
      Może korzystać z jednego lub wielu dostawców. Wykonawca ≠ dostawca: OpenAI  
      to szczególny prosty przypadek; wykonawca lokalny obsługuje pojedyncze      
      zapytanie i batch przez Ollamę oraz agenta przez OpenCode w jednym limicie. 
      • Q55′: klasa encji należy do modułu AI; zapis w bazie jest powiązany nazwą 
      z podmodułem wykonawcy i trzyma ustawienia zmieniane w czasie działania:    
      włączony/wyłączony, limit operacji naraz. Maksymalny czas działania (Q45) i 
      katalog oferty (usługi, modele LLM, ustawienia, ceny) to stałe w kodzie     
      podmodułu wykonawcy.                                                        
      • Zlecenie niesie parametry, z którymi wykonawca ma wykonać operację (np.   
      model LLM).                                                                 
      • Q58: moduł zlecający wybiera wykonawcę przez swoją konfigurację           
      preferencji przechowywaną w module AI (dziś zapisaną na stałe w kodzie).    
      Temat konfiguracji – przy 334 (notatka dopisana do 334).                    
      • Q59: operacje czekające na wyłączonego wykonawcę zostają w kolejce; kończy
      je limit czasu zlecenia. Świadomie nieoptymalne, ale nie komplikuje modułu. 
      • Q63: rozwiązane przez definicję wykonawcy – lokalne usługi dzielą limit   
      jednego wykonawcy.                                                          
      • Q65: nieznany wykonawca lub parametry spoza jego katalogu → błąd przy     
      składaniu, zlecenie nie powstaje.                                           
      • Wycofane: Q56′ (wykonawca = para środowisko+model LLM) i Q60–Q62 (warianty
      wewnątrz wykonawcy).                                                        
      • Słownik: zaktualizowano Executor, dodano Executor submodule.              
  2026-11-18 18:27 Piotr Ziółkowski
    
      Ustalenia grupy C (niepewność i awarie) – wywiad z właścicielem 2026-11-18. 
                                                                                  
      • Q66: niepewna operacja nie blokuje innych zleceń ani wykonawcy; dotyczy   
      jednego zlecenia i nie zajmuje już miejsca u wykonawcy.                     
      • Q67: każda usługa wykonawcy deklaruje w swoim podmodule, czy przerwaną    
      operację (awaria workera, restart) można powtórzyć automatycznie. Tak →     
      przerwanie liczy się jak zwykły błąd i zużywa jedną z 3 operacji. Nie →     
      operacja uncertain, zlecenie „wymaga uwagi”. Domyślnie: nie.                
      • Q68: koszt faktyczny przerwanej operacji płatnej jest nieznany (pusty),   
      budżet liczy koszt potencjalny – także gdy usługę można powtórzyć. Ręczne   
      rozliczanie: oferty-pracy-qld, grupa o budżecie.                            
      • Q69: niedostępny wykonawca to zwykły błąd do ponowienia (zużywa operacje).
      Pomysł kolejki z opóźnieniem dopisany do zrzutu oferty-pracy-sz5 (punkt 10).
      • Q70: nieaktualne (wstrzymywanie wykonawcy odpada razem z wariantem b z    
      Q69).                                                                       
      • Q71: przerwaną operację wykrywa wspólny mechanizm kolejek z oferty-pracy- 
      0mq.15 (running bez odnowionej dzierżawy); restart aplikacji to ten sam     
      przypadek, dalej stosuje się Q67.                                           
  2026-11-18 18:33 Piotr Ziółkowski
    
      Ustalenia grupy D (ponowienia) – wywiad z właścicielem 2026-11-18. Uzupełnia
      grupę A.                                                                    
                                                                                  
      • Q72: „Ponów” jest dostępne tylko w stanie „wymaga uwagi”. Zlecenia        
      zakończonego (succeeded, partially_succeeded, failed) nie da się ponowić;   
      potrzebna praca = nowe zlecenie modułu zlecającego.                         
      • Q73: ponowiona operacja używa danych wejściowych i parametrów wykonawcy   
      zamrożonych w zleceniu; właściciel ich nie zmienia.                         
      • Q74: operacja z ręcznego „Ponów” leży ponad limitem automatycznych; jej   
      błąd (także taki, który da się ponowić) przenosi zlecenie od razu do „wymaga
      uwagi”, bez kolejnych automatycznych ponowień.                              
      • Q75: „Ponów” nie przedłuża limitu czasu zlecenia; panel pokazuje przy     
      przycisku, ile zostało do końca limitu.                                     
      • Q76: nie ma akcji ponowienia operacji w toku; zawieszoną kończy maksymalny
      czas działania (Q45), przerwaną przez awarię – Q67.                         
  2026-11-18 18:45 Piotr Ziółkowski
    
      Ustalenia grupy E (wynik i jego zastosowanie) – wywiad z właścicielem 2026- 
      11-18.                                                                      
                                                                                  
      • Q77/Q78: dostawa jest jedna, bez ponawiania, i rozstrzyga status końcowy. 
      Operacja zakończona powodzeniem → moduł AI raz wywołuje odbiorcę wyniku     
      modułu zlecającego. Odbiorca przyjął → succeeded / partially_succeeded.     
      Odbiorca rzucił wyjątek → failed z przyczyną „dostawa nieudana”, bez drugiej
      próby i bez osobnej informacji o porażce; koszt rozliczony. Porażka z innych
      powodów (wyczerpane operacje, Odrzuć, limit czasu) też jest dostarczana raz;
      gdy odbiorca wtedy zawiedzie, status zostaje failed, a przyczyna odnotowuje 
      nieudaną dostawę. Brak stanu „dostarczanie”. Pomysł ponawiania dostawy /    
      „Dostarcz ponownie” – zrzut oferty-pracy-sz5, punkt 11.                     
      • Q79: rezygnujemy z odrzucania wyniku przez odbiorcę; odbiorca tylko       
      przyjmuje, a co zrobi z wynikiem, nie wraca do modułu AI.                   
      • Q80: moduł AI nie sprawdza, czy wynik ma poprawny format według kryteriów 
      modułu zlecającego. Weryfikacja i obsługa niepoprawnego wyniku należą do    
      modułu zlecającego (np. nowe zlecenie). Zmienia dzisiejsze zachowanie, w    
      którym niezgodność ze schematem kończy wykonanie przyczyną format.          
      • Q81: porzucenie w trakcie operacji → zlecenie od razu failed, bez dostawy;
      operacja nie jest przerywana, po jej końcu koszt jest rozliczany, a wynik   
      zostaje zapisany przy operacji i nigdzie nie trafia.                        
      • Q82: moduł AI nie wykrywa zmian danych w trakcie pracy; dane wejściowe są 
      zamrożone; moduł zlecający może porzucić zlecenie albo zignorować wynik.    
      • Q83: zlecenia, operacje i surowe odpowiedzi trzymamy bez limitu czasu;    
      zasady usuwania – zrzut oferty-pracy-sz5, punkt 12.                         
  2026-11-18 18:55 Piotr Ziółkowski
    
      Ustalenia grupy F (koszty i budżet) oraz Q84 – wywiad z właścicielem 2026-  
      11-18.                                                                      
                                                                                  
      • Q84: moduł zlecający może przekazać schemat odpowiedzi jako zwykły        
      parametr zlecenia, jeśli usługa wykonawcy go oferuje (structured output w   
      OpenAI/Ollama). Moduł AI przekazuje go wykonawcy i nie sprawdza wyniku (Q80).
      Warto go przekazywać.                                                       
      • Q85: jeden miesięczny budżet dla wszystkich modułów zlecających i         
      wykonawców.                                                                 
      • Q86: doładowanie = podniesienie limitu bieżącego miesiąca. Właściciel w   
      panelu zmienia limit bieżącego miesiąca i osobno limit domyślny dla         
      kolejnych. Niewydane środki nie przechodzą na następny miesiąc.             
      • Q87: operacja obciąża miesiąc, w którym ruszyła i zarezerwowała budżet;   
      koszt faktyczny rozlicza się w tym samym miesiącu, nawet gdy kończy się w   
      następnym.                                                                  
      • Q88: przy operacji o nieznanym koszcie właściciel ma w panelu akcję       
      „Rozlicz”: wpisuje kwotę z rozliczenia u dostawcy i ta kwota staje się      
      kosztem faktycznym. Bez niej obciążeniem zostaje koszt potencjalny.         
      Realizuje oferty-pracy-qld.                                                 
      • Q89: operacja z ceną 0 (praca lokalna) nie rezerwuje budżetu i nigdy na   
      niego nie czeka; jej koszt faktyczny = 0 (znany, nie pusty).                
      • Q90: ceny i kurs wymiany to stałe w kodzie podmodułu wykonawcy. Koszt     
      potencjalny i faktyczny operacji liczy się według cen i kursu z chwili jej  
      startu; obie wartości zapisane przy operacji; zmiana cennika nie zmienia    
      rozliczenia operacji, które już ruszyły.                                    
  2026-11-18 19:03 Piotr Ziółkowski
    
      Ustalenia grupy G (kontrola zleceń) – wywiad z właścicielem 2026-11-18.     
                                                                                  
      • Akcje właściciela na zleceniu: Ponów, Odrzuć, Zatwierdź, Rozlicz;         
      ustawienia wykonawcy (włączony, limit operacji naraz); ustawienia budżetu   
      (limit bieżącego miesiąca, limit domyślny).                                 
      • Q91: „Odrzuć” jest dostępne także dla zlecenia w toku, również gdy jego   
      operacja trwa. Zlecenie od razu dostaje status failed, a informacja o       
      porażce trafia do modułu zlecającego (dostawa jak w grupie E). Trwająca     
      operacja nie jest przerywana: kończy się i rozlicza, ale status zlecenia    
      zostaje failed, a jej wynik nie trafia do modułu zlecającego (jak przy      
      porzuceniu, Q81).                                                           
      • Q92: każda akcja dotyczy jednego zlecenia; akcje grupowe – zrzut oferty-  
      pracy-sz5, punkt 13.                                                        
      • Q93: akcja sprawdza status zlecenia w chwili wykonania; powtórzona akcja  
      na zleceniu, które zmieniło stan, niczego nie zmienia, a właściciel widzi   
      komunikat „zlecenie zmieniło stan” i aktualny stan.                         
      • Q94: jedna reguła dla wyścigów: każda zmiana statusu (akcja właściciela   
      lub automatyczna) sprawdza aktualny status w jednej transakcji; wygrywa     
      pierwsza, pozostałe jak w Q93.                                              
      • Q95: „Rozlicz” dostępne dla każdej operacji o nieznanym koszcie, także w  
      zleceniu zakończonym, tylko raz; korekta – zrzut oferty-pracy-sz5, punkt 14.
      • Q96: akcje właściciela tylko z panelu zleceń AI, jako operacje publicznego
      kontraktu modułu AI; nie ma ich w CLI.                                      
  2026-11-18 19:09 Piotr Ziółkowski
    
      Ustalenia grupy H (widoczność) – wywiad z właścicielem 2026-11-18.          
                                                                                  
      • Q97: panel zleceń AI pokazuje wszystkie zlecenia: na górze wymagające     
      uwagi, potem w toku i zakończone, od najnowszych. Wiersz: etykieta, typ,    
      moduł zlecający, wykonawca, status, czas do końca limitu czasu, obciążenie  
      budżetu. Filtry: status, moduł zlecający, data.                             
      • Q98: szczegóły zlecenia: lista operacji ze stanem, parametrami wykonawcy  
      (np. model LLM), czasem startu i końca, kosztem potencjalnym i faktycznym,  
      przyczyną błędu i surową odpowiedzią wykonawcy; akcje dostępne w danym      
      stanie (Ponów, Odrzuć, Zatwierdź, Rozlicz) przy zleceniu lub operacji. To   
      cała diagnostyka właściciela; moduł zlecający jej nie dostaje.              
      • Q99: widok budżetu bieżącego miesiąca: limit, wydane wg kosztów           
      faktycznych, zarezerwowane przez trwające operacje, obciążenie z operacji o 
      nieznanym koszcie (z ich liczbą), pozostało. Edycja limitu bieżącego        
      miesiąca i limitu domyślnego. Poprzednie miesiące jako lista sum.           
      • Q100: widok wykonawców: włączony, limit operacji naraz, liczba trwających 
      i czekających operacji; właściciel włącza/wyłącza wykonawcę i zmienia limit.
      • Q101: o zleceniu wymagającym uwagi informuje licznik przy pozycji panelu w
      nawigacji; bez e-maili i push. Powiadomienia – zrzut oferty-pracy-sz5, punkt
      15.                                                                         
      • Q102: moduł zlecający może odczytać publiczny status swojego zlecenia po  
      jego identyfikatorze (operacja publicznego kontraktu AI); nie widzi operacji,
      kosztów ani przyczyn.                                                       
      • Uwaga do specyfikacji: wymagania PZ-01–PZ-08 (docs/specs/lokalne-         
      ai/features/panel-zadan) opisują panel dla starego modelu i zostaną         
      zastąpione przez ustalenia grupy H.                                         
  2026-11-18 19:13 Piotr Ziółkowski
    
      Ustalenia grupy I (ścieżki i dostawcy) – wywiad z właścicielem 2026-11-18.  
                                                                                  
      • Q103: koordynacja (wspólna część modułu AI) prowadzi zlecenia, operacje,  
      kolejkę, budżet, statusy, akcje właściciela i dostawę wyniku. Podmoduł      
      wykonawcy: katalog usług i cennik, maksymalny czas działania, czy przerwaną 
      operację można powtórzyć, wykonanie operacji, zgłoszenie zużycia do kosztu  
      faktycznego, zamiana swoich błędów na trzy rodzaje (zwykły błąd, błąd bez   
      ponawiania, wynik niepewny). Wykonawca nie zna zleceń, budżetu ani modułów  
      zlecających. Na styku modułu AI i podmodułów wykonawców działają interfejsy 
      (właściciel).                                                               
      • Q104: wszyscy wykonawcy podlegają tym samym regułom (statusy, ponowienia, 
      budżet, limit czasu, dostawa); różnią się tylko deklaracjami w podmodule;   
      brak wyjątków w koordynacji.                                                
      • Q105: tryb wsadowy OpenAI (Batch API) poza sq2; typ zlecenia „batch”      
      wykonawca realizuje po swojemu. Pomysł – zrzut oferty-pracy-sz5, punkt 16.  
      • Q106: stare dane (wykonania, próby, miesiące budżetu) migrujemy do nowego 
      modelu: każde wykonanie staje się zleceniem z jedną operacją. Fakt do       
      sprawdzenia przed specyfikacją: ile jest danych i czy coś się nie da        
      przenieść. Migracja usuwa nieużywane kolumny starej ścieżki Profilu         
      (result_status, error_code, disposition, publication_allowed).              
  2026-11-18 19:18 Piotr Ziółkowski
    
      Ustalenia grupy J (granice epiku i sposób wdrożenia) – wywiad z właścicielem
      2026-11-18.                                                                 
                                                                                  
      • Q107: oferty-pracy-334.15 (panel) – zdjęto ready-for-agent, dodano needs- 
      triage i notatkę; panel projektujemy w sq2 (grupa H).                       
      • Q108: przejście Profilu, Dopasowania i Firm na nowy kontrakt (składanie   
      zlecenia, odbiorca wyniku, odczyt statusu) należy do sq2. Stary kontrakt    
      znika razem z migracją danych (Q106); brak dwóch ścieżek równolegle.        
      • Q109: oferty-pracy-0mq.15 blokuje sq2 (zależność dodana); Q71 korzysta z  
      jego mechanizmu.                                                            
      • Q110: oferty-pracy-qld zostaje zastąpione przez sq2 (akcja „Rozlicz”, Q88);
      zamknąć z odnośnikiem przy przygotowaniu specyfikacji.                      
      • Q111: sq2 blokuje oferty-pracy-rss i oferty-pracy-0dv (zależności dodane);
      oba zostają poza sq2.                                                       
      • Q112: epik zostanie wdrożony w całości naraz, więc zadania implementacyjne
      mogą być małe i nie muszą działać osobno. Orientacyjne obszary: (1) model   
      zleceń i operacji, koordynacja, encja wykonawcy, migracja danych, przejście 
      modułów zlecających; (2) panel zleceń AI z akcjami i licznikiem; (3) budżet:
      doładowanie, limit domyślny, „Rozlicz”, widoki budżetu i wykonawców.        
                                                                                  
      Projekt (grupy A–J) zakończony; następny krok: przygotowanie PRD, wymagań i 
      solution design (task-prep).                                                
  2026-11-18 19:29 Piotr Ziółkowski
    
      Przygotowanie specyfikacji – decyzje właściciela 2026-11-18.                
                                                                                  
      • Podział epiku na 14 zadań zaakceptowany (1 zlecenie i operacja, 2 encja   
      wykonawcy i interfejs podmodułu, 3 kolejka i start operacji, 4 ponowienia i 
      batch, 5 przerwana operacja, 6 dostawa/porzucenie/limit czasu, 7–9          
      Profil/Dopasowanie/Firmy na nowym kontrakcie, 10 migracja i usunięcie starej
      ścieżki, 11 panel lista i szczegóły, 12 akcje Ponów/Odrzuć/Zatwierdź, 13    
      budżet, 14 wykonawcy w panelu).                                             
      • Fakt: lokalna baza nie ma żadnych wykonań AI (migracje AI 0016–0017 nie   
      zastosowane); jest 67 prób z listopada 2026 (59 dopasowanie, 2 profil, 6    
      research w tym 4 diagnostyczne bez autora w kodzie, jedna o nieznanym       
      koszcie z rezerwacją 0,415 zł); jeden miesiąc budżetu (limit 100 zł).       
      Dopasowanie i Firmy zapisują próby wprost, bez wykonań.                     
      • Q113 (zastępuje Q106 a): przenosimy tylko budżet – miesiące z limitami i  
      obciążeniem (koszty faktyczne plus rezerwacja próby o nieznanym koszcie).   
      Stare próby zostają w tabeli archiwalnej tylko do odczytu, usunięcie osobnym
      zadaniem. Panel zaczyna historię od zera.                                   
      • Q114: Dopasowanie przechodzi na zwykłe zapytania; zlecenie typu batch     
      wykonawca OpenAI realizuje pętlą pojedynczych zapytań. Tryb wsadowy OpenAI  
      zostaje w zrzucie (punkt 16), zgodnie z Q105.                               
      • Sprzeczność rozstrzygnięta: zapis z grupy A „Odrzuć i Zatwierdź próbują   
      zatrzymać trwającą operację” zastępują Q52 i Q91 – operacji w toku nie      
      przerywamy.                                                                 
  2026-11-20 16:20 Piotr Ziółkowski
    
      ## Uspójnienie z epikiem pracy w tle (oferty-pracy-2ba) – decyzje           
      właściciela 2026-11-20                                                      
                                                                                  
      Projekt z grup A–J powstał przed 2ba. 2ba jest wdrażane wcześniej i zabiera 
      modułowi AI własną kolejkę, liczenie miejsc wykonawców i dzierżawy. Poniższe
      zmienia lub doprecyzowuje ustalenia z 2026-11-18. Numery Q odnoszą się do   
      wywiadu z 2026-11-18.                                                       
                                                                                  
      ### Decyzje właściciela                                                     
                                                                                  
      • **Jedna operacja naraz na wykonawcę** w pierwszej wersji, zamiast limitu  
      operacji naraz ustawianego w panelu. Zmienia Q39, Q46, Q48, Q100 w części o 
      limicie. Realizacja: jedna kolejka na wykonawcę z kluczem wyłączności o     
      stałej wartości, jak po oferty-pracy-2ba.6. Cel z PRD „praca idzie          
      równolegle do limitu wykonawcy” wymaga zmiany.                              
      • **Rezerwacja budżetu przy starcie operacji** zostaje (Q18b) i jest        
      wdrażana w sq2. sq2 zmienia więc zachowanie zostawione przez 2ba.6          
      (rezerwacja przy zleceniu). Operacja, na którą brak budżetu, zostaje        
      oczekująca bez zadania kolejki; proces okresowy wysyła jej zadanie, gdy     
      budżet ma miejsce.                                                          
      • **Typ zlecenia „partia” odłożony.** Ocena każdej oferty to osobne zlecenie
      pojedyncze. Odpadają: pozycja partii, status „zakończone częściowo”, akcja  
      „Zatwierdź”, reguły Q16, Q21–Q23, Q27, Q29, Q18c oraz Q114 w części o partii
      realizowanej pętlą. Zgodne z oferty-pracy-0dv („grupa 20 to 20 niezależnych 
      zleceń”): grupa pozostaje pojęciem modułu Dopasowania. Przyjęte skutki: 20  
      wierszy w panelu zamiast jednego, „Ponów” osobno na każdym zleceniu, brak   
      reguły „cała grupa dostaje budżet albo żadna”.                              
      • **Porzucenie zlecenia przez moduł zlecający odłożone** (Q11, Q81): żaden  
      moduł go dziś nie potrzebuje.                                               
      • **Zlecenia w toku przy wdrożeniu sq2 są kończone**, a moduł zlecający     
      zleca pracę ponownie; system nie działa produkcyjnie (jak przy              
      wcześniejszych migracjach).                                                 
                                                                                  
      ### Doprecyzowania wynikające z 2ba (propozycje agenta, bez sprzeciwu       
      właściciela; do potwierdzenia w wymaganiach)                                
                                                                                  
      • Moduł AI nie prowadzi własnej kolejki operacji (zmienia sposób realizacji 
      Q38, Q41, Q43): operacja to wiersz modułu AI i dokładnie jedno zadanie      
      kolejki; kolejność daje kolejka wykonawcy. Po doładowaniu budżetu operacja  
      staje na końcu kolejki.                                                     
      • Przerwana operacja (Q44, Q71): nie ma dzierżawy z oferty-pracy-0mq.15.    
      Kolejne podejście zadania, które zastaje operację „w toku”, oraz obsługa    
      niepowodzenia oznaczają ją jako niepewną; zlecenie przechodzi do „wymaga    
      uwagi”. Moduł AI nie dedukuje przerwania (2ba.1 pkt 14, 26). Zapis w PRD, że
      0mq.15 blokuje sq2, jest nieaktualny.                                       
      • Ponowienia należą do zlecenia (3 automatyczne operacje, Q13). Podejścia   
      zadania kolejki służą tylko do zamknięcia operacji po zgubionym procesie i  
      nie wywołują wykonawcy ponownie.                                            
      • Maksymalny czas działania (Q45) wykonawca egzekwuje sam, przed limitem    
      czasu kolejki; przekroczenie limitu kolejki daje operację niepewną, nie błąd
      do ponowienia.                                                              
      • Dostawa wyniku spoza workera („Odrzuć” z panelu, limit czasu zlecenia)    
      idzie osobnym zadaniem kolejki, bo aplikacja webowa i proces okresowy nie   
      ładują odbiorców wyniku.                                                    
      • Po sq2 z procesu okresowego znikają kroki paczek OpenAI i wznawianie      
      propozycji profilu; zostają: operacje czekające na budżet, limit czasu      
      zleceń, dzienne synchronizacje ogłoszeń.                                    
                                                                                  
      ### Nierozstrzygnięte (propozycje agenta: odłożyć lub uprościć)             
                                                                                  
      • Wykonawca jako zapis w bazie (włączony/wyłączony) i karta wykonawców w    
      panelu (Q55′, Q59, Q100; zadanie 14 z podziału).                            
      • Deklaracja „przerwaną operację można powtórzyć automatycznie” (Q67).      
      • Limit czasu zlecenia: jedna stała wartość bez nadpisywania przez moduł    
      zlecający (Q53).                                                            
      • Akcja „Rozlicz” (Q88, Q95).                                               
      • Filtry panelu i podgląd surowej odpowiedzi (Q97, Q98).                    
                                                                                  
      PRD (docs/specs/sq2-zlecenia-ai/PRD.md) nie został jeszcze poprawiony;      
      odsyła też do pozycji oferty-pracy-sz5 po nieaktualnych numerach.           
  2026-11-20 16:23 Piotr Ziółkowski
    
      ## Uspójnienie z oferty-pracy-2ba – ciąg dalszy, decyzje właściciela 2026-  
      11-20                                                                       
                                                                                  
      Uzupełnia poprzedni komentarz z tego dnia.                                  
                                                                                  
      ### Odłożone poza pierwszą wersję (wszystkie pięć nierozstrzygniętych       
      pozycji)                                                                    
                                                                                  
      • Wykonawca jako zapis w bazie (włączony/wyłączony, limit) i karta          
      wykonawców w panelu (Q55′, Q59, Q100): zrzut oferty-pracy-sz5, pozycja 30.  
      Wykonawca zostaje stałymi w kodzie swojego podmodułu. Zadanie 14 z podziału 
      epiku odpada; numer nie jest używany ponownie.                              
      • Deklaracja „przerwaną operację można powtórzyć automatycznie” (Q67): sz5, 
      pozycja 31. Każda przerwana operacja jest niepewna, a zlecenie „wymaga      
      uwagi”.                                                                     
      • Limit czasu zlecenia nadpisywany przez moduł zlecający (Q53): sz5, pozycja
      32. Zostaje jeden wspólny limit czasu; wartość do ustalenia w wymaganiach.  
      • Akcja „Rozlicz” (Q88, Q95): zostaje w oferty-pracy-qld, które nie jest    
      zastępowane przez sq2 (zmienia Q110). Nieznany koszt obciąża swój miesiąc   
      kwotą rezerwacji; właściciel robi miejsce doładowaniem.                     
      • Filtry listy i podgląd surowej odpowiedzi w panelu (Q97, Q98 w tej        
      części): sz5, pozycja 33.                                                   
                                                                                  
      Wcześniej tego dnia odłożone: typ „partia” (sz5, pozycja 29) i porzucenie   
      zlecenia (sz5, pozycja 34).                                                 
                                                                                  
      ### Zakres pierwszej wersji po decyzjach                                    
                                                                                  
      Zlecenie pojedyncze i agentowe; statusy: w toku, wymaga uwagi, udane,       
      nieudane; 3 automatyczne operacje; jedna operacja naraz na wykonawcę;       
      rezerwacja budżetu przy starcie operacji; jedna dostawa wyniku; wspólny     
      limit czasu; panel z listą, szczegółami, licznikiem oraz akcjami „Ponów” i  
      „Odrzuć”; zmiana limitu bieżącego miesiąca i limitu domyślnego; przejście   
      Profilu, Dopasowania i Firm; migracja budżetu.                              
                                                                                  
      ### Dokumenty                                                               
                                                                                  
      • PRD (docs/specs/sq2-zlecenia-ai/PRD.md) poprawiony 2026-11-20 zgodnie z   
      powyższym; podział na 13 zadań.                                             
      • Sprostowanie poprzedniego komentarza: PRD odsyła do pozycji oferty-pracy- 
      sz5 po poprawnych numerach (10–16). Błąd wziął się z widoku bd show, który  
      przenumerowuje listę; w opisie zrzutu numery 11 i 13 występują dwukrotnie.  
      • Do zrobienia przy specyfikacji: glosariusz (sekcja AI module) nadal       
      opisuje pojęcia odłożone (pozycja partii, zakończone częściowo, Zatwierdź,  
      porzucenie, Rozlicz, limit operacji naraz); istniejące zadanie oferty-pracy-
      sq2.1 (weryfikacja adaptera OpenAI) ma ten sam numer co etap 1 w PRD.       
  2026-11-20 18:48 Piotr Ziółkowski
    
      2026-11-20: powstały szkice docs/specs/sq2-zlecenia-ai/requirements.md      
      (etapy T1–T13, kryteria, 10 otwartych decyzji O-1…O-10) i solution-design.md
      (decyzje ZA-D01…D08; D05–D08 to propozycje agenta, nieocenione przez        
      właściciela). Niezatwierdzone w git, zadań bd dla etapów nie utworzono.     
      Przed utworzeniem zadań: decyzje O-1…O-10 oraz kolizja numeru z istniejącym 
      oferty-pracy-sq2.1.                                                         
  2026-11-20 19:17 Piotr Ziółkowski
    
      Decyzja właściciela 2026-11-20 (O-2): historie ocen i researchu sprzed      
      wdrożenia pokazują tylko to, co moduły Dopasowania i Firm zapisały same;    
      koszt, wpisy nieudanych prób i podgląd wymiany z dostawcą dla starych prac  
      znikają. Wpisane w requirements.md: T8-R08, T9-R05, T10-R03.                
  2026-11-20 19:17 Piotr Ziółkowski
    
      Decyzja właściciela 2026-11-20 (O-4): operacja, która czekała na budżet,    
      wraca na koniec kolejki swojego wykonawcy (zastępuje Q43 w części o         
      zachowaniu miejsca). Wpisane w requirements.md T3-R05 i solution-design.md  
      ZA-D02.                                                                     
  2026-11-20 19:18 Piotr Ziółkowski
    
      Decyzje właściciela 2026-11-20 (O-1, O-3, O-5…O-10 przyjęte zgodnie z       
      propozycjami): limit czasu zlecenia 7 dni; limit miesiąca można ustawić     
      poniżej wydanej kwoty; lokalny wykonawca max 30 min; zapytanie i surowa     
      odpowiedź zapisywane dla każdej operacji; tekst Profilu po nieudanym        
      przygotowaniu i brak kwoty rezerwacji w widoku researchu; praca             
      niedokończona przy wdrożeniu pokazuje się jako nieudana, właściciel zleca   
      ponownie; praca w tle zawodząca przed startem operacji = zwykły błąd bez    
      kosztu; lista panelu po 50. Wszystkie O-1…O-10 rozstrzygnięte w             
      requirements.md. W solution-design.md nadal propozycje agenta: ZA-D05, ZA-  
      D06, ZA-D07 i wybór tabeli w ZA-D08.                                        
  2026-11-20 19:19 Piotr Ziółkowski
    
      Decyzje właściciela 2026-11-20: przyjęte ZA-D06 (każda dostawa osobnym      
      zadaniem kolejki dostaw, worker z trzema procesami) i ZA-D07 (stara i nowa  
      droga obok siebie od T1 do T10). ZA-D05 (podejścia zadania kolejki nie      
      wołają wykonawcy ponownie) nadal propozycja – właściciel prosi o            
      wyjaśnienie.                                                                
  2026-11-20 19:21 Piotr Ziółkowski
    
      Decyzja właściciela 2026-11-20: przyjęte ZA-D05 – podejścia zadania kolejki 
      nigdy nie wołają wykonawcy ponownie; powtórka pracy AI to zawsze nowa       
      operacja zlecenia (limit 3). Wszystkie decyzje ZA-D01…D07 rozstrzygnięte;   
      propozycją agenta pozostaje tylko wybór tabeli w ZA-D08.                    
  2026-11-20 19:23 Piotr Ziółkowski
    
      2026-11-20: utworzono zadania etapów oferty-pracy-sq2.2 … sq2.14 (etapy     
      T1…T13 z requirements.md), każde z kryteriami, odnośnikami do dokumentów i  
      zależnością od poprzedniego; sq2.2 zależy od oferty-pracy-2ba.6. Bez        
      etykiet: przekazanie do realizacji (ready-for-agent, load_bearing, shared,  
      wypchnięcie main) jeszcze nie nastąpiło.                                    


---

○ oferty-pracy-sq2.1 · Weryfikacja adaptera OpenAI względem reguł obsługi zleceń AI (sq2)   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-18 · Updated: 2026-11-18

DESCRIPTION

  Moduł AI dostaje nowe reguły obsługi zleceń, operacji i awarii (oferty-     
  pracy-sq2, komentarze z ustaleniami grup A–C). Adapter OpenAI               
  (modules/ai/infrastructure/adapters/openai.ts) powstał wcześniej i może do  
  nich nie pasować. Grozi to tym, że po awarii zapłacimy dwa razy, zgubimy    
  wynik albo zlecenie dostanie zły status.                                    
                                                                              
  Do sprawdzenia i opisania, bez zmian w kodzie:                              
                                                                              
  1. Czy błędy adaptera da się przypisać do rodzajów z sq2: zwykły błąd (można
  ponowić), „nie ponawiaj”, niepewny, wykonawca niedostępny (Q13, Q17, Q69).  
  Jak dziś traktowane są limity zapytań, błędy 5xx i przekroczenie 90 s.      
  2. Czy adapter może zapisać identyfikator pracy u OpenAI przed jej          
  zakończeniem (tryb w tle w Responses API), żeby po awarii workera wrócić do 
  niej zamiast powtarzać (Q75).                                               
  3. Czy i jak można przerwać pracę po stronie OpenAI (Q73).                  
  4. Czy tryb Batch w OpenAI pasuje do zlecenia typu batch: jedna operacja czy
  wiele, czas trwania, koszt, powrót do pracy.                                
  5. Skąd adapter bierze koszt faktyczny i kiedy jest on nieznany.            
                                                                              
  Rezultat: notatka w docs/research/ z odpowiedziami i listą zmian w          
  adapterze, podlinkowana w tym zadaniu.                                      
                                                                              
  Źródło: wywiad z właścicielem 2026-11-18 (sq2, grupa C).                    



LABELS: needs-triage

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2


---

○ oferty-pracy-sq2.2 · Zlecenie AI: moduł zlecający składa zlecenie i czyta jego status   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t1

DESCRIPTION

  Nowy kontrakt modułu AI dla modułów zlecających: złożenie zlecenia w        
  operacji modułu (z zamrożoną treścią, wykonawcą i parametrami) oraz odczyt  
  statusu po identyfikatorze. Powstaje zlecenie z pierwszą operacją           
  oczekującą; wykonanie operacji to kolejny etap. Stary kontrakt działa obok  
  do etapu migracji.                                                          
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t1 i solution-     
  design.md#t1. Etap 1 z PRD. Epik jest wdrażany w całości; między zadaniami  
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T1-AC01: An assignment placed in a committed operation exists, in progress, 
  with one pending operation; one placed in an operation that is rolled back  
  does not. (T1-R01, T1-R05)                                                  
  T1-AC02: A single and an agent assignment keep every value of T1-R02 with   
  the executor and parameters found for the settings name; changing the       
  settings afterwards does not change the stored assignment. (T1-R02, T1-R03) 
  T1-AC03: Each case of T1-R04 returns its error and leaves no assignment and 
  no operation. (T1-R04)                                                      
  T1-AC04: Two assignments placed with the same input under the same settings 
  name both exist. (T1-R06)                                                   
  T1-AC05: The status read returns the status of each known identifier of a   
  list and reports an unknown one as not found; its result holds nothing      
  beyond identifier and status. (T1-R07)                                      
  T1-AC06: The question of T1-R08 answers yes for complete settings and no for
  each configuration gap of T1-R04, with no provider called. (T1-R08)         
  T1-AC07: An assignment for an executor that needs the check is refused      
  without it and placed with it; the requesting module's code never reads the 
  value. (T1-R09)                                                             



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t1
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t1

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ◐ oferty-pracy-2ba.6: Przepiąć moduł AI na biblioteki kolejek i workera i usunąć starą drogę P2

BLOCKS
  ← ○ oferty-pracy-sq2.3: Wykonawcy AI za wspólnym interfejsem P2


---

○ oferty-pracy-sq2.3 · Wykonawcy AI za wspólnym interfejsem   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t2

DESCRIPTION

  Wykonawca płatny (OpenAI: pojedyncza odpowiedź, sesja agenta) i lokalny     
  (lokalny model: pojedyncza odpowiedź) wykonują operacje przez jeden         
  interfejs: deklaracja usług, parametrów, cennika i maksymalnego czasu       
  działania; wynik operacji w jednym z czterech rodzajów (wynik, zwykły błąd, 
  błąd bez ponawiania, niepewna); zapis dokładnego zapytania i surowej        
  odpowiedzi przy każdej operacji. Moduł AI nie sprawdza już wyniku względem  
  formatu odpowiedzi.                                                         
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t2 i solution-     
  design.md#t2. Etap 2 z PRD. Epik jest wdrażany w całości; między zadaniami  
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T2-AC01: Each executor's declaration lists its services, parameters, prices 
  and maximum run times, and placing (T1-R04) refuses what the declaration    
  does not offer. (T2-R01)                                                    
  T2-AC02: For each event in the mapping table of the solution design, the    
  paid and the local executor return the listed outcome, cause and usage. (T2-
  R03, T2-R04)                                                                
  T2-AC03: An operation of a simulated provider that does not answer ends as  
  an ordinary failure once the maximum run time passes; every declared maximum
  run time is below the queue's time limit. (T2-R05)                          
  T2-AC04: A paid single answer, a paid agent session and a local single      
  answer with simulated providers send the same provider requests as before   
  the task and return their result, and the agent its materials. (T2-R06)     
  T2-AC05: A result that does not follow the response format is returned as a 
  result. (T2-R07)                                                            
  T2-AC06: After an operation, the request sent and every raw response are    
  stored with it, also when the response could not be read. (T2-R08)          
  T2-AC07: Outside the executors no code names a provider, an executor or a   
  provider's fact; the executors' code reads no assignment, budget or         
  requesting module. (T2-R02, T2-R09)                                         



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t2
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t2

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.2: Zlecenie AI: moduł zlecający składa zlecenie i czyta jego status P2

BLOCKS
  ← ○ oferty-pracy-sq2.4: Operacje AI startują po kolei i w ramach budżetu P2


---

○ oferty-pracy-sq2.4 · Operacje AI startują po kolei i w ramach budżetu   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t3

DESCRIPTION

  Wykonanie oczekujących operacji: jedna naraz na wykonawcę (kolejka          
  wykonawcy), budżet pobierany przy starcie operacji w jednym zapisie ze      
  sprawdzeniem, operacja bez budżetu czeka i nie blokuje wykonawcy, po        
  pojawieniu się miejsca w budżecie wraca na koniec kolejki, koniec operacji z
  rozliczeniem w jednym zapisie.                                              
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t3 i solution-     
  design.md#t3. Etap 3 z PRD. Epik jest wdrażany w całości; między zadaniami  
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T3-AC01: Two assignments for the paid executor are carried out one after the
  other in the order placed; one for the paid and one for the local executor  
  run at the same time. (T3-R01)                                              
  T3-AC02: An operation starts with its potential cost charged to the current 
  month; with room for one, two operations starting together leave one running
  and one waiting for the budget; a price change after the start does not     
  change the started operation's costs. (T3-R02)                              
  T3-AC03: With no room in the budget, an operation of the local executor     
  starts and charges nothing. (T3-R03)                                        
  T3-AC04: With room for the second of two paid operations only, the second   
  runs while the first waits for the budget. (T3-R04)                         
  T3-AC05: After the limit is raised, and after the month changes, a pass of  
  the periodic process lets waiting operations start, oldest first as far as  
  the room reaches, and leaves the rest waiting. (T3-R05)                     
  T3-AC06: An operation with a result, with a failure and with missing usage  
  each end in one save with the state, the cost (known, known, unknown) and   
  the month's charge of ZA-R04; the executor was called once. (T3-R06)        
  T3-AC07: An operation started one second before midnight of a month's last  
  day in Polish time belongs to that month, also when it ends in the next; the
  first start in a month without a budget creates it with the default limit.  
  (T3-R07)                                                                    
  T3-AC08: An assignment with a settled, an unknown-cost and a never-started  
  operation shows the four figures of T3-R08. (T3-R08)                        



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t3
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t3

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.3: Wykonawcy AI za wspólnym interfejsem P2

BLOCKS
  ← ○ oferty-pracy-sq2.5: Automatyczne ponowienia zlecenia AI i status „wymaga uwagi” P2


---

○ oferty-pracy-sq2.5 · Automatyczne ponowienia zlecenia AI i status „wymaga uwagi”   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t4

DESCRIPTION

  Najwyżej 3 operacje bez udziału właściciela. Zwykły błąd dodaje kolejną     
  operację; trzeci błąd, błąd bez ponawiania albo operacja niepewna przenoszą 
  zlecenie do „wymaga uwagi”. Znika pojedyncza dodatkowa próba po błędzie     
  przejściowym dostawcy.                                                      
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t4 i solution-     
  design.md#t4. Etap 4 z PRD. Epik jest wdrażany w całości; między zadaniami  
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T4-AC01: An assignment whose executor fails ordinarily twice and then       
  answers ends its third operation with a result; the three operations use the
  same frozen content. (T4-R01, T4-R02)                                       
  T4-AC02: Three ordinary failures, one non-retryable failure and one         
  uncertain end each leave the assignment in needs attention with no pending  
  or running operation. (T4-R03)                                              
  T4-AC03: After an operation of the paid executor ends uncertain, the next   
  assignment for that executor is carried out. (T4-R04)                       
  T4-AC04: An executor whose provider cannot be reached gives an ordinary     
  failure, and the assignment gets its next operation. (T4-R05)               
  T4-AC05: A pending operation whose background work fails on every attempt   
  before the start ends as an ordinary failure with no charge, and the        
  assignment gets its next operation. (T4-R06)                                
  T4-AC06: No code repeats a provider call inside one operation after a       
  transient error. (T4-R07)                                                   



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t4
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t4

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.4: Operacje AI startują po kolei i w ramach budżetu P2

BLOCKS
  ← ○ oferty-pracy-sq2.6: Przerwana operacja AI kończy się jako niepewna P2


---

○ oferty-pracy-sq2.6 · Przerwana operacja AI kończy się jako niepewna   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t5

DESCRIPTION

  Operacja, której praca urwała się bez wyniku (padł worker, wdrożenie, limit 
  czasu kolejki), kończy się jako niepewna z nieznanym kosztem i zachowanym   
  kosztem potencjalnym; zlecenie przechodzi do „wymaga uwagi”; wykonawca nie  
  jest wołany ponownie. Spóźniony proces niczego nie zmienia.                 
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t5 i solution-     
  design.md#t5. Etap 5 z PRD. Epik jest wdrażany w całości; między zadaniami  
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T5-AC01: After the worker is killed during an operation, and after an       
  operation outlasts a short queue time limit, the operation is uncertain with
  an unknown actual cost and its potential cost charged, the assignment needs 
  attention, and the provider was called once. (T5-R01, T5-R02)               
  T5-AC02: The same holds when the worker is killed during the last attempt of
  the background work. (T5-R01, T5-R03)                                       
  T5-AC03: A result saved after its operation was ended as uncertain changes  
  neither the operation nor the assignment, and the raw response is stored    
  with the operation. (T5-R04)                                                



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t5
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t5

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.5: Automatyczne ponowienia zlecenia AI i status „wymaga uwagi” P2

BLOCKS
  ← ○ oferty-pracy-sq2.7: Jedna dostawa wyniku zlecenia AI i limit czasu zlecenia P2


---

○ oferty-pracy-sq2.7 · Jedna dostawa wyniku zlecenia AI i limit czasu zlecenia   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t6

DESCRIPTION

  Moduł zlecający dostaje wynik albo informację o porażce raz, przez swojego  
  odbiorcę; dostawa rozstrzyga status końcowy, a nieodebrany wynik kończy     
  zlecenie jako nieudane. Każde zlecenie ma limit 7 dni od złożenia; po jego  
  przekroczeniu zlecenie kończy się jako nieudane, a operacja w toku może się 
  dokończyć.                                                                  
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t6 i solution-     
  design.md#t6. Etap 6 z PRD. Epik jest wdrażany w całości; między zadaniami  
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T6-AC01: An assignment whose operation returns a result ends succeeded, its 
  receiver was called once with the result (an agent's with its materials),   
  and what the receiver saved is in the database. (T6-R01, T6-R02)            
  T6-AC02: With a receiver that raises an error, and with none registered, the
  assignment ends failed with the reason "result not taken", none of the      
  receiver's saves remain, the receiver was called at most once, and the      
  operation's cost is as settled. (T6-R03)                                    
  T6-AC03: An assignment failed by the time limit has its receiver told once  
  that it failed, with no reason passed; with a receiver that raises an error 
  it stays failed with the error noted. (T6-R04)                              
  T6-AC04: A delivery is made while the paid executor carries out another     
  operation. (T6-R05)                                                         
  T6-AC05: An assignment waiting for the budget and one needing attention,    
  both past the limit, fail with the reason "time limit exceeded" after a pass
  of the periodic process; their pending operations charge nothing; one not   
  yet past the limit is not changed. (T6-R06, T6-R07)                         
  T6-AC06: With an operation running past the limit: a result gives a         
  succeeded assignment; an ordinary failure gives a failed assignment with the
  reason "time limit exceeded" and no new operation. (T6-R08)                 
  T6-AC07: A delivery whose process is killed before the save is made again   
  and takes effect once. (T6-R09)                                             



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t6
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t6

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.6: Przerwana operacja AI kończy się jako niepewna P2

BLOCKS
  ← ○ oferty-pracy-sq2.8: Profil na nowym kontrakcie zleceń AI P2


---

○ oferty-pracy-sq2.8 · Profil na nowym kontrakcie zleceń AI   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t7

DESCRIPTION

  Przygotowanie propozycji profilu z CV składa jedno zlecenie AI i przechowuje
  jego identyfikator. Profil sam sprawdza wynik (format, cytaty) i sam pilnuje
  jednego przygotowania na CV. Właściciel widzi tylko: w toku albo nieudane;  
  znikają komunikaty o czekaniu na budżet i samoczynne wznawianie przygotowań.
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t7 i solution-     
  design.md#t7. Etap 7 z PRD. Epik jest wdrażany w całości; między zadaniami  
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T7-AC01: Requesting a preparation places one assignment and stores its      
  identifier; rolling the request back leaves neither; a second request for   
  the same CV while the first is in progress is refused. (T7-R01, T7-R02)     
  T7-AC02: With a simulated provider a correct result gives a proposal for the
  right revision; a result with a quote not in the text, and one not in the   
  format, give a failed preparation with the assignment succeeded; a result   
  for an older revision does not replace a newer proposal. (T7-R03)           
  T7-AC03: The profile page shows the texts of T7-R04 for an assignment in    
  progress, needing attention and failed, and none of the removed texts exists
  in the application. (T7-R04)                                                
  T7-AC04: No Profile operation requests AI work without the owner's request; 
  the periodic process has no Profile step. (T7-R05)                          
  T7-AC05: The existing tests of CV import, of applying a proposal and of     
  reading proposals pass; the budget card shows the months of T13-R05. (T7-   
  R06)                                                                        
  T7-AC06: The Profile uses only the operations of T1 and T6-R01 of the AI    
  module.                                                                     



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t7
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t7

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.7: Jedna dostawa wyniku zlecenia AI i limit czasu zlecenia P2

BLOCKS
  ← ○ oferty-pracy-sq2.9: Dopasowanie na nowym kontrakcie zleceń AI P2


---

○ oferty-pracy-sq2.9 · Dopasowanie na nowym kontrakcie zleceń AI   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t8

DESCRIPTION

  Każda ocena oferty to osobne zlecenie AI zwykłym zapytaniem; polecenie dla  
  wielu ofert (do 100) składa po jednym zleceniu na ofertę. Znika tryb wsadowy
  OpenAI i reguła „cała grupa dostaje budżet albo żadna”. Dopasowanie samo    
  sprawdza wynik. Historia ocen sprzed wdrożenia pokazuje tylko to, co        
  Dopasowanie zapisało samo.                                                  
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t8 i solution-     
  design.md#t8. Etap 8 z PRD. Epik jest wdrażany w całości; między zadaniami  
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T8-AC01: A command for 30 offers places 30 assignments, each with its own   
  label, and stores each identifier with its assessment request; a failure    
  while placing leaves none. (T8-R01)                                         
  T8-AC02: With room in the budget for 2 of 5 assessments, 2 are carried out  
  and published while 3 stay in progress; after the limit is raised they are  
  carried out. (T8-R02)                                                       
  T8-AC03: With a simulated provider: a correct result is published; a result 
  outside the format, and one whose evidence fails, give a failed assessment  
  with the assignment succeeded; a result for a replaced profile version is   
  not published. (T8-R03)                                                     
  T8-AC04: The offer views show the texts of T8-R04 for each status, and none 
  of the removed texts exists in the application. (T8-R04)                    
  T8-AC05: An oversized assessment is refused with nothing placed. (T8-R05)   
  T8-AC06: The existing tests of manual assessments, exclusions, ratings and  
  weights pass; the offer list stops refreshing when no assessment is in      
  progress. (T8-R06)                                                          
  T8-AC07: The exchange view of a new assessment shows the request and the raw
  response of each of its operations. (T8-R07)                                
  T8-AC09: After the migration, an offer with an assessment published before  
  it still shows that assessment; its history shows no cost, no entry of an   
  earlier attempt without an assessment and no exchange view for it. (T8-R08) 
  T8-AC08: Matching uses only the operations of T1, T6-R01 and the exchange   
  read of the AI module; nothing in Matching requests a provider batch.       



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t8
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t8

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.8: Profil na nowym kontrakcie zleceń AI P2

BLOCKS
  ← ○ oferty-pracy-sq2.10: Firmy na nowym kontrakcie zleceń AI P2


---

○ oferty-pracy-sq2.10 · Firmy na nowym kontrakcie zleceń AI   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t9

DESCRIPTION

  Research firmy składa jedno zlecenie AI typu sesja agenta z wyszukiwaniem w 
  sieci. Firmy same sprawdzają raport i pilnują jednego researchu na firmę.   
  Widok nie pokazuje już czekania na budżet ani kwoty rezerwacji. Historia    
  researchu sprzed wdrożenia pokazuje tylko to, co moduł Firm zapisał sam.    
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t9 i solution-     
  design.md#t9. Etap 9 z PRD. Epik jest wdrażany w całości; między zadaniami  
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T9-AC01: Requesting research places one agent assignment and stores its     
  identifier; a second request for the same company while the first is in     
  progress places nothing. (T9-R01, T9-R04)                                   
  T9-AC02: With a simulated provider a valid report is saved with its sources;
  an invalid one gives failed research with the assignment succeeded. (T9-R02)
  T9-AC03: The company view shows the texts of T9-R03 for each status and no  
  amount, and none of the removed texts exists in the application. (T9-R03)   
  T9-AC04: The existing tests of reusing a report and of an explicit refresh  
  pass. (T9-R04)                                                              
  T9-AC06: After the migration, a company with a report saved before it still 
  shows that report; its history shows no cost and no entry of earlier        
  research without a report. (T9-R05)                                         
  T9-AC05: Companies uses only the operations of T1 and T6-R01 of the AI      
  module.                                                                     



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t9
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t9

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.9: Dopasowanie na nowym kontrakcie zleceń AI P2

BLOCKS
  ← ○ oferty-pracy-sq2.11: Migracja budżetu AI i usunięcie starej drogi zlecania P2


---

○ oferty-pracy-sq2.11 · Migracja budżetu AI i usunięcie starej drogi zlecania   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t10

DESCRIPTION

  Każdy miesiąc budżetu zachowuje limit, a jego dotychczasowe obciążenie      
  przechodzi jako jedna kwota. Niedokończona praca AI starej drogi jest       
  kończona, a sprawy modułów pokazują się jako nieudane. Stare zapisy zostają 
  jako archiwum, którego aplikacja nie czyta. Znikają stary kontrakt modułu   
  AI, obsługa paczek OpenAI i sprawdzanie wyniku; proces okresowy ma trzy     
  kroki.                                                                      
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t10 i solution-    
  design.md#t10. Etap 10 z PRD. Epik jest wdrażany w całości; między zadaniami
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T10-AC01: On a database with earlier attempts (settled, of unknown cost,    
  never started, started and unfinished), each month's charge after the       
  migration equals the settled costs plus the reserved amounts of the unknown 
  and the started ones, and its limit is as it was. (T10-R01, T10-R02)        
  T10-AC02: After the migration, a profile preparation, an assessment and a   
  company research that were unfinished show as failed and can be requested   
  again. (T10-R02)                                                            
  T10-AC03: After the migration the earlier records are still in the database,
  and the AI tasks panel lists no assignment. (T10-R03)                       
  T10-AC04: No code uses the old contract, provider batches or the result     
  check; the periodic process runs exactly the three steps of T10-R04; the AI 
  module's description and the glossary describe the first version. (T10-R04, 
  T10-R05)                                                                    



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t10
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t10

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.10: Firmy na nowym kontrakcie zleceń AI P2

BLOCKS
  ← ○ oferty-pracy-sq2.12: Panel zadań AI: lista i szczegóły zleceń P2


---

○ oferty-pracy-sq2.12 · Panel zadań AI: lista i szczegóły zleceń   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t11

DESCRIPTION

  Strona „Zadania AI” w nawigacji każdej strony: lista zleceń (wymagające     
  uwagi na górze, po 50), szczegóły zlecenia z operacjami, kosztami i         
  przyczyną błędu, licznik zleceń wymagających uwagi w nawigacji. Bez filtrów 
  i bez podglądu surowej odpowiedzi.                                          
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t11 i solution-    
  design.md#t11. Etap 11 z PRD. Epik jest wdrażany w całości; między zadaniami
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T11-AC01: With assignments in every status, the list read returns those     
  needing attention first and the rest from the newest, 50 at a time, with the
  row data of T11-R02. (T11-R02)                                              
  T11-AC02: The details read of an assignment with a settled, a failed, an    
  uncertain and a budget-waiting operation returns the data of T11-R03, and no
  raw response. (T11-R03)                                                     
  T11-AC03: The page "Zadania AI" opens from the navigation of the offers,    
  companies and profile pages, shows the list and opens an assignment's       
  details; the counter shows 2 with two assignments needing attention and     
  nothing with none. (T11-R01, T11-R04)                                       
  T11-AC04: The panel's routes use only the AI module's public read           
  operations. (T11-R05)                                                       



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t11
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t11

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.11: Migracja budżetu AI i usunięcie starej drogi zlecania P2

BLOCKS
  ← ○ oferty-pracy-sq2.13: Akcje właściciela w panelu zadań AI: Ponów i Odrzuć P2


---

○ oferty-pracy-sq2.13 · Akcje właściciela w panelu zadań AI: Ponów i Odrzuć   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t12

DESCRIPTION

  „Ponów” dla zlecenia wymagającego uwagi dodaje jedną operację ponad limit   
  automatycznych i nie przedłuża limitu czasu. „Odrzuć” kończy zlecenie jako  
  nieudane od razu, bez przerywania operacji w toku. Akcja na zleceniu, które 
  zmieniło stan, niczego nie zmienia i pokazuje „Zlecenie zmieniło stan”.     
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t12 i solution-    
  design.md#t12. Etap 12 z PRD. Epik jest wdrażany w całości; między zadaniami
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T12-AC01: Retry on an assignment needing attention adds one operation and   
  makes it in progress with the same time limit; a result then ends it        
  succeeded. (T12-R01)                                                        
  T12-AC02: An ordinary failure of a Retry's operation returns the assignment 
  to needs attention with no further operation. (T12-R02)                     
  T12-AC03: Reject on an assignment waiting for the budget, and on one needing
  attention, fails it with its receiver told once; Reject while an operation  
  runs fails it at once, and the operation's later result is settled, kept    
  with the operation and not delivered. (T12-R03)                             
  T12-AC04: Retry on an assignment in progress, on a final one and on one past
  its time limit, and a second Reject, change nothing and return the current  
  status; two Rejects sent together fail the assignment once with one         
  delivery. (T12-R04)                                                         
  T12-AC05: The details page offers Retry with the time left only when the    
  assignment needs attention, and Reject only while it is not final; after an 
  action that changed nothing it shows "Zlecenie zmieniło stan" and the       
  current status. (T12-R01, T12-R04, T12-R05)                                 



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t12
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t12

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.12: Panel zadań AI: lista i szczegóły zleceń P2

BLOCKS
  ← ○ oferty-pracy-sq2.14: Zarządzanie budżetem AI w panelu P2


---

○ oferty-pracy-sq2.14 · Zarządzanie budżetem AI w panelu   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-20 · Updated: 2026-11-20
Spec: docs/specs/sq2-zlecenia-ai/requirements.md#t13

DESCRIPTION

  Widok budżetu bieżącego miesiąca (limit, wydane, zarezerwowane, obciążenie z
  operacji o nieznanym koszcie, pozostało) i lista wcześniejszych miesięcy.   
  Właściciel ustawia limit bieżącego miesiąca i limit domyślny dla kolejnych; 
  po podniesieniu limitu czekające operacje ruszają same.                     
                                                                              
  Specyfikacja: docs/specs/sq2-zlecenia-ai/requirements.md#t13 i solution-    
  design.md#t13. Etap 13 z PRD. Epik jest wdrażany w całości; między zadaniami
  aplikacja przechodzi wszystkie sprawdzenia.                                 



ACCEPTANCE CRITERIA

  ZA-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  ZA-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T13-AC01: For a month with a settled, a running and an unknown-cost         
  operation and a carried amount, the budget read returns the figures of T13- 
  R01, and what remains equals the limit minus the month's charge. (T13-R01)  
  T13-AC02: Setting the current limit changes the current month only; setting 
  it below the charge is accepted and no paid operation starts; the next month
  starts with the default limit, whatever remained. (T13-R02, T13-R03)        
  T13-AC03: Setting the default limit changes the limit of a month created    
  afterwards and not the current one; without any change a new month starts   
  with 100 PLN. (T13-R03)                                                     
  T13-AC04: A text, a negative amount and an amount with three decimal places 
  are each refused with a message and change nothing. (T13-R04)               
  T13-AC05: The panel shows the budget view and both forms; after the owner   
  raises the limit there, an assignment that waited for the budget is carried 
  out within two minutes. The profile page's card shows the same limit and    
  charge for the month. (T13-R01, T13-R05, T13-R06)                           



METADATA
  prd: docs/specs/sq2-zlecenia-ai/PRD.md
  requirements: docs/specs/sq2-zlecenia-ai/requirements.md#t13
  sd: docs/specs/sq2-zlecenia-ai/solution-design.md#t13

PARENT
  ↑ ○ oferty-pracy-sq2: (EPIC) Dopracować cykl życia, odzyskiwanie i rozliczanie zadań AI P2

DEPENDS ON
  → ○ oferty-pracy-sq2.13: Akcje właściciela w panelu zadań AI: Ponów i Odrzuć P2


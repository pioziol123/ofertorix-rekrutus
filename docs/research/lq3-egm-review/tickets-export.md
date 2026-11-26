○ oferty-pracy-lq3 [EPIC] · Lista aplikacji: zapisywanie ofert, wysłanie CV i odrzucenie   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: epic
Created: 2026-11-26 · Updated: 2026-11-26
Spec: docs/specs/lq3-lista-aplikacji/PRD.md

DESCRIPTION

  Pierwszy kawałek modułu Rekrutacje: właściciel zapisuje oferty na prywatną  
  listę, oznacza wysłanie CV i odrzucenie, prowadzi notatkę i filtruje listę  
  ofert po etapie aplikacji. Zakres ustalony z właścicielem 2026-11-22/26 w   
  rozmowie (grilling).                                                        



METADATA
  load_bearing: A-R01,A-R02,A-R03,A-R07,A-R13

CHILDREN
  ↳ ○ oferty-pracy-lq3.3: Etap aplikacji na liście ofert: ikonka i filtr P2
  ↳ ○ oferty-pracy-lq3.2: Moja lista i szczegóły aplikacji z notatką i historią etapów P2
  ↳ ○ oferty-pracy-lq3.1: Aplikacja w szczegółach oferty: moduł Rekrutacje, etapy i przejścia P2
  ◐ 0/3 complete (0%)


---

○ oferty-pracy-lq3.1 · Aplikacja w szczegółach oferty: moduł Rekrutacje, etapy i przejścia   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: feature
Created: 2026-11-26 · Updated: 2026-11-26
Spec: docs/specs/lq3-lista-aplikacji/requirements.md#t1--the-application-in-offer-details

DESCRIPTION

  Właściciel zakłada aplikację i zmienia jej etap polem wyboru w szczegółach  
  oferty; moduł Rekrutacje zapisuje etap aktualny i historię zmian.           



ACCEPTANCE CRITERIA

  A-AC01: każde przejście z tabeli A-R03 się udaje, każde inne jest odrzucane 
  bez zmian; pierwsza zmiana tworzy jedną aplikację; każda zmiana zapisuje    
  etap i chwilę                                                               
  A-AC02: zmiana z nieaktualnym etapem jest odrzucana komunikatem A-R07 i nic 
  nie zapisuje                                                                
  A-AC04: po restarcie etapy i ich daty są takie same                         
  A-AC05: niedostępność ogłoszenia i nowa ocena nie zmieniają etapu ani daty  
  A-AC06: pole etapu podaje dokładnie etapy dozwolone przez A-R03             
  A-AC08: ponowny wybór bieżącego etapu nic nie zapisuje i kończy się sukcesem
  T1-AC01: szczegóły oferty pokazują etap (lub Poza listą) i nie pokazują     
  notatki                                                                     
  T1-AC02: przejście przez sekwencję etapów pokazuje po każdym wyborze wybrany
  etap                                                                        
  T1-AC03: wybór z nieaktualnej strony pokazuje komunikat A-R07 i etap zostaje



LABELS: ready-for-agent

METADATA
  prd: docs/specs/lq3-lista-aplikacji/PRD.md
  requirements: docs/specs/lq3-lista-aplikacji/requirements.md#t1--the-application-in-offer-details
  sd: docs/specs/lq3-lista-aplikacji/solution-design.md

PARENT
  ↑ ○ oferty-pracy-lq3: (EPIC) Lista aplikacji: zapisywanie ofert, wysłanie CV i odrzucenie P2

BLOCKS
  ← ○ oferty-pracy-lq3.3: Etap aplikacji na liście ofert: ikonka i filtr P2
  ← ○ oferty-pracy-lq3.2: Moja lista i szczegóły aplikacji z notatką i historią etapów P2


---

○ oferty-pracy-lq3.2 · Moja lista i szczegóły aplikacji z notatką i historią etapów   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: feature
Created: 2026-11-26 · Updated: 2026-11-26
Spec: docs/specs/lq3-lista-aplikacji/requirements.md#t2--the-page-moja-lista-and-the-application-details

DESCRIPTION

  Strona Moja lista ze stronicowaniem wspólnym z panelem synchronizacji oraz  
  szuflada szczegółów aplikacji: widełki, pole etapu, notatka, historia       
  etapów.                                                                     



ACCEPTANCE CRITERIA

  A-AC03: notatka 10 000 znaków zapisuje się, 10 001 jest odrzucana           
  komunikatem A-R10; późniejszy zapis wygrywa; zapis notatki nie zmienia etapu
  A-AC04: po restarcie notatki są takie same                                  
  A-AC07: zapis notatki dla oferty bez aplikacji jest odrzucany i nie tworzy  
  aplikacji                                                                   
  T2-AC01: nawigacja każdej strony ma link Moja lista                         
  T2-AC02: wiersz pokazuje tytuł, firmę, etap, oznaczenie niedostępności i    
  datę etapu DD.MM.RRRR w czasie polskim                                      
  T2-AC03: każdy wybór przełącznika pokazuje dokładnie swoje etapy, domyślnie 
  Aktywne, Zdjęta z listy nigdy                                               
  T2-AC04: kolejność od najnowszej zmiany etapu, edycja notatki jej nie       
  zmienia, stała przy remisie                                                 
  T2-AC05: stronicowanie 10/20/50/100, domyślnie 20, nieznane wartości adresu 
  dają domyślne, strona przycinana                                            
  T2-AC06: pusta lista pokazuje tekst T2-R07                                  
  T2-AC07: obie strony używają tego samego elementu stronicowania, nq3 T1-AC07
  nadal przechodzi                                                            
  T2-AC08: szczegóły aplikacji pokazują tytuł, firmę, widełki, pole etapu,    
  notatkę, historię od najnowszej i link Otwórz ofertę                        
  T2-AC09: wybór w szczegółach pokazuje nowy etap i wpis historii; z          
  nieaktualnych szczegółów komunikat A-R07                                    
  T2-AC10: szczegóły oferty z aplikacją (także Zdjęta z listy) mają link      
  Szczegóły aplikacji, oferta bez aplikacji go nie ma                         



LABELS: ready-for-agent

METADATA
  prd: docs/specs/lq3-lista-aplikacji/PRD.md
  requirements: docs/specs/lq3-lista-aplikacji/requirements.md#t2--the-page-moja-lista-and-the-application-details
  sd: docs/specs/lq3-lista-aplikacji/solution-design.md

PARENT
  ↑ ○ oferty-pracy-lq3: (EPIC) Lista aplikacji: zapisywanie ofert, wysłanie CV i odrzucenie P2

DEPENDS ON
  → ○ oferty-pracy-lq3.1: Aplikacja w szczegółach oferty: moduł Rekrutacje, etapy i przejścia P2
  → ◐ oferty-pracy-nq3.1: Historia synchronizacji w panelu P2


---

○ oferty-pracy-lq3.3 · Etap aplikacji na liście ofert: ikonka i filtr   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: feature
Created: 2026-11-26 · Updated: 2026-11-26
Spec: docs/specs/lq3-lista-aplikacji/requirements.md#t3--the-stage-on-the-offer-list

DESCRIPTION

  Lista ofert pokazuje ikonkę etapu przy ofertach z aplikacją i ma filtr etapu
  z wielokrotnym wyborem wzorem panelu synchronizacji.                        



ACCEPTANCE CRITERIA

  T3-AC01: ikonki dla Do rozważenia, CV wysłane, Odrzucone; brak dla ofert bez
  aplikacji i Zdjęta z listy; brak pola etapu                                 
  T3-AC02: każdy wybór filtra pokazuje dokładnie swoje oferty; brak wyboru to 
  wszystkie; Bez aplikacji pomija Zdjęte z listy                              
  T3-AC03: filtr etapu łączy się z innymi; liczba wyników i stron wynika z    
  przefiltrowanej listy                                                       
  T3-AC04: adres z dwoma etapami i nieznanym pokazuje dwa wybrane bez błędu   
  T3-AC05: odczyt listy ofert wykonuje tyle samo zapytań przy 0, 1 i 50       
  aplikacjach                                                                 



LABELS: ready-for-agent

METADATA
  prd: docs/specs/lq3-lista-aplikacji/PRD.md
  requirements: docs/specs/lq3-lista-aplikacji/requirements.md#t3--the-stage-on-the-offer-list
  sd: docs/specs/lq3-lista-aplikacji/solution-design.md

PARENT
  ↑ ○ oferty-pracy-lq3: (EPIC) Lista aplikacji: zapisywanie ofert, wysłanie CV i odrzucenie P2

DEPENDS ON
  → ○ oferty-pracy-lq3.1: Aplikacja w szczegółach oferty: moduł Rekrutacje, etapy i przejścia P2
  → ◐ oferty-pracy-nq3.1: Historia synchronizacji w panelu P2


---


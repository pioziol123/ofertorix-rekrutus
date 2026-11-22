# Epic oferty-pracy-nq3 and its tickets (bd export, 2026-11-22)

---

○ oferty-pracy-nq3 [EPIC] · Panel synchronizacji ogłoszeń   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: epic
Created: 2026-11-21 · Updated: 2026-11-21
Spec: docs/specs/nq3-panel-synchronizacji/PRD.md

DESCRIPTION

  Osobny panel do uruchamiania synchronizacji ogłoszeń dowolnego źródła z     
  przeglądarki i śledzenia ich stanu i wyniku; informacje o synchronizacjach  
  znikają z listy ofert. Zakres ustalony z właścicielem 2026-11-21/22 na      
  makiecie docs/prototypes/synchronizacje (wariant C).                        



CHILDREN
  ↳ ○ oferty-pracy-nq3.4: Zdrowie źródeł w pasku podsumowania panelu synchronizacji P2
  ↳ ○ oferty-pracy-nq3.5: Lista ofert bez informacji o synchronizacjach P2
  ↳ ○ oferty-pracy-nq3.3: Uruchamianie synchronizacji z panelu P2
  ↳ ○ oferty-pracy-nq3.1: Historia synchronizacji w panelu P2
  ↳ ○ oferty-pracy-nq3.2: Liczba ogłoszeń oznaczonych jako niedostępne w wyniku synchronizacji P2
  ◐ 0/5 complete (0%)


---

○ oferty-pracy-nq3.1 · Historia synchronizacji w panelu   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-21 · Updated: 2026-11-21
Spec: docs/specs/nq3-panel-synchronizacji/requirements.md

DESCRIPTION

  Strona „Synchronizacje”: lista wszystkich synchronizacji z wynikiem (nowe,  
  zmienione), filtry, strony i szczegóły w szufladzie; liczba nowych ogłoszeń 
  zapisywana przy kończeniu synchronizacji i przeliczona wstecz. Zakres:      
  sekcja T1 wymagań i projektu.                                               



ACCEPTANCE CRITERIA

  PS-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  PS-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T1-AC01: The navigation of each page with navigation has a link             
  "Synchronizacje" that opens the page.                                       
  T1-AC02: With stored syncs of several sources, both triggers and every      
  state, the page lists all of them from the most recently requested, grouped 
  by day, each row with time, source, result and state label and with no      
  trigger or scope.                                                           
  T1-AC03: For a sync whose ads include some this source showed in an earlier 
  sync and some it never showed, *new* counts only the latter, and *changed*  
  equals new content versions minus new, never below zero; this holds for     
  syncs stored before the task.                                               
  T1-AC04: A queued sync shows "Czeka na start"; a running one the ads found  
  so far; a finished sync of a source that infers unavailability "—           
  niedostępne"; a source that does not shows no unavailable count.            
  T1-AC05: Each state shows its icon, and hovering or focusing the label shows
  its meaning in a tooltip at least 16 px from the window's edges, also for a 
  label at the right edge.                                                    
  T1-AC06: Each filter narrows the list as T1-R08 says, the multi-choice lists
  apply on closing, the default is the last 7 days, and "Wyczyść filtry"      
  appears only off the default and restores it; a changed filter shows page 1.
  T1-AC07: Paging moves between pages; 10, 20, 50 and 100 per page work, 20 is
  the default, a change shows page 1, and "Wyczyść filtry" keeps it; the page 
  list filters by typed digits, Backspace restores the previous list, Enter   
  opens the first page shown.                                                 
  T1-AC08: Reloading an address with filters, page, number per page and an    
  open sync shows the same view; an address naming a missing sync shows the   
  list without details.                                                       
  T1-AC09: With no matching sync the page says so.                            
  T1-AC10: The details show the trigger icon with its tooltip, state, the four
  numbers ("nie dotyczy" for a source that does not infer unavailability), the
  course without an attempt number, and for Niepełna and Nieudana the generic 
  sentence with the stored error and diagnostics folded below; Escape closes  
  them.                                                                       
  T1-AC11: An address with an unknown source, an unknown state, 30 per page   
  and page 999 shows the default for each unknown value, 20 per page and the  
  last page, without an error.                                                
  T1-AC12: The details of a queued or running sync show "—" for new and       
  changed.                                                                    



METADATA
  prd: docs/specs/nq3-panel-synchronizacji/PRD.md
  requirements: docs/specs/nq3-panel-synchronizacji/requirements.md#t1
  sd: docs/specs/nq3-panel-synchronizacji/solution-design.md#t1

PARENT
  ↑ ○ oferty-pracy-nq3: (EPIC) Panel synchronizacji ogłoszeń P2

BLOCKS
  ← ○ oferty-pracy-nq3.2: Liczba ogłoszeń oznaczonych jako niedostępne w wyniku synchronizacji P2
  ← ○ oferty-pracy-nq3.3: Uruchamianie synchronizacji z panelu P2
  ← ○ oferty-pracy-nq3.4: Zdrowie źródeł w pasku podsumowania panelu synchronizacji P2


---

○ oferty-pracy-nq3.2 · Liczba ogłoszeń oznaczonych jako niedostępne w wyniku synchronizacji   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-21 · Updated: 2026-11-21
Spec: docs/specs/nq3-panel-synchronizacji/requirements.md

DESCRIPTION

  Pełna synchronizacja źródła, które wnioskuje niedostępność z braku          
  ogłoszenia, zapisuje, ile ogłoszeń oznaczyła jako niedostępne; panel        
  pokazuje tę liczbę albo „—” z wyjaśnieniem. Zakres: sekcja T2 wymagań i     
  projektu.                                                                   



ACCEPTANCE CRITERIA

  PS-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  PS-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T2-AC01: A complete sync of such a source that misses two available ads and 
  one ad already unavailable records 2, and the row and details show "2       
  niedostępne".                                                               
  T2-AC02: A complete sync that misses no ad records 0 and shows "0           
  niedostępnych".                                                             
  T2-AC03: An incomplete and a failed sync of such a source mark nothing and  
  show "—" with the tooltip of T2-R03.                                        
  T2-AC04: A sync finished before the task shows "—" with the tooltip of T2-  
  R04.                                                                        
  T2-AC05: When saving the final state fails, neither the marking nor the     
  count is saved.                                                             



METADATA
  prd: docs/specs/nq3-panel-synchronizacji/PRD.md
  requirements: docs/specs/nq3-panel-synchronizacji/requirements.md#t2
  sd: docs/specs/nq3-panel-synchronizacji/solution-design.md#t2

PARENT
  ↑ ○ oferty-pracy-nq3: (EPIC) Panel synchronizacji ogłoszeń P2

DEPENDS ON
  → ○ oferty-pracy-nq3.1: Historia synchronizacji w panelu P2


---

○ oferty-pracy-nq3.3 · Uruchamianie synchronizacji z panelu   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-22 · Updated: 2026-11-22
Spec: docs/specs/nq3-panel-synchronizacji/PRD.md

DESCRIPTION

  Zlecanie synchronizacji jednego, kilku lub wszystkich włączonych źródeł ze  
  strony Synchronizacje, ze stałym zakresem PHP · senior, oraz „Uruchom       
  ponownie” w szczegółach. Dokumenty: requirements#t3, solution-design#t3.    



ACCEPTANCE CRITERIA

  PS-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  PS-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T3-AC01: "Synchronizuj wszystkie" opens the dialog with every enabled source
  without an unfinished sync checked; "Wybierz źródła" with none checked and  
  the confirming button inactive until one is.                                
  T3-AC02: In the dialog a source with an unfinished sync shows "już trwa" and
  a disabled source its reason; neither can be checked.                       
  T3-AC03: A sync requested from the panel, for any source, searches PHP ·    
  senior and is manual; a Polish portal keeps its limits.                     
  T3-AC04: Requesting a source that already has an unfinished sync, including 
  one started after the dialog opened, creates no new sync and counts it as   
  "już trwało".                                                               
  T3-AC05: A checked source disabled before confirming, and a source id the   
  catalogue does not know, are skipped and counted as skipped, without an     
  error.                                                                      
  T3-AC06: When the queue refuses one of three requests, the page shows the   
  message of T3-R06 with N = 1, and the other two syncs exist.                
  T3-AC07: After confirming, the page shows the summary of T3-R07, the list   
  reloads once with the state filter W kolejce and W toku.                    
  T3-AC08: "Uruchom ponownie" in a finished sync's details opens the details  
  of a new queued sync of that source; with an unfinished sync of that source 
  it opens that sync; it is absent for a queued or running sync and for a     
  disabled source.                                                            
  T3-AC09: Starting from the command line and the daily SOLID.Jobs schedule   
  still request syncs.                                                        



METADATA
  prd: docs/specs/nq3-panel-synchronizacji/PRD.md
  requirements: docs/specs/nq3-panel-synchronizacji/requirements.md#t3
  sd: docs/specs/nq3-panel-synchronizacji/solution-design.md#t3

PARENT
  ↑ ○ oferty-pracy-nq3: (EPIC) Panel synchronizacji ogłoszeń P2

DEPENDS ON
  → ○ oferty-pracy-nq3.1: Historia synchronizacji w panelu P2

BLOCKS
  ← ○ oferty-pracy-nq3.5: Lista ofert bez informacji o synchronizacjach P2
  ← ○ oferty-pracy-nq3.4: Zdrowie źródeł w pasku podsumowania panelu synchronizacji P2


---

○ oferty-pracy-nq3.4 · Zdrowie źródeł w pasku podsumowania panelu synchronizacji   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-22 · Updated: 2026-11-22
Spec: docs/specs/nq3-panel-synchronizacji/PRD.md

DESCRIPTION

  Pasek: W toku, Wymaga uwagi, Nowe w 24 h (nieklikalne) i ostrzeżenie o      
  źródłach bez pełnej synchronizacji od 3 dni lub z 3 nieudanymi z rzędu.     
  Dokumenty: requirements#t4, solution-design#t4.                             



ACCEPTANCE CRITERIA

  PS-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  PS-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T4-AC01: With two queued and one running sync, "W toku" shows 3; it is not  
  clickable.                                                                  
  T4-AC02: With one source whose latest finished sync is Nieudana after two   
  earlier Nieudana, another whose latest is Niepełna, and a disabled source   
  whose latest is Nieudana, "Wymaga uwagi" shows 2; it is not clickable.      
  T4-AC03: "Nowe w 24 h" sums new ads of syncs finished within 24 hours and   
  leaves out one finished 25 hours ago.                                       
  T4-AC04: A source with its latest complete sync 73 hours ago and one with   
  none are listed, the latter with "nigdy"; one with a complete sync 71 hours 
  ago is not; a disabled source is never listed.                              
  T4-AC05: A source with three Nieudana in a row is listed; one with Nieudana,
  Niepełna, Nieudana is not; a source meeting both conditions appears once    
  with both reasons.                                                          
  T4-AC06: With five sources to list, three names and "i 2 innych" show, and a
  click expands the list; a click on a name filters the history to it; with   
  none, no warning shows.                                                     
  T4-AC07: Changing the history's filters does not change the strip;          
  confirming a request reloads it.                                            



METADATA
  prd: docs/specs/nq3-panel-synchronizacji/PRD.md
  requirements: docs/specs/nq3-panel-synchronizacji/requirements.md#t4
  sd: docs/specs/nq3-panel-synchronizacji/solution-design.md#t4

PARENT
  ↑ ○ oferty-pracy-nq3: (EPIC) Panel synchronizacji ogłoszeń P2

DEPENDS ON
  → ○ oferty-pracy-nq3.3: Uruchamianie synchronizacji z panelu P2
  → ○ oferty-pracy-nq3.1: Historia synchronizacji w panelu P2


---

○ oferty-pracy-nq3.5 · Lista ofert bez informacji o synchronizacjach   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-22 · Updated: 2026-11-22
Spec: docs/specs/nq3-panel-synchronizacji/PRD.md

DESCRIPTION

  Usunięcie z listy ofert podsumowania SOLID.Jobs, komunikatu o niepełnym     
  imporcie, sekcji JobSpy i polskich serwisów z formularzem, adresów stanu i  
  zlecania z przeglądarki oraz samoczynnego odświeżania. Dokumenty:           
  requirements#t5, solution-design#t5.                                        



ACCEPTANCE CRITERIA

  PS-AC01: All of the project's automated quality checks pass: code rules and 
  formatting, types, the application build, and automated tests including the 
  tests on a real database.                                                   
  PS-AC02: Code created or moved in the task belongs to the module that owns  
  its data and rules, and uses modules only through their public operations,  
  in line with the architecture rules /architecture/moduly-i-zasady-kodu.md.  
  T5-AC01: The offer list shows none of: the SOLID.Jobs summary, the          
  incomplete-import notice, "Źródła JobSpy", "Polskie serwisy — pobieranie    
  ofert"; "Odśwież widok" reloads the offers.                                 
  T5-AC02: A request of a Polish portal's sync sent the way the removed form  
  sent it is refused and creates no sync.                                     
  T5-AC03: With an AI assessment waiting, the offer list does not reload      
  within 30 seconds.                                                          
  T5-AC04: The availability filter, the "Niedostępna w źródle" label, the     
  source of an offer and "Otwórz w … ↗" still work.                           
  T5-AC05: A Polish portal started from the command line still syncs.         



METADATA
  prd: docs/specs/nq3-panel-synchronizacji/PRD.md
  requirements: docs/specs/nq3-panel-synchronizacji/requirements.md#t5
  sd: docs/specs/nq3-panel-synchronizacji/solution-design.md#t5

PARENT
  ↑ ○ oferty-pracy-nq3: (EPIC) Panel synchronizacji ogłoszeń P2

DEPENDS ON
  → ○ oferty-pracy-nq3.3: Uruchamianie synchronizacji z panelu P2


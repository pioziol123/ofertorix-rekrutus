# Related Beads issues

○ oferty-pracy-334.2 · Wydzielić wspólną konfigurację i budżet AI   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-04 · Updated: 2026-11-05
Spec: docs/specs/lokalne-ai/etapy/01-konfiguracja-budzet/requirements.md

DESCRIPTION

  Wydzielić istniejącą konfigurację i budżet z lib/profile/ai.ts bez zmiany   
  zachowania. Właściciele: lib/ai/configuration.ts dla                        
  AiConfiguration/aiConfiguration, lib/ai/budget.ts dla                       
  chargeCeiling/budgetMonth/reserve oraz wewnętrzny lib/ai/money.ts dla       
  współdzielonego parsera i arytmetyki. Przełączyć wszystkich konsumentów, w  
  tym lib/matching/list.ts i fixtures typów; wspólne symbole nie pozostają re-
  eksportowane z profilu. reserve tylko sprawdza dostępność pod blokadą; zapis
  próby i kolejki pozostaje w transakcji wywołującego. Bez migracji, nowych   
  env, Ollamy, zmian adaptera i polityki retry. Kanoniczna para:              
  docs/specs/lokalne-ai/etapy/01-konfiguracja-budzet/requirements.md i        
  solution-design.md po przeglądzie2026-11-05. Przed kodowaniem odświeżyć     
  lokalne zmiany i bazowe wyniki sprawdzeń. To przygotowane zadanie           
  implementacyjne, nie wykonany refaktor.                                     



DESIGN

  docs/specs/lokalne-ai/etapy/01-konfiguracja-budzet/solution-design.md:      
  kontrakty po przeglądzie O-L4 z2026-11-05; pełna lista konsumentów,         
  niezmieniony format konfiguracji i kwot, wspólny parser bez cyklu           
  zależności, transakcja wywołującego reserve i mapowanie testów. Brak        
  nierozstrzygniętej materialnej decyzji etapu1; późniejsze bramki T01–T05 nie
  blokują wydzielenia.                                                        



NOTES

  Przygotowanie specyfikacji zlecone przez właściciela w bieżącej rozmowie.   
  Przegląd O-L4 wykonany w334.19; bez zmian zachowania produktu. Gotowość     
  dotyczy rozpoczęcia implementacji, nie jej ukończenia. Weryfikacja tej sesji
  obejmuje dokumenty; testy aplikacji nie były uruchamiane.                   



ACCEPTANCE CRITERIA

  E01-AC01: identyczny strict odczyt trzech konfiguracji i bezpośrednie       
  importy wspólnych właścicieli. E01-AC02: identyczne kwoty, zaokrąglenia,    
  opłaty researchu oraz błędy użycia. E01-AC03: atomowy wspólny budżet,       
  rollback kolejki, all-or-none grup, zachowane rezerwy unknown i miesiąc     
  próby. E01-AC04: regresje profilu, ocen, grup, listy i researchu; bez zmian 
  payloadów, stanów, historii i publikacji. Konkretne testy i polecenia w SD; 
  wymagane pnpm check, build i integracje RUN_INTEGRATION=1 na izolowanych    
  schematach. Nie oznaczać testów pominiętych lub zablokowanych jako PASS.    



LABELS: ready-for-agent

PARENT
  ↑ ○ oferty-pracy-334: (EPIC) Oddzielić wykonanie AI i wdrożyć gpt-oss:20b oraz agenta OpenCode P2

BLOCKS
  ← ○ oferty-pracy-334.3: Oddzielić profil od protokołu OpenAI P2
  ← ○ oferty-pracy-334.4: Oddzielić oceny i grupy zleceń od OpenAI Batch P2
  ← ○ oferty-pracy-334.5: Oddzielić research od wykonawcy OpenAI P2


────────────────────────────────────────────────────────────

○ oferty-pracy-334.3 · Oddzielić profil od protokołu OpenAI   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-04 · Updated: 2026-11-05
Spec: docs/specs/lokalne-ai/etapy/02-profil-adapter/requirements.md

DESCRIPTION

  Profil zależy od StructuredModel, z gotowym JSON Schema i wstrzykiwaniem.   
  Adapter normalizuje treść, usage/ID i typowane błędy; przywraca zgodne retry
  OpenAI i Retry-After względem HEAD. Nie przekazuje surowego Responses do    
  domeny. Zachować zatwierdzanie propozycji, ceny i stare migawki. Bez        
  migracji/Ollamy w tym etapie. Kanoniczne dokumenty: docs/specs/lokalne-     
  ai/etapy/02-profil-adapter/requirements.md i solution-design.md. Przegląd   
  wykonawczy 2026-11-05 w334.20; gotowa specyfikacja, nie ukończona           
  implementacja.                                                              



DESIGN

  docs/specs/lokalne-ai/etapy/02-profil-adapter/solution-design.md — kontrakty
  po przeglądzie aktualnego kodu; wspólne zasady w docs/specs/lokalne-        
  ai/kontrakty-runtime.md. Przed kodem odświeżyć zastane zmiany i wyniki      
  wcześniejszych etapów. Techniczne bramki są częścią realizacji, nie         
  domniemanym sukcesem.                                                       



NOTES

  Gotowość specyfikacji po przygotowaniu334.20; status pozostaje open.        
  Zależności Beads nadal blokują start. Sesja przygotowania nie zmienia kodu i
  nie uruchamia usług/testów aplikacji.                                       



ACCEPTANCE CRITERIA

  E02-AC01–04 zgodnie z kanoniczną parą. Każde kryterium ma mapowanie na      
  weryfikację w SD. Wymagane check/build i adekwatne integracje               
  RUN_INTEGRATION=1 na izolowanych schematach; zapisać dowody i ograniczenia. 
  Zastanych zmian nie usuwać. Testów zablokowanych/pominiętych nie oznaczać   
  PASS.                                                                       



LABELS: ready-for-agent

PARENT
  ↑ ○ oferty-pracy-334: (EPIC) Oddzielić wykonanie AI i wdrożyć gpt-oss:20b oraz agenta OpenCode P2

DEPENDS ON
  → ○ oferty-pracy-334.2: Wydzielić wspólną konfigurację i budżet AI P2

BLOCKS
  ← ○ oferty-pracy-334.6: Dodać Ollamę gpt-oss:20b i uruchomić lokalny profil P2


────────────────────────────────────────────────────────────

○ oferty-pracy-334.4 · Oddzielić oceny i grupy zleceń od OpenAI Batch   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-04 · Updated: 2026-11-05
Spec: docs/specs/lokalne-ai/etapy/03-oceny-batch/requirements.md

DESCRIPTION

  Wydzielić MatchingTask i neutralny wynik oraz walidację/publikację ocen od  
  protokołu Batch. Publikacja pod blokadą request, wspólna z rozliczeniem, bez
  duplikacji rewizji. Zachować custom_id, zero/unknown koszt, out-of-order,   
  finansowanie i archiwum group_id ?? request.id. Bez migracji i lokalnego    
  wykonania. Kanoniczne dokumenty: docs/specs/lokalne-ai/etapy/03-oceny-      
  batch/requirements.md i solution-design.md. Przegląd wykonawczy 2026-11-05  
  w334.20; gotowa specyfikacja, nie ukończona implementacja.                  



DESIGN

  docs/specs/lokalne-ai/etapy/03-oceny-batch/solution-design.md — kontrakty po
  przeglądzie aktualnego kodu; wspólne zasady w docs/specs/lokalne-           
  ai/kontrakty-runtime.md. Przed kodem odświeżyć zastane zmiany i wyniki      
  wcześniejszych etapów. Techniczne bramki są częścią realizacji, nie         
  domniemanym sukcesem.                                                       



NOTES

  Gotowość specyfikacji po przygotowaniu334.20; status pozostaje open.        
  Zależności Beads nadal blokują start. Sesja przygotowania nie zmienia kodu i
  nie uruchamia usług/testów aplikacji.                                       



ACCEPTANCE CRITERIA

  E03-AC01–05 zgodnie z kanoniczną parą. Każde kryterium ma mapowanie na      
  weryfikację w SD. Wymagane check/build i adekwatne integracje               
  RUN_INTEGRATION=1 na izolowanych schematach; zapisać dowody i ograniczenia. 
  Zastanych zmian nie usuwać. Testów zablokowanych/pominiętych nie oznaczać   
  PASS.                                                                       



LABELS: ready-for-agent

PARENT
  ↑ ○ oferty-pracy-334: (EPIC) Oddzielić wykonanie AI i wdrożyć gpt-oss:20b oraz agenta OpenCode P2

DEPENDS ON
  → ○ oferty-pracy-334.2: Wydzielić wspólną konfigurację i budżet AI P2

BLOCKS
  ← ○ oferty-pracy-334.7: Wdrożyć lokalne oceny przez gpt-oss:20b P2


────────────────────────────────────────────────────────────

○ oferty-pracy-334.5 · Oddzielić research od wykonawcy OpenAI   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-04 · Updated: 2026-11-05
Spec: docs/specs/lokalne-ai/etapy/04-research-wykonawca/requirements.md

DESCRIPTION

  Wstrzykiwany ResearchExecutor wykonuje obecny search i syntezę OpenAI.      
  Zwraca draft/evidence/accounting także po błędzie; koordynator waliduje i   
  publikuje. Zachować zagregowane zaokrąglenia, koszt search po błędzie       
  syntezy i checkpoint przed kolejnym HTTP. Bez OpenCode i zmiany zachowania  
  domeny. Kanoniczne dokumenty: docs/specs/lokalne-ai/etapy/04-research-      
  wykonawca/requirements.md i solution-design.md. Przegląd wykonawczy 2026-11-
  05 w334.20; gotowa specyfikacja, nie ukończona implementacja.               



DESIGN

  docs/specs/lokalne-ai/etapy/04-research-wykonawca/solution-design.md —      
  kontrakty po przeglądzie aktualnego kodu; wspólne zasady w                  
  docs/specs/lokalne-ai/kontrakty-runtime.md. Przed kodem odświeżyć zastane   
  zmiany i wyniki wcześniejszych etapów. Techniczne bramki są częścią         
  realizacji, nie domniemanym sukcesem.                                       



NOTES

  Gotowość specyfikacji po przygotowaniu334.20; status pozostaje open.        
  Zależności Beads nadal blokują start. Sesja przygotowania nie zmienia kodu i
  nie uruchamia usług/testów aplikacji.                                       



ACCEPTANCE CRITERIA

  E04-AC01–04 zgodnie z kanoniczną parą. Każde kryterium ma mapowanie na      
  weryfikację w SD. Wymagane check/build i adekwatne integracje               
  RUN_INTEGRATION=1 na izolowanych schematach; zapisać dowody i ograniczenia. 
  Zastanych zmian nie usuwać. Testów zablokowanych/pominiętych nie oznaczać   
  PASS.                                                                       



LABELS: ready-for-agent

PARENT
  ↑ ○ oferty-pracy-334: (EPIC) Oddzielić wykonanie AI i wdrożyć gpt-oss:20b oraz agenta OpenCode P2

DEPENDS ON
  → ○ oferty-pracy-334.2: Wydzielić wspólną konfigurację i budżet AI P2

BLOCKS
  ← ○ oferty-pracy-334.9: Zintegrować OpenCode z gpt-oss:20b jako agenta researchu P2


────────────────────────────────────────────────────────────

○ oferty-pracy-334.6 · Dodać Ollamę gpt-oss:20b i uruchomić lokalny profil   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-04 · Updated: 2026-11-05
Spec: docs/specs/lokalne-ai/etapy/05-ollama-profil/requirements.md

DESCRIPTION

  Natywny adapter Ollamy i lokalny profil gpt-oss:20b. Wdrożyć strict         
  konfigurację v1, wersjonowane endpointy, niezmienne wejście/prompt/schema,  
  model digest, done_reason i ochronę przed cichym przycięciem kontekstu. W   
  tym etapie powstaje wspólny moduł operacji, trwałe                          
  execution/queue/slot/journal/komendy i token publikacji dla wszystkich      
  lokalnych rodzajów. Wymagane addytywne migracje; zachować CHECK płatnych    
  prób przez nową generation per lokalne ręczne retry. Koszt lokalny0 bez     
  płatnego salda, bez automatycznej naprawy/generacji po błędzie. Kanoniczne  
  dokumenty: docs/specs/lokalne-ai/etapy/05-ollama-profil/requirements.md i   
  solution-design.md. Przegląd wykonawczy 2026-11-05 w334.20; gotowa          
  specyfikacja, nie ukończona implementacja.                                  



DESIGN

  docs/specs/lokalne-ai/etapy/05-ollama-profil/solution-design.md — kontrakty 
  po przeglądzie aktualnego kodu; wspólne zasady w docs/specs/lokalne-        
  ai/kontrakty-runtime.md. Przed kodem odświeżyć zastane zmiany i wyniki      
  wcześniejszych etapów. Techniczne bramki są częścią realizacji, nie         
  domniemanym sukcesem.                                                       



NOTES

  Gotowość specyfikacji po przygotowaniu334.20; status pozostaje open.        
  Zależności Beads nadal blokują start. Sesja przygotowania nie zmienia kodu i
  nie uruchamia usług/testów aplikacji.                                       



ACCEPTANCE CRITERIA

  E05-AC01–06 zgodnie z kanoniczną parą. Każde kryterium ma mapowanie na      
  weryfikację w SD. Wymagane check/build i adekwatne integracje               
  RUN_INTEGRATION=1 na izolowanych schematach; zapisać dowody i ograniczenia. 
  Zastanych zmian nie usuwać. Testów zablokowanych/pominiętych nie oznaczać   
  PASS.                                                                       



LABELS: ready-for-agent

PARENT
  ↑ ○ oferty-pracy-334: (EPIC) Oddzielić wykonanie AI i wdrożyć gpt-oss:20b oraz agenta OpenCode P2

DEPENDS ON
  → ○ oferty-pracy-334.3: Oddzielić profil od protokołu OpenAI P2

BLOCKS
  ← ○ oferty-pracy-334.7: Wdrożyć lokalne oceny przez gpt-oss:20b P2
  ← ○ oferty-pracy-334.8: Zintegrować narzędzia wyszukiwania i odczytu dla OpenCode P2
  ← ○ oferty-pracy-334.9: Zintegrować OpenCode z gpt-oss:20b jako agenta researchu P2

COMMENTS
  2026-11-11 13:42 Piotr Ziółkowski
    
      Naprawy 334.23–29 dostarczyły testowaną lokalną ścieżkę profilu, niezmienne 
      migawki i trwały slot dla direct Ollama. Do odbioru etapu pozostają         
      techniczne próby realnego runtime z workera, obsługa operatorskiego         
      potwierdzenia końca unknown i pozostałe kryteria 334.6. Retry istnieje jako 
      polecenie domenowe do podłączenia w panelu 334.15. Weryfikacja na atrapach  
      HTTP i izolowanej bazie: check/build PASS, 587 testów PASS.                 


────────────────────────────────────────────────────────────

○ oferty-pracy-slu · Ocenić wspólny moduł zlecania synchronizacji źródeł   [P3 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-05 · Updated: 2026-11-05

DESCRIPTION

  Kandydat z przeglądu codebase-design oferty-pracy-ijo:                      
  lib/sources/sync.ts:28, polish-sync.ts:56 i jobspy-sync.ts:57 powtarzają    
  transakcyjny protokół tworzenia przebiegu i pracy pg-boss. Przed kolejnym   
  importerem ocenić mały interfejs ukrywający ten protokół. Zachować różnice  
  deduplikacji po zakresie/źródle, harmonogram SOLID i reguły pełnej/niepełnej
  synchronizacji. To zadanie oceny projektu, bez zatwierdzonej implementacji. 
  Dowody i ograniczenia: docs/research/przeglad-architektury-codebase-design- 
  2026-11-05.md.                                                              



ACCEPTANCE CRITERIA

  Porównanie pozostawienia obecnego kodu i wspólnego modułu; propozycja małego
  interfejsu bez callbacków ujawniających cały protokół SQL; wykazanie        
  zachowania deduplikacji, atomowości kolejki i harmonogramu; decyzja o       
  realizacji przed zmianą kodu.                                               



LABELS: needs-triage


# Architektura Ofert pracy w modelu C4

Oferty pracy to prywatny system jednego właściciela. Zbiera ogłoszenia źródłowe, umożliwia ich przeglądanie i ocenę dopasowania do profilu zawodowego oraz gromadzi informacje o firmach. Diagramy opisują bieżący kod i konfigurację lokalnego Compose, odczytane 11 listopada 2026. Linie przerywane oznaczają ścieżki dostępne po dodatkowej konfiguracji. Strzałki wskazują inicjatora interakcji. [Model C4](https://c4model.com/diagrams)

- [C1 — kontekst systemu](#c1-kontekst-systemu)
- [C2 — kontenery](#c2-kontenery)
- [C3 — komponenty web i workera](#c3-komponenty)
- [C4 — kod przygotowania propozycji profilu](#c4-kod-przygotowanie-propozycji-profilu)
- [Stan lokalnego AI](#stan-lokalnego-ai)

<a id="c1-kontekst-systemu"></a>

## C1 — kontekst systemu

```mermaid
flowchart LR
  Owner(["Właściciel<br/>[Osoba]"])
  System["Oferty pracy<br/>[System]<br/>Gromadzi ogłoszenia, profil zawodowy,<br/>oceny dopasowania i research pracodawców"]
  Boards["Portale z ofertami pracy<br/>[Systemy zewnętrzne]"]
  OpenAI["OpenAI<br/>[System zewnętrzny]"]
  Ollama["Ollama<br/>[System zewnętrzny wobec aplikacji]"]

  Owner -->|"Przegląda oferty i firmy, zarządza profilem, zleca operacje"| System
  System -->|"Pobiera listy i szczegóły ogłoszeń"| Boards
  System -.->|"Zleca propozycje profilu, oceny i research"| OpenAI
  System -.->|"Sprawdza dostępność modelu i generuje propozycję profilu"| Ollama

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class System internal
  class Owner,Boards,OpenAI,Ollama external
```

Wspólna granica portali obejmuje SOLID.Jobs, Bulldogjob, theprotocol.it, Just Join IT, No Fluff Jobs, portale obsługiwane przez JobSpy oraz osobny pilot Himalayas. Zakres importu i sposób uruchomienia zależą od adaptera. Research podstawowy korzysta z wyszukiwania WWW przez OpenAI. Wynik trafia do profilu firmy ze źródłami. [Katalog JobSpy](../../lib/sources/jobspy-catalog.ts) · [Katalog polskich źródeł](../../lib/sources/polish-catalog.ts) · [Pilot Himalayas](../../scripts/himalayas-sync.ts) · [Dostawca researchu](../../lib/companies/research-provider.ts)

<a id="c2-kontenery"></a>

## C2 — kontenery

```mermaid
flowchart LR
  Owner(["Właściciel<br/>[Osoba]"])
  Boards["Portale z ofertami<br/>[Systemy zewnętrzne]"]
  OpenAI["OpenAI<br/>[System zewnętrzny]"]
  Ollama["Ollama<br/>[System zewnętrzny]"]

  subgraph System["Oferty pracy"]
    Web["Aplikacja webowa<br/>[Nuxt / Vue / Nitro, TypeScript]<br/>Dostarcza UI i HTTP API"]
    Worker["Worker<br/>[Node.js, TypeScript, Python]<br/>Obsługuje zadania i harmonogram"]
    CLI["Narzędzia CLI<br/>[Node.js, TypeScript]<br/>Ręczne importy i odczyt statusu"]
    DB[("PostgreSQL<br/>[Magazyn danych]<br/>Dane aplikacji i kolejki pg-boss")]
    Files[("Dokumenty CV<br/>[Wolumen plików]<br/>Oryginały PDF / DOCX")]
  end

  Owner -->|"Korzysta z UI przez przeglądarkę, HTTP na loopback"| Web
  Owner -->|"Uruchamia polecenia pnpm przez Compose"| CLI
  Web -->|"Czyta i zapisuje dane, zleca zadania przez pg-boss"| DB
  Worker -->|"Odbiera zadania przez pg-boss i zapisuje wyniki"| DB
  CLI -->|"Zleca importy, czyta statusy, zapisuje wyniki pilota"| DB
  Web -->|"Zapisuje i udostępnia oryginały CV"| Files
  Worker -->|"Czyta pliki do ekstrakcji tekstu"| Files
  Worker -->|"Pobiera ogłoszenia przez HTTP(S)"| Boards
  CLI -->|"Pobiera oferty Himalayas przez HTTPS"| Boards
  Worker -.->|"Wywołuje Responses, Files i Batch API przez HTTPS"| OpenAI
  Web -.->|"Sprawdza model przez HTTP(S)"| Ollama
  Worker -.->|"Generuje propozycję profilu przez HTTP(S)"| Ollama

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class Web,Worker,CLI,DB,Files internal
  class Owner,Boards,OpenAI,Ollama external
```

Nuxt dostarcza kod Vue uruchamiany w przeglądarce i obsługuje trasy Nitro w tej samej aplikacji webowej. Compose publikuje jej port na `127.0.0.1`. PostgreSQL działa w sieci Compose. Biblioteki `pg` i `pg-boss` korzystają z PostgreSQL, a zadania pg-boss mają domyślny schemat `pgboss`. Osobna usługa `migrate` przy starcie przygotowuje schemat aplikacji i kolejki przed uruchomieniem web i workera. [Compose](../../compose.yaml) · [Konfiguracja Nuxt](../../nuxt.config.ts) · [Połączenie z bazą](../../lib/db.ts) · [Kolejka](../../lib/queue.ts) · [Inicjalizacja kolejek](../../scripts/init-queue.ts)

Wolumen `documents` jest współdzielony przez web i workera pod `/data/documents`. Baza przechowuje metadane importu, wydobyty tekst, wersje profilu i wyniki operacji. Podprocesy Python służą jako adaptery uruchamiane przez workera. Skrypt Himalayas wykonuje import bezpośrednio z CLI. [Import CV](../../lib/profile/imports.ts) · [Obraz workera](../../Dockerfile) · [Polecenia](../../package.json)

<a id="c3-komponenty"></a>

## C3 — komponenty

### Aplikacja webowa

```mermaid
flowchart TB
  Owner(["Właściciel<br/>[Osoba]"])
  DB[("PostgreSQL<br/>[Kontener]")]
  Files[("Dokumenty CV<br/>[Kontener]")]
  Ollama["Ollama<br/>[System zewnętrzny]"]

  subgraph Web["Aplikacja webowa · Nuxt"]
    UI["Widoki Vue<br/>[Vue / Nuxt UI]<br/>Oferty, profil i firmy"]
    Offers["Oferty i dopasowanie<br/>[Trasy Nitro + moduły TypeScript]<br/>Lista, filtry, historia ocen, zlecenia"]
    Profile["Profil zawodowy<br/>[Trasy Nitro + moduły TypeScript]<br/>Szkic, wersje, import CV, propozycja AI"]
    Companies["Firmy i research<br/>[Trasy Nitro + moduły TypeScript]<br/>Profile firm, role przy ofertach, raporty"]
    Sources["Obsługa źródeł<br/>[Trasy Nitro + moduły TypeScript]<br/>Status importów i ręczne zlecenia polskich źródeł"]
  end

  Owner -->|"Otwiera widoki przez HTTP"| UI
  UI -->|"Czyta oferty i składa dyspozycje, HTTP/JSON"| Offers
  UI -->|"Zarządza profilem i przesyła CV, HTTP"| Profile
  UI -->|"Edytuje powiązania i zleca research, HTTP/JSON"| Companies
  UI -->|"Odczytuje status lub zleca import, HTTP/JSON"| Sources
  Offers -->|"Czyta oferty, zapisuje oceny i zleca dopasowanie"| DB
  Profile -->|"Zapisuje wersje i zleca ekstrakcję lub propozycję"| DB
  Companies -->|"Zapisuje profile firm i zleca research"| DB
  Sources -->|"Odczytuje i zleca przebiegi"| DB
  Profile -->|"Zapisuje i udostępnia PDF / DOCX"| Files
  Profile -.->|"Sprawdza model przed zleceniem"| Ollama

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class UI,Offers,Profile,Companies,Sources internal
  class Owner,DB,Files,Ollama external
```

| Komponent | Punkty wejścia i implementacja |
| --- | --- |
| Widoki Vue | [Lista ofert](../../app/pages/offers.vue), [profil zawodowy](../../app/pages/profile.vue), [szczegóły firmy](../../app/pages/companies/%5Bid%5D.vue) |
| Oferty i dopasowanie | [Lista ofert API](../../server/api/offers/index.get.ts), [zapytania ofert](../../lib/offers.ts), [dane ocen na liście](../../lib/matching/list.ts), [zlecenie grupy ocen](../../server/api/matching/index.post.ts) |
| Profil zawodowy | [Potwierdzenie wersji](../../server/api/profile/confirm.post.ts), [import CV](../../server/api/profile/imports/index.post.ts), [zlecenie propozycji](../../server/api/profile/imports/%5Bid%5D/prepare.post.ts), [zapis profilu](../../lib/profile/store.ts) |
| Firmy i research | [Lista firm API](../../server/api/companies/index.get.ts), [powiązania z ofertą](../../server/api/companies/%5Bid%5D/links.post.ts), [zlecenie researchu](../../server/api/companies/%5Bid%5D/research.post.ts), [zapis profilu firmy](../../lib/companies/store.ts) |
| Obsługa źródeł | [Zlecenie importu](../../server/api/sources/polish.post.ts), [status polskich źródeł](../../server/api/sources/polish.get.ts), [status JobSpy](../../server/api/sources/jobspy.get.ts) |

### Worker

```mermaid
flowchart TB
  DB[("PostgreSQL<br/>[Kontener]")]
  Files[("Dokumenty CV<br/>[Kontener]")]
  Boards["Portale z ofertami<br/>[Systemy zewnętrzne]"]
  OpenAI["OpenAI<br/>[System zewnętrzny]"]
  Ollama["Ollama<br/>[System zewnętrzny]"]

  subgraph Worker["Worker · Node.js"]
    Runtime["Obsługa kolejek i harmonogram<br/>[TypeScript / pg-boss]<br/>Rejestracja zadań, odzyskiwanie, heartbeat"]
    Import["Import ogłoszeń<br/>[TypeScript / Python]<br/>SOLID.Jobs, polskie źródła i JobSpy"]
    Parse["Ekstrakcja CV<br/>[pdfjs-dist / mammoth]<br/>Odczyt tekstu z PDF lub DOCX"]
    Profile["Propozycja profilu<br/>[TypeScript]<br/>Przygotowanie i walidacja danych zawodowych"]
    Matching["Oceny dopasowania<br/>[TypeScript]<br/>Partie pojedyncze i grupowe, publikacja ocen"]
    Research["Research podstawowy<br/>[TypeScript]<br/>Zebranie źródeł i synteza raportu"]
  end

  Runtime -->|"Odbiera zadania i zapisuje heartbeat"| DB
  Runtime -->|"Uruchamia przebieg importu"| Import
  Runtime -->|"Przekazuje identyfikator importu CV"| Parse
  Runtime -->|"Przekazuje identyfikator próby AI"| Profile
  Runtime -->|"Przekazuje identyfikator zlecenia lub grupy"| Matching
  Runtime -->|"Przekazuje identyfikator operacji researchu"| Research
  Import -->|"Pobiera ogłoszenia przez HTTP(S)"| Boards
  Import -->|"Zapisuje ogłoszenia, rewizje i statusy"| DB
  Parse -->|"Odczytuje oryginał CV"| Files
  Parse -->|"Zapisuje tekst i status ekstrakcji"| DB
  Profile -->|"Zapisuje propozycję i stan próby"| DB
  Matching -->|"Zapisuje oceny, historię i artefakty partii"| DB
  Research -->|"Zapisuje wersję raportu i stan próby"| DB
  Profile -.->|"Generuje propozycję przez Responses API"| OpenAI
  Profile -.->|"Generuje propozycję przez Ollama API"| Ollama
  Matching -.->|"Wysyła partie i odbiera wyniki przez Files / Batch API"| OpenAI
  Research -.->|"Wyszukuje źródła i syntetyzuje raport przez Responses API"| OpenAI

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class Runtime,Import,Parse,Profile,Matching,Research internal
  class DB,Files,Boards,OpenAI,Ollama external
```

| Komponent | Punkty wejścia i implementacja |
| --- | --- |
| Obsługa kolejek i harmonogram | [Punkt wejścia workera](../../worker/index.ts). Przy starcie i co minutę sprawdza zaległości. Harmonogram zleca import SOLID.Jobs. |
| Import ogłoszeń | [SOLID.Jobs](../../lib/sources/sync.ts), [polskie źródła](../../lib/sources/polish-sync.ts), [JobSpy](../../lib/sources/jobspy-sync.ts), [zapis ogłoszeń i rewizji](../../lib/sources/store.ts). |
| Ekstrakcja CV | [`extractImport`](../../lib/profile/imports.ts) obsługuje `profile-parse`. |
| Propozycja profilu | [`executeAi`](../../lib/profile/ai.ts) obsługuje `profile-ai`. Płatna ścieżka korzysta z [budżetu AI](../../lib/ai/budget.ts). |
| Oceny dopasowania | [Pojedyncze zlecenie](../../lib/matching/store.ts) i [grupa](../../lib/matching/groups.ts) używają [klienta Batch](../../lib/matching/batch.ts) oraz [archiwum partii](../../lib/matching/archive.ts). |
| Research podstawowy | [`executeCompanyResearch`](../../lib/companies/research.ts) wykonuje `company-research` i używa [dostawcy OpenAI](../../lib/companies/research-provider.ts). |

<a id="c4-kod-przygotowanie-propozycji-profilu"></a>

## C4 — kod przygotowania propozycji profilu

Widok pokazuje wywołania w komponencie propozycji profilu i jego punkty wejścia. Wybór wykonawcy opiera się na konfiguracji zapisanej z próbą. Wcześniejsza ekstrakcja tekstu należy do osobnego komponentu workera.

```mermaid
flowchart TB
  Prepare["prepare.post.ts<br/>[Trasa Nitro]"]
  Worker["worker/index.ts<br/>[Handler kolejki profile-ai]"]

  subgraph Proposal["Kod przygotowania propozycji profilu"]
    Enqueue["prepareProposal<br/>[Funkcja · ai.ts]"]
    Config["profileConfiguration<br/>[Funkcja · ai-configuration.ts]"]
    LocalQueue["enqueueLocalProfile<br/>[Funkcja · local-ai.ts]"]
    Dispatch["executeAi<br/>[Funkcja · ai.ts]"]
    Paid["executePaidProfile<br/>[Funkcja · ai.ts]"]
    Local["executeLocalProfile<br/>[Funkcja · local-ai.ts]"]
    OpenAI["OpenAiAdapter<br/>[Klasa · models/openai.ts]"]
    Ollama["OllamaAdapter<br/>[Klasa · models/ollama.ts]"]
    Result["readAiProposal<br/>[Funkcja · ai-result.ts]"]
    Slot["claimLocal<br/>[Funkcja · operations/local.ts]"]
  end

  Prepare -->|"Waliduje żądanie i przekazuje tekst oraz rewizję"| Enqueue
  Enqueue -->|"Odczytuje konfigurację i tworzy migawkę wykonania"| Config
  Config -.->|"Sprawdza dostępność wybranego modelu"| Ollama
  Enqueue -.->|"Zapisuje lokalną próbę i zleca dostarczenie"| LocalQueue
  Worker -->|"Przekazuje identyfikator próby"| Dispatch
  Dispatch -->|"Dla OpenAI przekazuje fabrykę adaptera ścieżce płatnej"| Paid
  Dispatch -.->|"Dla zapisanej migawki Ollama uruchamia ścieżkę lokalną"| Local
  Paid -->|"Generuje propozycję na podstawie danych zawodowych"| OpenAI
  Paid -->|"Waliduje wynik modelu"| Result
  Local -->|"Przejmuje wspólny slot lokalny"| Slot
  Local -->|"Zleca generację na podstawie migawki"| Ollama
  Local -->|"Waliduje wynik modelu"| Result

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class Enqueue,Config,LocalQueue,Dispatch,Paid,Local,OpenAI,Ollama,Result,Slot internal
  class Prepare,Worker external
```

`prepareProposal` usuwa dane kontaktowe z przekazanego tekstu i zapisuje jego rewizję. Dla OpenAI tworzy próbę z rezerwacją budżetu i zleca pracę po uzyskaniu środków. Dla Ollama zapisuje lokalną operację i zleca dostarczenie przez tę samą kolejkę pg-boss. Worker odczytuje zapisaną konfigurację. Po walidacji zapisuje propozycję przy imporcie, a zastosowanie propozycji jest osobną operacją właściciela. [Punkt wejścia HTTP](../../server/api/profile/imports/%5Bid%5D/prepare.post.ts) · [Orkiestracja i rozliczenie](../../lib/profile/ai.ts) · [Konfiguracja profilu](../../lib/profile/ai-configuration.ts) · [Wykonanie lokalne](../../lib/profile/local-ai.ts) · [Walidacja propozycji](../../lib/profile/ai-result.ts) · [Zastosowanie propozycji](../../server/api/profile/imports/%5Bid%5D/apply.post.ts)

<a id="stan-lokalnego-ai"></a>

## Stan lokalnego AI

| Obszar | Stan w bieżącym kodzie |
| --- | --- |
| Profil zawodowy | Trasa przygotowania i handler `profile-ai` prowadzą do lokalnego wykonawcy przy migawce Ollama. [Compose](../../compose.yaml) przekazuje `AI_PROFILE_EXECUTION_JSON` i `AI_ENDPOINTS_JSON` do web i workera. Przykład konfiguracji znajduje się w [pliku środowiskowym](../../.env.example). Dostępność modelu i łączność z kontenerów wymagają osobnej weryfikacji. |
| Lokalna kolejka i odzyskiwanie | [Migracja lokalnego AI](../../migrations/1770000000013_local_ai.cjs) dodaje dane operacji, kolejki i slotu. [Moduł lokalnego profilu](../../lib/profile/local-ai.ts) budzi oczekujące zadania po potwierdzonym zakończeniu generacji. [Worker](../../worker/index.ts) wywołuje `recoverLocalProfiles` przy starcie i w cyklu harmonogramu. |
| Dopasowanie ofert | Podpięty worker używa OpenAI Batch. Lokalna ścieżka ocen jest opisana w [projekcie rozwiązania](../specs/lokalne-ai/solution-design.md). |
| Research pracodawcy | Podpięty research podstawowy korzysta z OpenAI Responses i wyszukiwania WWW. OpenCode i przeglądarka dla lokalnego researchu są opisane w [projekcie rozwiązania](../specs/lokalne-ai/solution-design.md). |

Po zmianie punktu wejścia, magazynu danych lub integracji zewnętrznej zaktualizuj odpowiedni widok razem z odnośnikami do kodu.

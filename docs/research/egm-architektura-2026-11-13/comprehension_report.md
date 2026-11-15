## What this proposes

Dokument proponuje refaktoryzację aplikacji do sześciu modułów z jawnymi publicznymi operacjami: Źródła ofert, Oferty, Profil zawodowy, Dopasowanie, Firmy i AI, przy zachowaniu obecnego zachowania aplikacji. Siedem zadań dotyczących Źródeł rozdziela kontrakt i rejestr konektorów, wykonanie przebiegu, zapis metadanych, zapis ogłoszeń, odczyt danych oraz ustalanie niedostępności po kompletnym pobraniu. Pozostałe zadania porządkują Oferty, przekazują orkiestrację propozycji profilu modułowi AI, wprowadzają publiczny odczyt Profilu, usuwają pozostałe obejścia granic modułów i przenoszą kod do docelowych katalogów. Moduły mają samodzielnie chronić swoje reguły, a operacje obejmujące kilka modułów mają zachowywać wspólną transakcję; grupowanie ogłoszeń w jedną ofertę jest odpowiedzialnością modułu Oferty, natomiast wdrożenie tej funkcji nie jest wymaganiem tej refaktoryzacji.

## How the existing system works, per this document

To prywatna aplikacja jednego właściciela, która pobiera ogłoszenia, przechowuje profil zawodowy, ocenia dopasowanie oraz przygotowuje research firm. Nuxt udostępnia interfejs i HTTP API, worker przetwarza zadania pg-boss i harmonogram, PostgreSQL przechowuje dane oraz kolejki, a współdzielony wolumen przechowuje oryginały CV; pilot Himalayas importuje dane bezpośrednio z CLI. Po ekstrakcji tekstu CV aplikacja może przygotować propozycję profilu przez OpenAI albo skonfigurowaną Ollamę, a właściciel osobno stosuje wybrane zmiany i zatwierdza profil. Dopasowanie korzysta obecnie z OpenAI Batch, research z OpenAI Responses i wyszukiwania WWW, natomiast lokalne wykonanie tych dwóch funkcji pozostaje opisanym planem. Kod jest rozproszony między katalogami technicznymi, a część modułów i tras bezpośrednio czyta cudze tabele, używa wewnętrznych reprezentacji danych lub przejmuje cudze odpowiedzialności.

**C1 — Major — `.2`, `.5`, input lines 456–473, 554–556.** The relation between the source identifier stored on a run and the connector name used by ConnectorProvider is not explained. Define whether they are identical or mapped, and who owns that mapping.

**C2 — Nit — module map and `.8`, input lines 358–367, 672–676, 690–693.** The module map describes grouping advertisements as present functionality; task .8 identifies it as future work. Mark that responsibility as planned.

Reviewer `/root/comprehension` read the comprehension persona and all 934 input lines only. No supplemental context, code, history, edits or tests.

# AI i research przy limicie 100 zł miesięcznie

Stan źródeł: **2026-10-30**. Research dla `oferty-pracy-v4t.2`, na podstawie oficjalnych dokumentacji; bez płatnych wywołań, zakupów i sekretów. To materiał do decyzji, nie wybór dostawcy ani zatwierdzony kontrakt oceniania. Punktem odniesienia są [ustalenia produktu](../product/ustalenia.md).

## Wniosek

**Opisane scenariusze małego i średniego napływu ofert mieszczą się rachunkowo w 100 zł miesięcznie**, przy założonych tokenach, cenach i liczbie wyszukiwań oraz bez nieznanych dopłat za prawa storage. To warunkowa kalkulacja kosztów, jeszcze nie potwierdzenie wykonalności produkcyjnej: nie sprawdzono dostępu na koncie, kosztu wymaganych uprawnień ani jakości wyników. Nie dowodzi to jakości dopasowania ani kompletności researchu. Niewiadome obejmują jakość ekstrakcji polskich ogłoszeń, liczbę ponowień, tokeny narzędzi i prawa do utrwalania wyników. Żadne API wyszukiwania nie jest tutaj traktowane jako pełne przeszukanie internetu ani gwarancja prawdziwości znalezionych informacji.

Do porównania nadają się OpenAI z własnym wyszukiwaniem, OpenAI z Brave oraz Gemini z Brave. Google Search Grounding ma ograniczenia kolidujące z trwałą bazą researchu firm. Warianty Brave wymagają potwierdzenia praw do przechowywania w konkretnym planie. Żaden układ nie jest tu wybrany.

## Trzy układy API

Ceny USD, standardowe przetwarzanie tekstu, bez rabatów batch/cache i podatków dostawcy. Odświeżyć przed podłączeniem usługi.

| Układ | Model: USD / 1 mln tokenów wejścia → wyjścia | Search | Niewiadome |
| --- | --- | --- | --- |
| A. OpenAI Responses API + `web_search` | `gpt-6-luna`: **0,10 → 0,50** | **10 / 1000 wywołań search**, dodatkowo tokeny kontekstu według modelu | Prawa do utrwalania wyników niezweryfikowane; limity konta, tokeny i jakość dowodów |
| B. OpenAI Responses API + Brave Search | Ten sam model i ceny | **5 / 1000 żądań**, publikowane **5 USD kredytów/mies.**; kontekst przekazany modelowi płatny osobno | Dwa konta, prawa storage, własne mapowanie dowodów |
| C. Gemini Developer API + Brave Search | `gemini-3.1-flash-lite`: **0,25 → 1,50**, wyjście obejmuje thinking | Brave jak w B | Prawa storage, zgodność schematu i narzędzi |

Źródła: [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Brave Search API](https://brave.com/search/api/). A używa standardowego `web_search`, nie preview. Taryfy stałego bloku 8000 tokenów dla GPT-4.1 mini nie należy przenosić na Lunę.

**A — status weryfikacji praw: nie zweryfikowano, czy warunki OpenAI web search pozwalają w tym przepływie trwale przechowywać i ponownie wykorzystywać twierdzenia researchu, URL cytowań oraz fragmenty źródeł. Jest to otwarte ograniczenie, a nie potwierdzona alternatywa bez ograniczeń storage; dokumentacja funkcji cytowania nie rozstrzyga tych praw.**

A daje adnotacje cytowań URL i listę źródeł. Dokumentacja rozróżnia płatne działanie `search` od `open_page` i `find_in_page` dostępnych modelom reasoning. Cytowania w interfejsie muszą być widoczne i klikalne. Kontekst wyszukiwania Responses ma limit 128 tys. tokenów. [OpenAI: web search](https://developers.openai.com/api/docs/guides/tools-web-search).

B/C oddzielają wyszukiwanie od syntezy. Brave zwraca URL i fragmenty/treść, a aplikacja przypisuje dowody. Search ma publikowany limit 50 zapytań/s; osobny produkt Answers ma inne ceny i nie jest liczony. FAQ warunkuje przechowywanie wyników planem z prawami storage; otwarta strona nie potwierdza tutaj ceny tych uprawnień. To warunek do wyjaśnienia przed trwałym cache, nie przyznane prawo do zapisu. [Brave: plany i FAQ](https://brave.com/search/api/), [warunki API](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service).

Odczyt stron można realizować aplikacją lub, w C, URL Context. Ten ostatni obsługuje do 20 podanych URL/żądanie, nie podąża automatycznie za podstronami i nie obsługuje paywalli/logowania. Pobrana treść jest płatnym wejściem modelu. Nie zakładamy kosztownego renderera JavaScript ani omijania blokad; prawa stron pozostają osobnym warunkiem. [Google: URL Context](https://ai.google.dev/gemini-api/docs/url-context).

### Dlaczego nie oprzeć bazy firm na Google Search Grounding

Technicznie Grounding zwraca cytowania, zapytania i sugestie. Dla Gemini 3+ obejmuje 5000 zapytań/mies. bez dopłaty, potem 14 USD/1000, z domyślnym limitem 1500/dzień/projekt. Jedna odpowiedź może wygenerować wiele zapytań. [Google: Grounding](https://ai.google.dev/gemini-api/docs/google-search).

Warunki ograniczają cache, analizę, automatyczne zbieranie linków i tworzenie bazy. Wyjątek historii czatu nie daje ogólnego prawa do ponownego używania researchu firmy. Obowiązują też wymagania wyświetlania wyników i sugestii. **Wniosek projektowy: Grounding nie jest zatwierdzonym backendem trwałej bazy firm** bez rozwiązania zgodności konkretnego przepływu. To zidentyfikowana kolizja wymagań, nie pełna opinia prawna. [Google: Additional Terms, Grounding with Google Search](https://ai.google.dev/gemini-api/terms#grounding-with-google-search).

## Przebieg i kontrakt danych — propozycja

1. **Ekstrakcja:** pola dostępne w API/RSS mapować w kodzie; model stosować do opisu. Pole ma wartość albo `null`, źródło i fragment dowodu. Osobno technologie wymagane/opcjonalne, waluta/okres/podstawa wynagrodzenia i role firm.
2. **Triage:** profil bez kontaktów z CV, oferta i jawne kryteria. Wynik: ocena 0–100, składowe, uzasadnienie, mocne strony, braki i niewiadome. Nowy profil/prompt tworzy nową ocenę; decyzja właściciela pozostaje osobna.
3. **Research podstawowy:** po kwalifikacji ograniczony zestaw źródeł o działalności, produktach, projekcie, warunkach i technologiach. Współdzielić wynik firmy tylko przy poprawnej identyfikacji, aktualności i odpowiednich prawach. Nie przenosić technologii klienta na pośrednika ani innego projektu na ofertę.
4. **Pogłębiony:** na żądanie połączyć ofertę, znany zespół/projekt, informacje rekrutera i źródła. Wynik: firma/projekt, mapa technologii z zakresem, priorytety powtórki, pytania do ćwiczeń i do firmy, uzasadnione wymaganiem lub dowodem. Pytania to propozycje, nie znany zestaw z rzeczywistej rozmowy.

Proponowana jednostka twierdzenia: `claim_id`, `text`, `kind` (`fact`/`opinion`/`inference`/`unknown`), `subject`, `scope`, `source_ids`, `evidence_excerpt`, `published_at?`, `retrieved_at`, `conflicts[]`. Źródło ma stabilny identyfikator, URL, tytuł, datę odczytu i — gdy wolno — fragment lub hash treści. Rozróżniać pełną stronę od samego fragmentu wyszukiwarki. Opinie pracowników pozostają opiniami; brak wyników nie dowodzi braku problemów.

OpenAI i Gemini obsługują wynik strukturalny oparty na podzbiorze JSON Schema. **Schemat nie gwarantuje prawdziwości ani kompletności.** Obsłużyć odmowę, przerwanie, semantyczny błąd i niewiadomą. Google opisuje wspólne użycie schematu z narzędziami jako preview; alternatywą są osobne etapy zebrania dowodów i JSON, z kosztem obu. Aplikacja sprawdza istnienie identyfikatorów źródeł, zakres oceny i zgodność fragmentu z dowodem. [OpenAI: Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Google: Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output).

### Dwie możliwości ratingu, bez rozstrzygnięcia

- **Modelowa:** AI proponuje składowe i sumę; kod kontroluje skalę i jawne wagi. Zgodna z „AI proponuje ocenę”, wymaga kalibracji i może zmieniać się między uruchomieniami.
- **Deterministyczna suma składowych AI:** model proponuje poziomy dopasowania z dowodami, kod oblicza sumę z wag. Ułatwia odtworzenie i zmianę wag bez kolejnego wywołania. Normalizacja i obsługa niewiadomych wymagają decyzji. Czysto regułowy rating zastępujący rekomendację AI oznaczałby zmianę wymagań.

Kompletność danych pozostaje osobna. Wagi, próg automatycznego researchu i sumowanie przy brakach nie są ustalone.

## Miesięczne scenariusze

**Założenie, nie kurs NBP: efektywny 1 USD = 5,00 PLN**, mający pomieścić przewalutowanie i ewentualne narzuty rozliczenia. Nie jest to zweryfikowany kurs ani wyliczenie konkretnej faktury. Wyższy rzeczywisty koszt efektywny wymaga zmniejszenia limitu USD. VPS pozostaje poza budżetem AI + search.

Miesiąc ma 30 dni. Liczymy nowe/zmienione oferty po deduplikacji. To propozycje wolumenu, nie zmierzony napływ z portalu.

| Pakiet | Łączne wejście / wyjście na jednostkę | Search | Zakres |
| --- | --- | --- | --- |
| Oferta | 6000 / 1000 tokenów | 0 | Ekstrakcja i triage razem |
| Podstawowy research nowej firmy | 20 000 / 2500 | 2 | Źródła, synteza i ewentualny osobny JSON |
| Pogłębione przygotowanie | 60 000 / 8000 | 8 | Wszystkie przebiegi i dodatkowe źródła |

Wejście obejmuje cały płatny kontekst narzędzi, prompty, źródła i ponownie przekazywane odpowiedzi. Wyjście obejmuje płatne rozumowanie. To hipoteza do pomiaru, nie narzucony dostawcy limit; tych samych tokenów narzędzi nie doliczać drugi raz.

| Wolumen | Oferty | Podstawowy | Pogłębiony | Wejście / wyjście | Search |
| --- | --- | --- | --- | --- | --- |
| Mały | 10/dzień = 300/mies. | 20/mies. | 4/mies. | 2,44 mln / 0,382 mln | 72 |
| Średni | 50/dzień = 1500/mies. | 60/mies. | 8/mies. | 10,68 mln / 1,714 mln | 184 |

Wzór: `USD = wejście_mln × cena_wejścia + wyjście_mln × cena_wyjścia + search`. PLN poniżej zawierają dodatkowe **30% zapasu scenariuszowego** na ponowienia i tokeny. To nie gwarantowany limit kosztu zlecenia.

| Układ | Mały: USD bez zapasu | Mały: PLN z 30% | Średni: USD bez zapasu | Średni: PLN z 30% |
| --- | --- | --- | --- | --- |
| A | 0,435 + 0,720 = **1,155** | **7,51** | 1,925 + 1,840 = **3,765** | **24,47** |
| B, przed kredytami | 0,435 + 0,360 = **0,795** | **5,17** | 1,925 + 0,920 = **2,845** | **18,49** |
| C, przed kredytami | 1,183 + 0,360 = **1,543** | **10,03** | 5,241 + 0,920 = **6,161** | **40,05** |

Ceny pochodzą z powyższych cenników; reszta to własne rachunki. Przy rzeczywiście dostępnych 5 USD kredytów Brave search mieści się w grancie: B wynosi **2,83 / 12,51 PLN**, C **7,69 / 34,07 PLN**. Nie policzono nieznanej dopłaty za prawa storage, płatnego pobierania stron ani innych zastosowań tego samego konta.

Wrażliwość: średni A przy czterokrotnie większym koszcie całego pakietu to **97,89 PLN** z zapasem; średni C przy trzykrotnie większym koszcie to **120,14 PLN**, ponad limit. Ponowna ocena 1500 ofert to osobna partia: konserwatywnie 1,65 USD w B przy powtórzeniu całego pakietu oferty, około **10,73 PLN** z zapasem. Swobodne pętle researchu i długie strony mogą wyczerpać budżet mimo małej liczby ofert.

## Rozliczanie i zatrzymanie — propozycja

OpenAI raportuje `usage.input_tokens`, `output_tokens` i szczegóły; Gemini raportuje użycie, w tym myślenie. Historia rozmowy ponownie zużywa wejście. Zachować metryki i identyfikator odpowiedzi; nazwy pól zależą od wybranego API/SDK. [OpenAI: przykład usage](https://developers.openai.com/api/docs/guides/structured-outputs), [Google: tokeny](https://ai.google.dev/gemini-api/docs/tokens).

Rejestr operacji powinien wiązać ofertę/firmę z etapem, próbą, dostawcą/modelem, wersją cennika, tokenami wejścia/cache/wyjścia/rozumowania, liczbą search, kosztem USD/PLN, przelicznikiem i rezerwacją. Kredyty oddzielić od zużycia według cennika.

Proponowane zasady:

1. Przed zleceniem atomowo rezerwować koszt górnego ograniczenia wejścia, wyjścia i narzędzi, również dla równoległych zadań.
2. Ograniczać rozmiar źródeł, wyjście i rundy; narzędzia uruchamiać w kontrolowanych porcjach. Sam prompt „maksymalnie 2 wyszukania” nie gwarantuje limitu.
3. Po odpowiedzi rozliczyć użycie i zwolnić różnicę. Timeout po przyjęciu żądania ma nieznany koszt: zachować rezerwację do wyjaśnienia, nie wpisywać zera.
4. Naprawa JSON, ponowienie i fallback mają osobny koszt/rezerwację. Propozycja: najwyżej jedno automatyczne ponowienie, potem „wymaga sprawdzenia”. Nie powtarzać całego researchu z powodu końcowego formatu.
5. Gdy brakuje środków, wstrzymać płatną kolejkę do zwiększenia/odnowienia budżetu; bezpłatne pobieranie i odczyt bazy trwają. Panel dostawcy nie zastępuje wspólnego limitu AI + search.

Kwoty rezerw i zasady retry nie są zatwierdzone. Zapas 30% z tabeli nie dowodzi, że dowolne żądanie nie przekroczy rezerwacji.

## Subskrypcje i dalsza decyzja

Abonament aplikacji nie jest automatycznie saldem dowolnej organizacji API. Aktualna dokumentacja OpenAI opisuje warunkowy benefit API dla uprawnionych Pro/Business, wymagający aktywacji i powiązania organizacji, z wygasaniem kredytów. Nie zakładamy planu właściciela ani aktywacji; kalkulacja nie korzysta z tych grantów. [OpenAI: API credits for ChatGPT subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits).

Przed wyborem potrzebny jest później autoryzowany pomiar: kilkadziesiąt zróżnicowanych ofert z Polski, kilka firm o niejednoznacznych nazwach i dwa przygotowania do rozmowy. Porównać błędy ekstrakcji, oceny właściciela, pokrycie dowodami, niewiadome i koszt całości z ponowieniami. Tutaj nie wykonano takiego testu; dokumentacja funkcji nie dowodzi jakości modelu.

Do decyzji pozostają dostawca i prawa planu, model/wersja API, próg researchu, metoda ratingu, ważność danych firmy, twarde limity operacji i nieznany koszt po timeout. Cennik nie potwierdza dostępności na konkretnym koncie. Dla Luny karta modelu nie przewiduje darmowego tieru; dostęp i przepustowość zależą od tieru organizacji. Nie zakładamy darmowego konta do pracy cyklicznej. [OpenAI: limity modelu](https://developers.openai.com/api/docs/models/gpt-6-luna). Wynik to wykonalność warunkowa, nie zatwierdzona architektura.

# AI i trwały research pracodawcy — weryfikacja usług

Stan: **2026-10-31**, `oferty-pracy-v4t.10`. Zakres: osobista aplikacja lokalna, później możliwy VPS; zapis twierdzeń, URL i ograniczonych fragmentów dowodów do ponownego wykorzystania. Świeżo odczytane źródła oficjalne, bez kluczy, płatnych prób i zakupów. Uzupełnienie [wcześniejszej kalkulacji](ai-research-budzet.md), nie audyt wszystkich serwisów źródłowych.

## Wynik i rekomendacja

**Kandydat do pierwszej integracji: OpenAI Responses API, `gpt-6-luna` i standardowe `web_search`.** Dokumentacja potwierdza funkcje i niski koszt. Warunki dają podstawę do zachowania własnego Output, ale nie przenoszą praw wydawców do dowolnie kopiowanych tekstów. Rekomendacja obejmuje trwałe własne opracowanie i cytowania; fragment dowodu zapisujemy wyłącznie przy ustalonej podstawie dotyczącej konkretnego źródła. W przeciwnym razie `evidence_excerpt = null`, zachowując twierdzenie i odnośnik. To proponowany zakres wdrożenia, nie zatwierdzony wybór dostawcy.

Nie potwierdzono bezwarunkowego prawa do trwałego zbierania fragmentów z całego internetu. Jeżeli wymaganiem stanie się fragment dla każdego twierdzenia niezależnie od źródła, ten warunek pozostaje nierozstrzygnięty; sam wybór API go nie usuwa.

## Co ustalają warunki OpenAI

[Services Agreement](https://openai.com/policies/services-agreement/), obowiązujące od 1.01.2026, obejmuje API. Konkretne postanowienia:

- **§4.1:** klient posiada Output w relacji z OpenAI, w granicach prawa; OpenAI przenosi swoje ewentualne prawa do Output.
- **§3.3(b):** zakazane jest naruszanie praw osób trzecich. **§3.4:** dodatkowe warunki Third-Party Services mogą mieć zastosowanie.
- **§4.3:** klient odpowiada za prawa do przesyłanego Input oraz użycie i ocenę Output.

**Interpretacja projektowa:** własną syntezę można traktować jako Output do zapisania i ponownego użycia, z zachowaniem powyższych ograniczeń. Nie jest to przeniesienie cudzych praw do zawartych w odpowiedzi cytatów. Nie należy też utożsamiać zapisu we własnej bazie z retencją odpowiedzi po stronie dostawcy.

W odczytanych [Service Terms](https://openai.com/policies/service-terms/), aktualizacja 16.10.2026, nie ma osobnej sekcji web search ustanawiającej zakaz bazy analogiczny do Brave/Google. To wynik przeglądu wskazanego tekstu, **nie dowód nieograniczonej licencji przez przemilczenie**. §1(a) wymaga zgodności API z dokumentacją; zawiera też wyłączenia ochrony odszkodowawczej, m.in. dotyczące praw do Input i treści Third Party Offering. Ochrona odszkodowawcza nie zastępuje praw do źródła.

## Cytowania, dowody i ponowne użycie

[OpenAI Docs: web search](https://developers.openai.com/api/docs/guides/tools-web-search) opisuje `url_citation` z URL, tytułem i powiązaniem z tekstem oraz pełniejszą listę odwiedzonych źródeł przez `include: ["web_search_call.action.sources"]`. Przy prezentowaniu wyników lub zawartych w nich informacji cytowania muszą być widoczne i klikalne. Dotyczy to także proponowanego widoku zapisanego researchu.

**Propozycja przepływu:** zapisujemy `claim`, rodzaj (fakt/opinia/wniosek/niewiadoma), konkretną organizację i zakres, URL, datę odczytu oraz identyfikator przebiegu. Lista odwiedzonych stron nie jest automatycznie dowodem każdego twierdzenia. Fragment z odpowiedzi modelu oznaczamy jako cytat dopiero po sprawdzeniu jego zgodności ze źródłem; streszczenie pozostaje opracowaniem. Dowód ze snippetu wyszukiwarki odróżniamy od fragmentu rzeczywiście odczytanej strony.

Dla fragmentów proponuję zapisywać informację o podstawie ich utrwalenia i pochodzeniu. Nie ustalam tutaj uniwersalnego limitu znaków: mała długość ani prywatność aplikacji same nie ustanawiają licencji. Serwis ze zgodą/licencją na dany użytek może dostarczać fragmenty; przy nieustalonych prawach pozostaje odnośnik i własna synteza, wymagająca zwykłej oceny wykorzystanego materiału. Bezpośrednie pobranie strony zamiast wyniku wyszukiwania nie znosi warunków tego serwisu.

## Zgodność API i aktualny koszt kandydata

[Karta GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) potwierdza Responses API, web search i Structured Outputs. Ceny standardowe za milion tokenów: **wejście 0,10 USD, wyjście 0,50 USD**; Free tier jest nieobsługiwany. Dostęp na konkretnym koncie nie został sprawdzony. [Cennik API](https://developers.openai.com/api/docs/pricing) podaje **10 USD/1000 wywołań web search**, dodatkowo tokeny kontekstu wyszukiwania według stawki modelu. Nie zakładamy grantu ani rabatów cache/batch.

[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) używa w Responses `text.format` z `type: "json_schema"`, `strict: true` i obsługiwanym podzbiorem schematu. Poprawny schemat nie gwarantuje poprawnych faktów. **Propozycja:** pierwszy etap zbiera research i natywne cytowania; drugi, bez search, mapuje go do schematu twierdzeń. Zachować oryginalne powiązania cytowań, obsłużyć odmowę/przerwanie i walidować identyfikatory źródeł. Dwa etapy nie są udokumentowanym obowiązkiem API; upraszczają kontrolę dowodów i kosztu naprawy JSON.

Własny rachunek według świeżych cen, przy wolumenach i tokenach z poprzedniego raportu (obejmujących wszystkie etapy):

| Scenariusz | Wejście / wyjście mln | Search | USD | PLN z zapasem |
| --- | --- | --- | --- | --- |
| Mały | 2,44 / 0,382 | 72 | 1,155 | **7,51** |
| Średni | 10,68 / 1,714 | 184 | 3,765 | **24,47** |

PLN to założone 5 PLN/USD i dodatkowe 30%, nie aktualny kurs ani faktura. Wynik mieści się w 100 PLN przy tych założeniach; nie dowodzi rzeczywistego zużycia. Aplikacja potrzebuje wspólnego limitu AI/search i ograniczenia liczby rund. Sam prompt nie stanowi twardej blokady kosztów.

## Porównanie: Brave i wcześniejsza kolizja Google

[Brave Search API Terms](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service), aktualizacja 1.09.2026, **§3.2(i)** zabrania trwałego przechowywania/cache/bazy Search Results także w części, poza magazynowaniem przejściowym potrzebnym do działania. Definicja **§1.10** obejmuje wszystkie wyniki wywołań, a **§3.2(ii)** ogranicza utwory zależne. Nie zakładamy więc, że przeredagowanie snippetu przez AI omija warunki. §2 dopuszcza dodatkowe Order Forms.

[FAQ Brave](https://brave.com/search/api/) dopuszcza storage z planem zawierającym takie prawa. [Publiczny cennik](https://api-dashboard.search.brave.com/documentation/pricing) pokazuje Search 5 USD/1000 żądań i 5 USD miesięcznych kredytów, ale nie potwierdza przyznania storage w tym wariancie. **Wniosek:** Brave pozostaje rezerwą po uzyskaniu konkretnych warunków i ceny; nie jest obecnie potwierdzonym zamiennikiem dla trwałej bazy. Prawa wydawców nadal byłyby osobne.

[Gemini Additional Terms — Grounding with Google Search, Use Restrictions](https://ai.google.dev/gemini-api/terms#grounding-with-google-search) nadal ograniczają cache, analizowanie i zbieranie linków do innych celów. Wyjątek historii czatu do dwóch lat służy oglądaniu historii, a wyjątek indywidualnego zapisu wyklucza automatyczne gromadzenie i bazę. To podtrzymuje wcześniejsze wyłączenie tego mechanizmu z projektowanej bazy pracodawców, bez oceniania całej oferty Gemini.

## Co pozostaje do rozstrzygnięcia

Do wyboru kandydata wystarcza decyzja o opisanym warunkowym zakresie fragmentów; nie jest potrzebny otwarty audyt internetu. Późniejsza, osobno autoryzowana próba powinna sprawdzić dostęp konta, rozpoznawanie organizacji, zgodność cytatów, koszt wszystkich rund i ponowień oraz jakość polskich ofert. Bez niej potwierdzamy podstawę dokumentacyjną i rachunkową, nie jakość produkcyjną. W razie wymagania obowiązkowych fragmentów trzeba wcześniej określić dopuszczone źródła i podstawy ich wykorzystania.

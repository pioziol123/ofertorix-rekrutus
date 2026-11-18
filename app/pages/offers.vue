<script setup lang="ts">
import {
  matchingStateLabels,
  matchingGroupLabels,
} from '../../lib/matching/view'
import type { PolishSource } from '../../lib/sources/polish-catalog'
import { remoteEligibilityLabel } from '../../lib/sources/remote-eligibility'
import {
  offerFilterQuery,
  hasSalaryFilter,
  type Salary,
} from '../../modules/offers/view'
useHead({ title: 'Oferty pracy — przegląd' })
const route = useRoute()
const keys = [
  'q',
  'technology',
  'technologyMode',
  'skillType',
  'location',
  'mode',
  'contract',
  'hours',
  'seniority',
  'availability',
  'minSalary',
  'currency',
  'period',
  'includeUnknownSalary',
  'sort',
  'assessmentState',
  'minRating',
  'minCompleteness',
  'minTechnologies',
  'minExperience',
  'minConditions',
  'minDirection',
] as const
const defaults = {
  technologyMode: 'any',
  skillType: 'all',
  includeUnknownSalary: 'true',
  sort: 'newest',
}
const form = reactive<Record<string, string>>({})
const salaryEnabled = ref(false)
function restore() {
  salaryEnabled.value = hasSalaryFilter(route.query)
  for (const key of keys)
    form[key] =
      typeof route.query[key] === 'string'
        ? (route.query[key] as string)
        : (defaults[key as keyof typeof defaults] ?? '')
}
restore()
watch(() => route.query, restore)
const query = computed(() =>
  Object.fromEntries(
    Object.entries(route.query).filter(([key]) => key !== 'offer'),
  ),
)
const { data, status, error, refresh } = await useFetch('/api/offers', {
  query,
})
const selected = computed(() =>
  typeof route.query.offer === 'string' ? route.query.offer : '',
)
const request = useRequestFetch()
const {
  data: detail,
  status: detailStatus,
  error: detailError,
} = await useAsyncData(
  'offer-detail',
  () =>
    selected.value
      ? request(`/api/offers/${encodeURIComponent(selected.value)}`)
      : Promise.resolve(null),
  { watch: [selected] },
)
const checkedOffers = ref<string[]>([])
const bulkCommandId = ref('')
const assessing = ref(false)
const assessmentMessage = ref('')
const matchingRefresh = ref(0)
async function weightsUpdated() {
  await refresh()
  matchingRefresh.value++
}
watch(checkedOffers, () => {
  bulkCommandId.value = ''
})
const selectionScope = computed(() =>
  JSON.stringify(
    Object.entries(query.value)
      .filter(([key]) => !['page', 'sort'].includes(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  ),
)
watch(selectionScope, () => {
  checkedOffers.value = []
})
const pageChecked = computed(
  () =>
    !!data.value?.items.length &&
    data.value.items.every((offer) => checkedOffers.value.includes(offer.id)),
)
function togglePage(event: Event) {
  const visible = data.value?.items.map((o) => o.id) ?? []
  if ((event.target as HTMLInputElement).checked) {
    const combined = [...new Set([...checkedOffers.value, ...visible])]
    checkedOffers.value = combined.slice(0, 100)
    if (combined.length > 100)
      assessmentMessage.value =
        'Osiągnięto limit 100 ofert. Pozostałe pozycje na stronie nie zostały zaznaczone.'
  } else
    checkedOffers.value = checkedOffers.value.filter(
      (id) => !visible.includes(id),
    )
}
const bulkReservation = computed(() => {
  const unit = data.value?.matching.maximumCostPln
  if (!unit) return null
  // Money remains exact in millionths; the displayed amount is a conservative maximum.
  const micros =
    BigInt(unit.replace('.', '')) * BigInt(checkedOffers.value.length)
  return `${micros / 1000000n},${(micros % 1000000n).toString().padStart(6, '0')}`
})
async function assessChecked() {
  if (!checkedOffers.value.length || assessing.value) return
  bulkCommandId.value ||= crypto.randomUUID()
  assessing.value = true
  assessmentMessage.value = ''
  try {
    const result = await $fetch('/api/matching', {
      method: 'POST',
      body: {
        commandId: bulkCommandId.value,
        offerIds: [...checkedOffers.value],
      },
    })
    const reused = result.items.filter((i) => i.reused).length
    const excluded = result.items.filter((i) => i.state === 'excluded').length
    assessmentMessage.value = result.reused
      ? 'To zlecenie zostało już przyjęte; nie wysłano ponownie.'
      : `Zlecenie zapisane: ${result.items.length} ofert. Już oczekujące: ${reused}. Niezgodne z wymaganiami: ${excluded}.${result.state === 'waiting_budget' ? ' Grupa czeka na budżet.' : ''}`
    checkedOffers.value = []
    matchingRefresh.value++
    await refresh()
  } catch (e) {
    const response = e as { data?: { data?: { message?: string } } }
    assessmentMessage.value =
      response.data?.data?.message ??
      'Nie udało się potwierdzić zlecenia. Możesz spróbować ponownie z tym samym zaznaczeniem — nie zleci to tej partii drugi raz.'
  } finally {
    assessing.value = false
  }
}
const scoreFilters = [
  { key: 'minRating', label: 'Minimalny rating' },
  { key: 'minCompleteness', label: 'Minimalna kompletność (%)' },
  { key: 'minTechnologies', label: 'Technologie — minimum' },
  { key: 'minExperience', label: 'Doświadczenie — minimum' },
  { key: 'minConditions', label: 'Warunki — minimum' },
  { key: 'minDirection', label: 'Kierunek zawodowy — minimum' },
]
const importTechnology = ref('PHP')
const importSeniority = ref('senior')
const importingSource = ref<string | null>(null)
const importMessage = ref('')
function importCriteria(diagnostics: Record<string, unknown> | null) {
  const query = diagnostics?.query
  if (!query || typeof query !== 'object') return ''
  const criteria = query as Record<string, unknown>
  return `${typeof criteria.technology === 'string' ? criteria.technology : 'wszystkie technologie'} · ${typeof criteria.seniority === 'string' ? criteria.seniority : 'wszystkie poziomy'}`
}
async function importPolish(source: PolishSource) {
  importingSource.value = source
  importMessage.value = ''
  try {
    const result = await $fetch('/api/sources/polish', {
      method: 'POST',
      body: {
        source,
        technology: importTechnology.value.trim() || null,
        seniority: importSeniority.value || null,
      },
    })
    importMessage.value = result.reused
      ? 'Import tego źródła już trwa. Poczekaj na jego zakończenie.'
      : 'Import dodany do kolejki. Wynik pojawi się poniżej.'
    await refresh()
  } catch {
    importMessage.value = 'Nie udało się rozpocząć importu. Spróbuj ponownie.'
  } finally {
    importingSource.value = null
  }
}
let importTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  importTimer = setInterval(() => {
    if (
      (data.value?.matching.pending ?? 0) > 0 ||
      data.value?.polish.sources.some(
        (s) => s.run && ['queued', 'running'].includes(s.run.status),
      )
    )
      void refresh()
  }, 5000)
})
onUnmounted(() => clearInterval(importTimer))
const options = computed(() => data.value?.options)
async function apply() {
  const query = offerFilterQuery(form, salaryEnabled.value)
  await navigateTo({ path: '/offers', query })
}
const offerLink = (id: string) => ({
  path: '/offers',
  query: { ...route.query, offer: id },
})
const closeLink = computed(() => ({
  path: '/offers',
  query: { ...route.query, offer: undefined },
}))
const dateLabel = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('pl-PL', {
        dateStyle: 'medium',
        timeZone: 'Europe/Warsaw',
      }).format(new Date(value))
    : 'Brak danych'
const timeLabel = (value: string) =>
  new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Warsaw',
  }).format(new Date(value))
const modeLabel = (value: string | null) =>
  ({ remote: 'Zdalnie', hybrid: 'Hybrydowo', office: 'Stacjonarnie' })[
    value ?? ''
  ] ?? 'Tryb niepodany'
const hoursLabel = (value: string | null) =>
  ({ full_time: 'Pełny etat', part_time: 'Część etatu' })[value ?? ''] ??
  value ??
  'Brak danych'
const periodLabel = (value: string | null) =>
  ({
    Month: 'mies.',
    Year: 'rok',
    Day: 'dzień',
    Hour: 'godz.',
    Fixed: 'projekt',
  })[value ?? ''] ??
  value ??
  '?'
function salaryLabel(s: Salary) {
  const amount = (n: number | null) =>
    n === null ? '?' : new Intl.NumberFormat('pl-PL').format(n)
  return `${amount(s.from)} – ${amount(s.to)} ${s.currency ?? '?'} / ${periodLabel(s.period)}`
}
const salaryOriginLabel = (salary: Salary) =>
  salary.origin === 'portal_estimate'
    ? 'Szacunek portalu — kwota niepotwierdzona przez pracodawcę'
    : salary.origin === 'unknown'
      ? 'Pochodzenie kwoty nieustalone'
      : salary.origin === 'employer'
        ? 'Kwota podana przez pracodawcę'
        : ''
function changeSort(event: Event) {
  form.sort = (event.target as HTMLSelectElement).value
  void apply()
}
const pageLink = (page: number) => ({
  path: '/offers',
  query: { ...route.query, page: String(page) },
})
</script>

<template>
  <div class="workspace">
    <header class="app-header">
      <NuxtLink to="/offers" class="brand"
        ><span class="brand-mark">o.</span> Oferty pracy</NuxtLink
      >
      <nav class="app-nav">
        <NuxtLink to="/offers" aria-current="page">Oferty</NuxtLink
        ><NuxtLink to="/companies">Firmy</NuxtLink
        ><NuxtLink to="/profile">Mój profil</NuxtLink>
      </nav>
    </header>
    <main class="offers-main">
      <div class="page-heading">
        <div>
          <p class="eyebrow">PRZEGLĄD</p>
          <h1>
            Wszystkie oferty<span v-if="data" class="count-badge">{{
              data.total
            }}</span>
          </h1>
          <p class="muted">
            Oferty z podłączonych źródeł <span class="dot">·</span> Źródło przy
            każdej ofercie
          </p>
        </div>
        <div class="sync-summary">
          <span class="status-dot" /> SOLID.Jobs — ostatni pełny import<br /><strong
            >{{ dateLabel(data?.sync.lastComplete?.finished_at) }}</strong
          ><UButton
            variant="ghost"
            color="neutral"
            size="sm"
            :loading="status === 'pending'"
            @click="refresh()"
            >Odśwież widok</UButton
          >
        </div>
      </div>
      <p
        v-if="
          data?.sync.run && ['partial', 'failed'].includes(data.sync.run.status)
        "
        class="notice"
      >
        Ostatni import był niepełny. Pokazujemy zachowane dane; dostępność
        brakujących ofert nie została zmieniona.
      </p>
      <details class="notice">
        <summary>Źródła JobSpy</summary>
        <p v-for="source in data?.jobspy.sources" :key="source.source">
          <strong>{{ source.name }}</strong> —
          {{ source.enabled ? 'włączone ręcznie' : 'wyłączone' }}.
          {{ source.reason }}
          <span v-if="source.run"
            >Ostatni import:
            {{
              source.run.status === 'complete'
                ? 'zakończony'
                : source.run.status === 'partial'
                  ? 'niepełny'
                  : source.run.status === 'failed'
                    ? 'błąd pobierania'
                    : source.run.status === 'running'
                      ? 'w trakcie'
                      : 'w kolejce'
            }}. Zapisano ofert: {{ source.run.seen }}.
            {{ importCriteria(source.run.diagnostics) }}</span
          >
          <span v-else>Nie wykonano importu.</span>
        </p>
        <p>Wyniki nie oznaczają pełnego pokrycia portalu.</p>
      </details>
      <details class="notice">
        <summary>Polskie serwisy — pobieranie ofert</summary>
        <p>
          Import uruchamiany ręcznie. Kryteria pobierania są niezależne od
          filtrów listy poniżej.
        </p>
        <div class="primary-filters">
          <label
            >Technologia<input
              v-model="importTechnology"
              placeholder="np. PHP, Go; puste = wszystkie"
          /></label>
          <label
            >Poziom<select v-model="importSeniority">
              <option value="">Wszystkie</option>
              <option value="junior">Junior</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
              <option value="expert">Expert</option>
              <option value="lead">Lead</option>
              <option value="staff">Staff</option>
              <option value="principal">Principal</option>
            </select></label
          >
        </div>
        <p v-for="source in data?.polish.sources" :key="source.source">
          <strong>{{ source.name }}</strong> —
          <span v-if="source.run"
            >{{
              source.run.status === 'complete'
                ? 'Import zakończony'
                : source.run.status === 'partial'
                  ? 'Import niepełny — osiągnięto limit lub nie odczytano wszystkich danych'
                  : source.run.status === 'failed'
                    ? 'Błąd pobierania'
                    : source.run.status === 'running'
                      ? 'Pobieranie w toku'
                      : 'Import w kolejce'
            }}. Zapisano ofert: {{ source.run.seen }}.
            {{ importCriteria(source.run.diagnostics) }}</span
          >
          <span v-else>Nie wykonano importu.</span>
          <UButton
            size="sm"
            variant="outline"
            :loading="importingSource === source.source"
            :disabled="
              !source.enabled ||
              importingSource !== null ||
              !!(
                source.run && ['queued', 'running'].includes(source.run.status)
              )
            "
            @click="importPolish(source.source)"
            >Pobierz oferty</UButton
          >
        </p>
        <p v-if="importMessage" role="status">{{ importMessage }}</p>
        <p>
          Brak informacji o spełnieniu kryterium nie odrzuca oferty. Jeden
          import pobiera do 50 ofert, 5 stron i 60 żądań; niepełny wynik
          zachowuje pobrane oferty i nie zmienia dostępności pozostałych.
        </p>
      </details>
      <form class="filter-panel" @submit.prevent="apply">
        <div class="primary-filters">
          <label class="search-field"
            >Szukaj oferty<UInput
              v-model="form.q"
              placeholder="Stanowisko, firma, technologia…"
              size="lg"
              class="w-full"
          /></label>
          <label
            >Technologie <span class="hint">oddziel przecinkami</span
            ><input
              v-model="form.technology"
              placeholder="np. PHP, Symfony"
              list="technologies"
          /></label>
          <datalist id="technologies">
            <option v-for="t in options?.technologies" :key="t" :value="t" />
          </datalist>
          <label
            >Łączenie technologii<select v-model="form.technologyMode">
              <option value="any">Dowolna z podanych</option>
              <option value="all">Wszystkie podane</option>
              <option value="excluded">Wyklucz podane</option>
            </select></label
          >
          <UButton type="submit" size="lg">Pokaż oferty</UButton>
        </div>
        <details class="more-filters">
          <summary>
            Więcej filtrów <span>Warunki, lokalizacja i dostępność</span>
          </summary>
          <div class="filter-grid">
            <label
              >Rola technologii<select v-model="form.skillType">
                <option value="all">Wszystkie technologie</option>
                <option value="required">Wymagane</option>
                <option value="optional">Opcjonalne</option>
              </select></label
            >
            <label
              >Lokalizacja<input
                v-model="form.location"
                placeholder="np. Warszawa"
            /></label>
            <label
              >Tryb pracy<select v-model="form.mode">
                <option value="">Dowolny</option>
                <option value="remote">Zdalnie</option>
                <option value="hybrid">Hybrydowo</option>
                <option value="office">Stacjonarnie</option>
                <option value="unknown">Brak danych</option>
              </select></label
            >
            <label
              >Kontrakt<select v-model="form.contract">
                <option value="">Dowolny</option>
                <option v-for="c in options?.contracts" :key="c" :value="c">
                  {{ c }}
                </option>
              </select></label
            >
            <label
              >Wymiar pracy<select v-model="form.hours">
                <option value="">Dowolny</option>
                <option v-for="h in options?.hours" :key="h" :value="h">
                  {{ hoursLabel(h) }}
                </option>
              </select></label
            >
            <label
              >Seniority<select v-model="form.seniority">
                <option value="">Dowolne</option>
                <option v-for="s in options?.seniorities" :key="s" :value="s">
                  {{ s }}
                </option>
              </select></label
            >
            <label
              >Dostępność<select v-model="form.availability">
                <option value="">Wszystkie pobrane</option>
                <option value="available">Widziane w źródle</option>
                <option value="unavailable">Niedostępne w źródle</option>
                <option value="expired">Po dacie wygaśnięcia</option>
              </select></label
            >
            <label
              >Stan oceny<select v-model="form.assessmentState">
                <option value="">Wszystkie</option>
                <option value="unassessed">Bez zleconej oceny</option>
                <option value="pending">Oczekujące</option>
                <option value="current">Aktualna ocena</option>
                <option value="stale">Nieaktualna ocena</option>
                <option value="failed">Błąd oceny</option>
                <option value="excluded">Niezgodność wymagań</option>
                <option value="unknown">Wymaga sprawdzenia</option>
              </select></label
            >
            <label v-for="filter in scoreFilters" :key="filter.key"
              >{{ filter.label
              }}<input
                v-model="form[filter.key]"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Dowolne"
            /></label>
            <fieldset class="salary-filter-group">
              <legend>Wynagrodzenie (opcjonalnie)</legend>
              <label class="salary-toggle"
                ><input v-model="salaryEnabled" type="checkbox" />Filtruj
                wynagrodzenie</label
              >
              <p class="filter-note">
                Wyłącz, aby pominąć warunki płacy i zastosować pozostałe filtry.
              </p>
              <div class="filter-grid">
                <label
                  >Oczekiwane minimum<input
                    v-model="form.minSalary"
                    :disabled="!salaryEnabled"
                    type="number"
                    min="0"
                    max="1000000000"
                    step="0.01"
                    placeholder="np. 25000"
                /></label>
                <label
                  >Waluta<select
                    v-model="form.currency"
                    :disabled="!salaryEnabled"
                    :required="salaryEnabled && form.minSalary !== ''"
                  >
                    <option value="">Dowolna</option>
                    <option
                      v-for="c in options?.currencies"
                      :key="c"
                      :value="c"
                    >
                      {{ c }}
                    </option>
                  </select></label
                >
                <label
                  >Okres płacy<select
                    v-model="form.period"
                    :disabled="!salaryEnabled"
                    :required="salaryEnabled && form.minSalary !== ''"
                  >
                    <option value="">Dowolny</option>
                    <option v-for="p in options?.periods" :key="p" :value="p">
                      {{ periodLabel(p) }}
                    </option>
                  </select></label
                >
                <label
                  >Nieznane widełki<select
                    v-model="form.includeUnknownSalary"
                    :disabled="!salaryEnabled"
                  >
                    <option value="true">Uwzględniaj</option>
                    <option value="false">Ukryj</option>
                  </select></label
                >
              </div>
            </fieldset>
          </div>
          <p class="filter-note">
            Minimum może pokrywać tylko część widełek. Nie przeliczamy walut,
            okresów ani podstaw opodatkowania; porównuj warianty dla wybranego
            kontraktu.
          </p>
          <UButton type="submit" variant="soft">Zastosuj filtry</UButton>
        </details>
      </form>
      <MatchingWeights @updated="weightsUpdated" />
      <div class="list-toolbar">
        <span
          >{{ data?.total ?? '—' }} wyników
          <NuxtLink
            v-if="Object.keys(route.query).some((k) => k !== 'offer')"
            to="/offers"
            >Wyczyść filtry</NuxtLink
          ></span
        ><label
          >Sortuj<select :value="form.sort" @change="changeSort">
            <option value="newest">Najnowsze wykrycie</option>
            <option value="oldest">Najstarsze wykrycie</option>
            <option value="published">Data publikacji</option>
            <option value="title">Stanowisko A–Z</option>
            <option value="company">Firma A–Z</option>
            <option value="rating">Najlepsze dopasowanie</option>
          </select></label
        >
      </div>
      <section
        class="list-toolbar bulk-assessment-toolbar"
        aria-label="Zbiorcza ocena ofert"
      >
        <div>
          <strong>Zaznaczono {{ checkedOffers.length }} / 100</strong>
          <p v-if="checkedOffers.length && bulkReservation">
            Maksymalna rezerwacja: {{ bulkReservation }} zł. Wspólna partia,
            osobne oceny.
          </p>
          <p v-if="data && !data.matching.profileReady">
            Zatwierdź profil, aby oceniać oferty.
          </p>
          <p v-else-if="data && !data.matching.configured">
            Oceny grupowe wymagają konfiguracji modelu i cennika partii.
          </p>
        </div>
        <UButton
          v-if="checkedOffers.length"
          variant="ghost"
          :disabled="assessing"
          @click="checkedOffers = []"
          >Wyczyść zaznaczenie</UButton
        >
        <UButton
          :loading="assessing"
          :disabled="
            !checkedOffers.length ||
            !data?.matching.configured ||
            !data?.matching.profileReady
          "
          @click="assessChecked"
          >Oceń zaznaczone</UButton
        >
      </section>
      <p v-if="assessmentMessage" class="notice" role="status">
        {{ assessmentMessage }}
      </p>
      <section v-if="error" class="empty-state" role="alert">
        <h2>Nie udało się wczytać ofert</h2>
        <p>Sprawdź filtry lub spróbuj ponownie.</p>
        <UButton @click="refresh()">Spróbuj ponownie</UButton>
      </section>
      <div
        v-else
        class="offer-layout"
        :class="{ 'with-detail': selected }"
        :aria-busy="status === 'pending'"
      >
        <section class="offer-list">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th class="offer-selection">
                    <input
                      type="checkbox"
                      aria-label="Zaznacz wszystkie oferty na tej stronie"
                      :checked="pageChecked"
                      :disabled="assessing || status === 'pending'"
                      @change="togglePage"
                    />
                  </th>
                  <th>Stanowisko / firma</th>
                  <th>Wynagrodzenie</th>
                  <th>Lokalizacja / tryb</th>
                  <th>Dopasowanie</th>
                  <th>Wykryto</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="offer in data?.items"
                  :key="offer.id"
                  :class="{ selected: selected === offer.id }"
                >
                  <td class="offer-selection">
                    <input
                      v-model="checkedOffers"
                      type="checkbox"
                      :value="offer.id"
                      :aria-label="`Zaznacz ofertę ${offer.title} — ${offer.company}`"
                      :disabled="
                        assessing ||
                        status === 'pending' ||
                        (!checkedOffers.includes(offer.id) &&
                          checkedOffers.length >= 100)
                      "
                    />
                  </td>
                  <td class="offer-main">
                    <NuxtLink class="offer-title" :to="offerLink(offer.id)">{{
                      offer.title
                    }}</NuxtLink>
                    <p class="company-name">{{ offer.company }}</p>
                    <small class="muted">
                      <a
                        v-if="offer.source === 'Himalayas' && offer.url"
                        :href="offer.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        >Źródło: Himalayas</a
                      >
                      <span v-else>{{ offer.source ?? 'SOLID.Jobs' }}</span>
                    </small>
                    <p
                      v-if="offer.qualificationUnknown?.length"
                      class="salary-warning"
                    >
                      {{ offer.qualificationUnknown.join(' / ') }}: zgodność z
                      zakresem wymaga sprawdzenia.
                    </p>
                    <p v-if="offer.remoteEligibility" class="salary-warning">
                      {{ remoteEligibilityLabel(offer.remoteEligibility) }}
                    </p>
                    <div class="skill-tags">
                      <span
                        v-for="s in offer.skills.slice(0, 4)"
                        :key="s.name + s.optional"
                        class="skill-tag"
                        >{{ s.name }}<small v-if="s.optional"> +</small></span
                      ><span v-if="offer.skills.length > 4" class="more-skills"
                        >+{{ offer.skills.length - 4 }}</span
                      >
                    </div>
                    <div
                      v-if="
                        offer.availability === 'unavailable' || offer.expired
                      "
                      class="availability"
                    >
                      <span v-if="offer.availability === 'unavailable'"
                        >Niedostępna w źródle</span
                      ><span v-if="offer.expired">Po dacie wygaśnięcia</span>
                    </div>
                  </td>
                  <td>
                    <div
                      v-for="(salary, i) in offer.salaries"
                      :key="i"
                      class="salary"
                    >
                      <small
                        v-if="salaryOriginLabel(salary)"
                        class="salary-warning"
                        >{{ salaryOriginLabel(salary) }}</small
                      >
                      <strong>{{ salaryLabel(salary) }}</strong
                      ><span
                        >{{ salary.contract ?? 'Kontrakt niepodany' }}
                        <span v-if="salary.contract === 'B2B'"
                          >· netto + VAT</span
                        ><span v-if="salary.contract === 'UoP'"
                          >· brutto</span
                        ></span
                      >
                    </div>
                    <span v-if="!offer.salaries.length" class="muted"
                      >Brak danych</span
                    ><span
                      v-if="
                        data?.filters.minSalary !== null &&
                        offer.salaryStatus.partial
                      "
                      class="salary-warning"
                      >Częściowe pokrycie minimum</span
                    ><span
                      v-if="
                        data?.filters.minSalary !== null &&
                        offer.salaryStatus.unknown
                      "
                      class="salary-warning"
                      >Dopasowanie płacy niepewne</span
                    >
                  </td>
                  <td>
                    <span>{{
                      offer.locations.join(', ') || 'Lokalizacja niepodana'
                    }}</span>
                    <p class="muted">{{ modeLabel(offer.mode) }}</p>
                  </td>
                  <td>
                    <template v-if="offer.assessment">
                      <strong v-if="offer.assessment.scoreId">{{
                        offer.assessment.rating === null
                          ? 'Brak ratingu'
                          : `${offer.assessment.rating}/100`
                      }}</strong>
                      <p v-if="offer.assessment.scoreId">
                        {{
                          offer.assessment.author === 'owner'
                            ? 'Twoja ocena'
                            : 'AI'
                        }}
                      </p>
                      <p v-if="offer.assessment.completeness !== null">
                        Kompletność {{ offer.assessment.completeness }}%
                      </p>
                      <p v-if="offer.assessment.stale" class="salary-warning">
                        Nieaktualna ocena
                      </p>
                      <p v-if="offer.assessment.state !== 'completed'">
                        {{
                          matchingStateLabels[offer.assessment.state] ??
                          offer.assessment.state
                        }}
                      </p>
                      <details v-if="offer.assessment.scoreId">
                        <summary>Składowe</summary>
                        <p
                          v-for="(name, key) in matchingGroupLabels"
                          :key="key"
                        >
                          {{ name }}:
                          {{ offer.assessment.components[key] ?? 'niewiadoma' }}
                        </p>
                      </details>
                    </template>
                    <span v-else class="muted">Bez oceny</span>
                  </td>
                  <td class="date-cell">{{ dateLabel(offer.firstSeen) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="data && !data.items.length" class="empty-state">
            <h2>Brak ofert dla tych filtrów</h2>
            <p>Zmień kryteria lub wyczyść filtry.</p>
            <UButton to="/offers" variant="soft"
              >Pokaż wszystkie oferty</UButton
            >
          </div>
          <div v-if="data && data.total > 0" class="pagination">
            <UButton
              :to="pageLink(data.page - 1)"
              :disabled="data.page <= 1"
              variant="outline"
              color="neutral"
              >Poprzednia</UButton
            ><span
              >Strona {{ data.page }} z
              {{ Math.max(1, Math.ceil(data.total / data.pageSize)) }}</span
            ><UButton
              :to="pageLink(data.page + 1)"
              :disabled="data.page * data.pageSize >= data.total"
              variant="outline"
              color="neutral"
              >Następna</UButton
            >
          </div>
        </section>
        <aside
          v-if="selected"
          class="detail-panel"
          aria-label="Szczegóły oferty"
        >
          <div class="detail-top">
            <p class="eyebrow">SZCZEGÓŁY OFERTY</p>
            <UButton :to="closeLink" variant="ghost" color="neutral" size="sm"
              >Zamknij</UButton
            >
          </div>
          <p v-if="detailStatus === 'pending'" role="status">
            Wczytywanie szczegółów…
          </p>
          <p v-else-if="detailError" role="alert">
            Nie udało się otworzyć oferty. Mogła nie zostać odnaleziona.
          </p>
          <template v-else-if="detail">
            <h2>{{ detail.title }}</h2>
            <p class="detail-company">{{ detail.company }}</p>
            <OfferCompanies
              :key="`company-${detail.id}`"
              :offer-id="detail.id"
              :company-name="detail.company"
            />
            <OfferMatching
              :key="detail.id"
              :offer-id="detail.id"
              :refresh-version="matchingRefresh"
              @updated="refresh()"
            />
            <p v-if="detail.qualificationUnknown?.length" class="notice">
              {{ detail.qualificationUnknown.join(' / ') }}: zgodność z zakresem
              wymaga sprawdzenia. Samo znalezienie oferty nie potwierdza
              spełnienia wymagań.
            </p>
            <div v-if="detail.remoteEligibility" class="notice">
              <strong>{{
                remoteEligibilityLabel(detail.remoteEligibility)
              }}</strong>
              <p>{{ detail.remoteEligibility.reason }}</p>
              <blockquote
                v-for="evidence in detail.remoteEligibility.evidence"
                :key="evidence"
              >
                {{ evidence }}
              </blockquote>
            </div>
            <div class="detail-badges">
              <UBadge variant="subtle" color="neutral">{{
                detail.seniority ?? 'Seniority niepodane'
              }}</UBadge
              ><UBadge variant="subtle" color="neutral">{{
                modeLabel(detail.mode)
              }}</UBadge>
            </div>
            <UButton
              v-if="detail.url"
              :to="detail.url"
              target="_blank"
              rel="noopener noreferrer"
              variant="outline"
              class="source-link"
              >Otwórz w {{ detail.source ?? 'SOLID.Jobs' }} ↗</UButton
            >
            <section class="detail-section">
              <h3>Warunki</h3>
              <div v-for="(s, i) in detail.salaries" :key="i" class="salary">
                <small v-if="salaryOriginLabel(s)" class="salary-warning">{{
                  salaryOriginLabel(s)
                }}</small>
                <strong>{{ salaryLabel(s) }}</strong
                ><span
                  >{{ s.contract ?? 'Kontrakt niepodany' }}
                  {{
                    s.contract === 'B2B'
                      ? '· netto + VAT'
                      : s.contract === 'UoP'
                        ? '· brutto'
                        : ''
                  }}</span
                >
              </div>
              <p v-if="!detail.salaries.length" class="muted">
                Wynagrodzenie: brak danych
              </p>
              <p>
                {{ hoursLabel(detail.hours) }} ·
                {{ detail.locations.join(', ') || 'Lokalizacja niepodana' }}
              </p>
            </section>
            <section class="detail-section">
              <h3>Technologie</h3>
              <p class="small-label">Wymagane</p>
              <div class="skill-tags">
                <span
                  v-for="s in detail.skills.filter((s) => !s.optional)"
                  :key="s.name"
                  class="skill-tag"
                  >{{ s.name }}</span
                ><span
                  v-if="!detail.skills.some((s) => !s.optional)"
                  class="muted"
                  >Brak danych</span
                >
              </div>
              <p class="small-label">Opcjonalne</p>
              <div class="skill-tags">
                <span
                  v-for="s in detail.skills.filter((s) => s.optional)"
                  :key="s.name"
                  class="skill-tag"
                  >{{ s.name }}</span
                ><span
                  v-if="!detail.skills.some((s) => s.optional)"
                  class="muted"
                  >Brak danych</span
                >
              </div>
            </section>
            <section
              v-if="detail.skills.some((s) => s.optional === null)"
              class="detail-section"
            >
              <h3>Technologie bez określonej roli</h3>
              <div class="skill-tags">
                <span
                  v-for="s in detail.skills.filter((s) => s.optional === null)"
                  :key="s.name"
                  class="skill-tag"
                  >{{ s.name }}</span
                >
              </div>
            </section>
            <section class="detail-section">
              <h3>Opis stanowiska</h3>
              <p class="offer-description">
                {{ detail.description || 'Brak opisu w źródle.' }}
              </p>
            </section>
            <section class="detail-section">
              <h3>Źródło i aktualność</h3>
              <dl class="date-facts">
                <dt>Publikacja</dt>
                <dd>{{ dateLabel(detail.published) }}</dd>
                <dt>Pierwsze wykrycie</dt>
                <dd>{{ dateLabel(detail.firstSeen) }}</dd>
                <dt>Ostatni odczyt</dt>
                <dd>{{ dateLabel(detail.lastSeen) }}</dd>
                <dt>Wygaśnięcie wg źródła</dt>
                <dd>{{ dateLabel(detail.validTo) }}</dd>
                <dt>Dostępność</dt>
                <dd>
                  {{
                    detail.availability === 'available'
                      ? 'Widziana w źródle'
                      : 'Niedostępna w źródle'
                  }}
                </dd>
              </dl>
              <p v-if="detail.expired" class="salary-warning">
                Minęła data wygaśnięcia podana przez źródło.
              </p>
              <p class="muted fine-print">
                Dostępność i data wygaśnięcia nie oznaczają zakończenia
                rekrutacji.
              </p>
            </section>
            <section class="detail-section">
              <h3>
                Historia zmian
                <span class="muted">({{ detail.revisions.length }})</span>
              </h3>
              <ol class="history-list">
                <li v-for="(r, i) in detail.revisions" :key="r.id">
                  <span>{{ timeLabel(r.at) }}</span>
                  <p>
                    {{
                      i === detail.revisions.length - 1
                        ? 'Pierwszy zapis ogłoszenia'
                        : 'Zapisano nową wersję ogłoszenia'
                    }}
                  </p>
                </li>
              </ol>
            </section>
          </template>
        </aside>
      </div>
    </main>
  </div>
</template>

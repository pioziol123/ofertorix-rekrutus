<script setup lang="ts">
import {
  emptyProfile,
  emptySkill,
  emptyExperience,
  expectationKeys,
  type ProfileData,
  type Proposal,
} from '../../modules/profile/view'
useHead({ title: 'Mój profil — Oferty pracy' })
type Version = {
  id: string
  number: number
  created_at: string
  data: ProfileData
}
type Draft = {
  revision: number
  base_version_id: string | null
  data: ProfileData
}
type Imported = {
  id: string
  kind: string
  original_name: string | null
  status: string
  error: string | null
  created_at: string
  source_text: string | null
  professional_text: string | null
  suggested_text: string
  text_revision: number
  proposal: Proposal | null
}
type ProfileState = {
  active: Version | null
  draft: Draft
  versions: Omit<Version, 'data'>[]
  imports: Imported[]
  aiConfigured: boolean
  budget: {
    month: string
    limit_pln: string
    spent: string
    reserved: string
  }[]
}
const {
  data: state,
  error: loadError,
  refresh,
} = await useFetch<ProfileState>('/api/profile')
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const form = ref<ProfileData>(clone(state.value?.draft.data ?? emptyProfile()))
const revision = ref(state.value?.draft.revision ?? 0)
const activeId = ref(state.value?.active?.id ?? null)
const saved = ref(JSON.stringify(form.value))
const dirty = computed(() => JSON.stringify(form.value) !== saved.value)
const step = ref(1),
  busy = ref(false),
  notice = ref(''),
  error = ref(''),
  reviewed = ref(false)
const remote = ref<ProfileState | null>(null)
const steps = [
  'Doświadczenie',
  'Umiejętności',
  'Kierunek',
  'Warunki',
  'Podsumowanie',
]
const selectedImport = ref(''),
  pasteText = ref(''),
  file = ref<File | null>(null),
  professionalText = ref('')
const imported = ref<Imported | null>(null)
const professionalTextEdited = ref(false)
const skillsChosen = reactive<Record<number, boolean>>({}),
  experienceChosen = reactive<Record<number, boolean>>({})
const skillTargets = reactive<Record<number, string>>({}),
  experienceTargets = reactive<Record<number, string>>({})
const summaryChosen = ref(false),
  historyVersion = ref<Version | null>(null)
const request = useRequestFetch()
function adopt(draft: Draft) {
  form.value = clone(draft.data)
  revision.value = draft.revision
  saved.value = JSON.stringify(form.value)
  reviewed.value = false
}
async function fail(cause: unknown) {
  const e = cause as {
    statusCode?: number
    data?: { data?: { issues?: { path: string[]; message: string }[] } }
  }
  error.value =
    e.statusCode === 409
      ? 'Profil został zmieniony w innej karcie. Twoje zmiany pozostają w formularzu. Porównaj nowszy szkic poniżej.'
      : 'Nie udało się zapisać. Sprawdź wpisane wartości; uzupełnij nazwę roli/technologii, popraw daty i pełne warunki wpisanej kwoty.'
  if (e.statusCode === 409)
    remote.value = await request<ProfileState>('/api/profile')
}
async function save(): Promise<boolean> {
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    const draft = await $fetch<Draft>('/api/profile/draft', {
      method: 'PUT',
      body: { data: form.value, expectedRevision: revision.value },
    })
    adopt(draft)
    remote.value = null
    notice.value = 'Szkic zapisany. Aktywny profil pozostaje bez zmian.'
    await refresh()
    return true
  } catch (cause) {
    await fail(cause)
    return false
  } finally {
    busy.value = false
  }
}
async function confirm() {
  if (!reviewed.value) return
  busy.value = true
  error.value = ''
  try {
    if (dirty.value && !(await save())) return
    busy.value = true
    await $fetch('/api/profile/confirm', {
      method: 'POST',
      body: {
        expectedRevision: revision.value,
        expectedActiveVersionId: activeId.value,
        commandId: crypto.randomUUID(),
      },
    })
    await refresh()
    if (state.value) {
      adopt(state.value.draft)
      activeId.value = state.value.active?.id ?? null
    }
    notice.value =
      'Profil zatwierdzony. Ta wersja będzie podstawą przyszłych ocen.'
  } catch (cause) {
    await fail(cause)
  } finally {
    busy.value = false
  }
}
async function acceptRemote() {
  if (!remote.value) return
  adopt(remote.value.draft)
  activeId.value = remote.value.active?.id ?? null
  remote.value = null
  error.value = ''
}
async function overwriteRemote() {
  if (!remote.value) return
  revision.value = remote.value.draft.revision
  activeId.value = remote.value.active?.id ?? null
  await save()
}
function duration(skill: ProfileData['skills'][number], event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  skill.experience = value
    ? { amount: value, unit: skill.experience?.unit ?? 'years' }
    : null
}
function splitTechnologies(
  item: ProfileData['experience'][number],
  event: Event,
) {
  item.technologies = (event.target as HTMLInputElement).value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}
function salaryContractChanged() {
  form.value.salary.basis = ''
  reviewed.value = false
}
const labels: Record<(typeof expectationKeys)[number], string> = {
  location: 'Lokalizacja',
  workMode: 'Tryb pracy',
  officeDays: 'Dni w biurze',
  hours: 'Wymiar i godziny pracy',
  languages: 'Języki pracy',
  timeZone: 'Strefa i godziny wspólne',
  onCall: 'Dyżury',
  companyType: 'Typ firmy',
  projectType: 'Typ projektu',
  polandEligibility: 'Praca z Polski',
}
const importance = (v: string) =>
  v === 'required' ? 'Konieczne' : 'Preferowane'
const skillLevel = (v: string | null) =>
  ({
    basic: 'Podstawowy',
    intermediate: 'Średni',
    advanced: 'Zaawansowany',
    expert: 'Ekspercki',
  })[v ?? ''] ?? 'Poziom nieokreślony'
const periodLabels: Record<string, string> = {
  Month: 'miesiąc',
  Hour: 'godzina',
  Year: 'rok',
  Day: 'dzień',
  Fixed: 'projekt',
}
const basisLabels: Record<string, string> = {
  gross: 'brutto',
  net: 'netto',
  net_plus_vat: 'netto + VAT',
}
const salaryValue = (v: ProfileData['salary']) =>
  v.state === 'unknown'
    ? 'Nieuzupełnione'
    : v.state === 'no_preference'
      ? 'Bez znaczenia'
      : `${v.minimum ?? '?'} ${v.currency} / ${periodLabels[v.period] ?? v.period} · ${v.contract} · ${basisLabels[v.basis] ?? v.basis} · ${importance(v.importance)}`
const expectationValue = (v: ProfileData['expectations']['location']) =>
  v.state === 'unknown'
    ? 'Nieuzupełnione'
    : v.state === 'no_preference'
      ? 'Bez znaczenia'
      : `${v.value} · ${importance(v.importance)}`
const dates = (value: string) =>
  new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Warsaw',
  }).format(new Date(value))
const statusLabels: Record<string, string> = {
  receiving: 'Zapisywanie pliku',
  queued: 'Czeka na odczyt',
  extracting: 'Odczytywanie CV',
  ready: 'Tekst gotowy',
  needs_text: 'Wklej tekst CV',
  failed: 'Błąd importu',
  source_missing: 'Brak pliku źródłowego',
  needs_configuration: 'Wymaga konfiguracji AI',
  ai_queued: 'Czeka na przygotowanie propozycji',
  ai_running: 'Przygotowywanie propozycji',
  waiting_budget: 'Czeka na środki w budżecie',
  proposal: 'Propozycja gotowa',
  needs_attention: 'Wymaga sprawdzenia',
}
async function loadImport(resetText = true) {
  const id = selectedImport.value
  if (resetText) {
    imported.value = null
    professionalText.value = ''
    professionalTextEdited.value = false
  }
  if (!id) {
    imported.value = null
    return
  }
  try {
    const result = await request<Imported>(`/api/profile/imports/${id}`)
    if (selectedImport.value !== id) return
    imported.value = result
    if (!professionalTextEdited.value)
      professionalText.value = result.suggested_text
    if (state.value)
      state.value.imports = state.value.imports.map((item) =>
        item.id === id
          ? { ...item, status: result.status, error: result.error }
          : item,
      )
  } catch {
    if (selectedImport.value === id)
      error.value = 'Nie udało się odczytać importu.'
  }
}
watch(selectedImport, () => {
  Object.keys(skillsChosen).forEach((k) =>
    Reflect.deleteProperty(skillsChosen, k),
  )
  Object.keys(experienceChosen).forEach((k) =>
    Reflect.deleteProperty(experienceChosen, k),
  )
  summaryChosen.value = false
  void loadImport()
})
async function importCv(kind: 'file' | 'text') {
  busy.value = true
  error.value = ''
  try {
    const result =
      kind === 'file' && file.value
        ? await $fetch<{ id: string }>('/api/profile/imports', {
            method: 'POST',
            query: { name: file.value.name },
            body: file.value,
            headers: { 'Content-Type': 'application/octet-stream' },
          })
        : await $fetch<{ id: string }>('/api/profile/imports', {
            method: 'POST',
            body: { text: pasteText.value },
          })
    selectedImport.value = result.id
    await refresh()
    notice.value = 'Źródło zapisane. Import nie zmienił aktywnego profilu.'
  } catch {
    error.value =
      'Nie udało się przyjąć CV. Dozwolone PDF/DOCX do 10 MiB lub tekst do 120 000 znaków.'
  } finally {
    busy.value = false
  }
}
async function prepare() {
  if (!imported.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/profile/imports/${imported.value.id}/prepare`, {
      method: 'POST',
      body: {
        text: professionalText.value,
        expectedRevision: imported.value.text_revision,
      },
    })
    await loadImport(false)
    await refresh()
  } catch {
    error.value =
      'Nie udało się przygotować propozycji. Sprawdź tekst lub stan istniejącej operacji.'
  } finally {
    busy.value = false
  }
}
async function apply() {
  if (!imported.value) return
  busy.value = true
  error.value = ''
  try {
    if (dirty.value && !(await save())) return
    busy.value = true
    const skills = Object.keys(skillsChosen)
        .map(Number)
        .filter((k) => skillsChosen[k]),
      experience = Object.keys(experienceChosen)
        .map(Number)
        .filter((k) => experienceChosen[k])
    const draft = await $fetch<Draft>(
      `/api/profile/imports/${imported.value.id}/apply`,
      {
        method: 'POST',
        body: {
          expectedRevision: revision.value,
          skills,
          experience,
          summary: summaryChosen.value,
          skillTargets: Object.fromEntries(
            skills
              .filter((i) => skillTargets[i])
              .map((i) => [i, skillTargets[i]]),
          ),
          experienceTargets: Object.fromEntries(
            experience
              .filter((i) => experienceTargets[i])
              .map((i) => [i, experienceTargets[i]]),
          ),
        },
      },
    )
    adopt(draft)
    notice.value =
      'Wybrane dane dodano do szkicu. Oczekiwania pozostają bez zmian.'
    await refresh()
  } catch (cause) {
    await fail(cause)
  } finally {
    busy.value = false
  }
}
async function showVersion(id: string) {
  historyVersion.value = await request<Version>(`/api/profile/versions/${id}`)
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (
      imported.value &&
      [
        'queued',
        'extracting',
        'ai_queued',
        'ai_running',
        'waiting_budget',
        'receiving',
      ].includes(imported.value.status)
    )
      void loadImport(false)
  }, 3000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="workspace">
    <header class="app-header">
      <NuxtLink to="/offers" class="brand"
        ><span class="brand-mark">o.</span>Oferty pracy</NuxtLink
      >
      <nav class="app-nav">
        <NuxtLink to="/offers">Oferty</NuxtLink
        ><NuxtLink to="/companies">Firmy</NuxtLink
        ><NuxtLink to="/profile" aria-current="page">Mój profil</NuxtLink>
      </nav>
    </header>
    <main class="profile-main">
      <div class="page-heading">
        <div>
          <p class="eyebrow">MOJA PODSTAWA DOPASOWANIA</p>
          <h1>Profil zawodowy</h1>
          <p class="muted">Twoje doświadczenie oraz praca, której szukasz.</p>
        </div>
        <div class="profile-state">
          <UBadge variant="subtle" color="neutral">{{
            state?.active
              ? `Aktywna wersja ${state.active.number}`
              : 'Brak zatwierdzonego profilu'
          }}</UBadge>
          <p>
            {{
              dirty
                ? 'Niezapisane zmiany'
                : revision
                  ? 'Szkic zapisany'
                  : 'Zacznij od dowolnej sekcji'
            }}
          </p>
        </div>
      </div>
      <p v-if="loadError" role="alert" class="notice">
        Nie udało się wczytać profilu. Odśwież stronę po sprawdzeniu połączenia.
      </p>
      <p v-if="notice" role="status" class="profile-success">{{ notice }}</p>
      <p v-if="error" role="alert" class="notice">{{ error }}</p>
      <section v-if="remote" class="profile-card conflict-panel">
        <h2>Nowszy szkic w bazie</h2>
        <p>{{ remote.draft.data.summary || 'Bez podsumowania' }}</p>
        <p>
          Technologie:
          {{
            remote.draft.data.skills.map((s) => s.name).join(', ') ||
            'Brak danych'
          }}
        </p>
        <p>
          Doświadczenie:
          {{
            remote.draft.data.experience
              .map((e) => `${e.role} (${e.company})`)
              .join('; ') || 'Brak danych'
          }}
        </p>
        <div class="profile-actions">
          <UButton variant="outline" @click="acceptRemote"
            >Przyjmij nowszy szkic</UButton
          ><UButton variant="soft" @click="overwriteRemote"
            >Zapisz moją treść zamiast nowszego szkicu</UButton
          >
        </div>
      </section>
      <div class="profile-layout">
        <aside class="profile-sidebar">
          <nav aria-label="Sekcje profilu">
            <button
              v-for="(name, i) in steps"
              :key="name"
              :class="{ active: step === i + 1 }"
              :aria-current="step === i + 1 ? 'step' : undefined"
              @click="step = i + 1"
            >
              <span>{{ i + 1 }}</span
              >{{ name }}
            </button>
          </nav>
          <p>
            Pola możesz pominąć i wrócić do nich później. Brak odpowiedzi
            pozostaje niewiadomą.
          </p>
          <UButton
            block
            variant="outline"
            :loading="busy"
            :disabled="!!loadError"
            @click="save"
            >Zapisz szkic</UButton
          >
        </aside>
        <div class="profile-content">
          <section v-if="step === 1" class="profile-card">
            <p class="eyebrow">1 / DOŚWIADCZENIE</p>
            <h2>Co już masz za sobą</h2>
            <p class="muted section-intro">
              Dodaj role i projekty ręcznie albo przygotuj dane na podstawie CV.
            </p>
            <label
              >Podsumowanie zawodowe<textarea
                v-model="form.summary"
                rows="4"
                maxlength="12000"
                placeholder="W czym się specjalizujesz? Za co odpowiadasz?"
              />
            </label>
            <article
              v-for="(item, i) in form.experience"
              :key="item.id"
              class="profile-entry"
              @input="item.source = null"
              @change="item.source = null"
            >
              <div class="entry-heading">
                <h3>Doświadczenie {{ i + 1 }}</h3>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @click="form.experience.splice(i, 1)"
                  >Usuń ze szkicu</UButton
                >
              </div>
              <div class="profile-grid">
                <label
                  >Rola / stanowisko<input
                    v-model="item.role"
                    maxlength="300"
                    placeholder="np. Senior PHP Developer" /></label
                ><label
                  >Firma lub projekt<input
                    v-model="item.company"
                    maxlength="300"
                    placeholder="Opcjonalnie" /></label
                ><label
                  >Początek<input
                    :value="item.start ?? ''"
                    placeholder="RRRR lub RRRR-MM"
                    @input="
                      item.start =
                        ($event.target as HTMLInputElement).value || null
                    " /></label
                ><label
                  >Koniec<input
                    :value="item.end ?? ''"
                    :disabled="item.ongoing"
                    placeholder="RRRR lub RRRR-MM"
                    @input="
                      item.end =
                        ($event.target as HTMLInputElement).value || null
                    "
                /></label>
              </div>
              <label class="profile-checkbox"
                ><input
                  v-model="item.ongoing"
                  type="checkbox"
                  @change="item.ongoing && (item.end = null)"
                />Nadal tu pracuję / rozwijam projekt</label
              >
              <label
                >Odpowiedzialność i osiągnięcia<textarea
                  v-model="item.description"
                  rows="4"
                  maxlength="12000"
                /></label
              ><label
                >Technologie, oddzielone przecinkami<input
                  :value="item.technologies.join(', ')"
                  @input="splitTechnologies(item, $event)"
              /></label>
            </article>
            <UButton
              variant="soft"
              @click="form.experience.push(emptyExperience())"
              >+ Dodaj doświadczenie lub projekt</UButton
            >
          </section>
          <section v-if="step === 1" class="profile-card">
            <h2>Uzupełnij na podstawie CV</h2>
            <p class="muted section-intro">
              Oryginały zostają lokalnie. Kolejny import nie zastępuje
              poprzedniego pliku ani aktywnego profilu.
            </p>
            <div class="profile-grid">
              <div>
                <label
                  >CV w PDF lub DOCX<input
                    type="file"
                    accept=".pdf,.docx"
                    @change="
                      file =
                        ($event.target as HTMLInputElement).files?.[0] ?? null
                    "
                /></label>
                <p class="field-note">
                  Do 10 MiB i 30 stron PDF. Skany bez tekstu wymagają wklejenia
                  treści.
                </p>
                <UButton
                  variant="outline"
                  :disabled="!file || busy"
                  @click="importCv('file')"
                  >Zapisz i odczytaj CV</UButton
                >
              </div>
              <div>
                <label
                  >Lub wklej tekst CV<textarea
                    v-model="pasteText"
                    rows="5"
                    maxlength="120000"
                  /></label
                ><UButton
                  variant="outline"
                  :disabled="!pasteText.trim() || busy"
                  @click="importCv('text')"
                  >Użyj wklejonego tekstu</UButton
                >
              </div>
            </div>
            <label v-if="state?.imports.length" class="import-selector"
              >Zapisane źródła<select v-model="selectedImport">
                <option value="">Wybierz import</option>
                <option
                  v-for="imp in state.imports"
                  :key="imp.id"
                  :value="imp.id"
                >
                  {{ imp.original_name ?? 'Wklejony tekst' }} ·
                  {{ dates(imp.created_at) }} ·
                  {{ statusLabels[imp.status] ?? imp.status }}
                </option>
              </select></label
            >
            <div v-if="imported" class="import-detail">
              <div class="entry-heading">
                <UBadge color="neutral" variant="subtle">{{
                  statusLabels[imported.status] ?? imported.status
                }}</UBadge
                ><a
                  v-if="imported.kind !== 'text'"
                  :href="`/api/profile/imports/${imported.id}/file`"
                  >Pobierz oryginał</a
                >
              </div>
              <p v-if="imported.error" class="notice">{{ imported.error }}</p>
              <details v-if="imported.source_text">
                <summary>Tekst odczytany lokalnie</summary>
                <p class="offer-description">{{ imported.source_text }}</p>
              </details>
              <template v-if="imported.source_text"
                ><label
                  >Tekst zawodowy do przygotowania propozycji<textarea
                    v-model="professionalText"
                    rows="8"
                    maxlength="120000"
                    @input="professionalTextEdited = true"
                  />
                </label>
                <p class="field-note">
                  Sprawdź tekst, a następnie kliknij „Przygotuj propozycję
                  profilu”. Zostaw informacje zawodowe; usuń kontakty i dane
                  osobowe. Tylko ta treść trafi do analizy, nie plik CV.
                </p>
                <p v-if="!state?.aiConfigured" class="notice">
                  Automatyczne przygotowanie propozycji wymaga lokalnej
                  konfiguracji AI. Możesz zapisać tekst i uzupełnić profil
                  ręcznie.
                </p>
                <UButton
                  :disabled="
                    busy ||
                    !professionalText.trim() ||
                    ['ai_queued', 'ai_running', 'waiting_budget'].includes(
                      imported.status,
                    )
                  "
                  @click="prepare"
                  >{{
                    state?.aiConfigured
                      ? 'Przygotuj propozycję profilu'
                      : 'Zapisz tekst do późniejszej analizy'
                  }}</UButton
                ></template
              >
              <section v-if="imported.proposal" class="proposal-section">
                <h3>Wybierz zmiany do szkicu</h3>
                <p class="field-note">
                  Żadna pozycja nie jest przyjmowana automatycznie. Poziom i
                  staż możesz uzupełnić samodzielnie.
                </p>
                <label v-if="imported.proposal.summary" class="profile-checkbox"
                  ><input v-model="summaryChosen" type="checkbox" />Zastąp
                  podsumowanie: {{ imported.proposal.summary }}</label
                >
                <article
                  v-for="(skill, i) in imported.proposal.skills"
                  :key="i"
                  class="proposal-item"
                >
                  <label class="profile-checkbox"
                    ><input v-model="skillsChosen[i]" type="checkbox" />{{
                      skill.name
                    }}</label
                  >
                  <p>{{ skill.description }}</p>
                  <blockquote>{{ skill.evidence }}</blockquote>
                  <label
                    >Po zastosowaniu<select v-model="skillTargets[i]">
                      <option value="">Dodaj jako nową umiejętność</option>
                      <option
                        v-for="s in form.skills"
                        :key="s.id"
                        :value="s.id"
                      >
                        Zastąp: {{ s.name }} — {{ s.description }}
                      </option>
                    </select></label
                  >
                </article>
                <article
                  v-for="(item, i) in imported.proposal.experience"
                  :key="i"
                  class="proposal-item"
                >
                  <label class="profile-checkbox"
                    ><input v-model="experienceChosen[i]" type="checkbox" />{{
                      item.role
                    }}
                    · {{ item.company }}</label
                  >
                  <p>{{ item.description }}</p>
                  <blockquote>{{ item.evidence }}</blockquote>
                  <label
                    >Po zastosowaniu<select v-model="experienceTargets[i]">
                      <option value="">Dodaj jako nowe doświadczenie</option>
                      <option
                        v-for="e in form.experience"
                        :key="e.id"
                        :value="e.id"
                      >
                        Zastąp: {{ e.role }} · {{ e.company }}
                      </option>
                    </select></label
                  >
                </article>
                <UButton :loading="busy" @click="apply"
                  >Zastosuj wybrane dane do szkicu</UButton
                >
              </section>
            </div>
          </section>
          <section v-if="step === 2" class="profile-card">
            <p class="eyebrow">2 / UMIEJĘTNOŚCI</p>
            <h2>Technologie, z którymi pracujesz</h2>
            <p class="muted section-intro">
              Poziom, staż i ostatnie użycie są opcjonalne. Sama nazwa w CV nie
              określa Twojej biegłości.
            </p>
            <article
              v-for="(skill, i) in form.skills"
              :key="skill.id"
              class="profile-entry"
              @input="skill.source = null"
              @change="skill.source = null"
            >
              <div class="entry-heading">
                <h3>Umiejętność {{ i + 1 }}</h3>
                <UButton
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  @click="form.skills.splice(i, 1)"
                  >Usuń ze szkicu</UButton
                >
              </div>
              <div class="profile-grid">
                <label
                  >Technologia<input
                    v-model="skill.name"
                    maxlength="300"
                    placeholder="np. PHP" /></label
                ><label
                  >Poziom znajomości<select v-model="skill.proficiency">
                    <option :value="null">Nie określam</option>
                    <option value="basic">Podstawowy</option>
                    <option value="intermediate">Średni</option>
                    <option value="advanced">Zaawansowany</option>
                    <option value="expert">Ekspercki</option>
                  </select></label
                ><label
                  >Przybliżony czas doświadczenia<input
                    :value="skill.experience?.amount ?? ''"
                    inputmode="decimal"
                    placeholder="np. 5"
                    @input="duration(skill, $event)" /></label
                ><label
                  >Jednostka<select
                    :value="skill.experience?.unit ?? 'years'"
                    :disabled="!skill.experience"
                    @change="
                      skill.experience &&
                      (skill.experience.unit = (
                        $event.target as HTMLSelectElement
                      ).value as 'months' | 'years')
                    "
                  >
                    <option value="years">Lata</option>
                    <option value="months">Miesiące</option>
                  </select></label
                ><label
                  >Ostatnie użycie<select
                    v-model="skill.lastUsed.state"
                    @change="skill.lastUsed.date = null"
                  >
                    <option value="unknown">Nie określam</option>
                    <option value="current">Używam obecnie</option>
                    <option value="date">Podam rok lub miesiąc</option>
                  </select></label
                ><label v-if="skill.lastUsed.state === 'date'"
                  >Kiedy?<input
                    v-model="skill.lastUsed.date"
                    placeholder="RRRR lub RRRR-MM"
                /></label>
              </div>
              <label
                >Jak wykorzystujesz tę technologię?<textarea
                  v-model="skill.description"
                  rows="3"
                  maxlength="12000"
                />
              </label>
            </article>
            <UButton variant="soft" @click="form.skills.push(emptySkill())"
              >+ Dodaj technologię</UButton
            >
            <p v-if="!form.skills.length" class="field-note">
              Brak zapisanych technologii nie oznacza braku umiejętności.
            </p>
          </section>
          <section v-if="step === 3" class="profile-card">
            <p class="eyebrow">3 / KIERUNEK ZAWODOWY</p>
            <h2>Jakiej pracy szukasz</h2>
            <p class="muted section-intro">
              Kierunek rozwoju jest oddzielony od dotychczasowego doświadczenia.
            </p>
            <label
              >Poszukiwane role<textarea
                v-model="form.goals.roles"
                rows="3"
                maxlength="12000"
                placeholder="np. Backend PHP, role związane z agentami AI"
              /></label
            ><label
              >Poziom stanowiska<input
                v-model="form.goals.seniority"
                maxlength="300"
                placeholder="np. Senior" /></label
            ><label
              >Technologie, które chcesz rozwijać<textarea
                v-model="form.goals.technologies"
                rows="3"
                maxlength="12000"
              /></label
            ><label
              >Co jest dla Ciebie ważne w kolejnym kroku?<textarea
                v-model="form.goals.description"
                rows="5"
                maxlength="12000"
              />
            </label>
          </section>
          <section v-if="step === 4" class="profile-card">
            <p class="eyebrow">4 / WARUNKI I PREFERENCJE</p>
            <h2>Twoje oczekiwania</h2>
            <p class="muted section-intro">
              Nieuzupełnione oznacza niewiadomą. „Bez znaczenia” jest świadomym
              brakiem ograniczenia.
            </p>
            <article class="profile-entry">
              <h3>Wynagrodzenie — jedno minimum dla wybranego kontraktu</h3>
              <label
                >Oczekiwanie<select v-model="form.salary.state">
                  <option value="unknown">Nieuzupełnione</option>
                  <option value="no_preference">Bez znaczenia</option>
                  <option value="specified">Określam minimum</option>
                </select></label
              >
              <div
                v-if="form.salary.state === 'specified'"
                class="profile-grid"
              >
                <label
                  >Znaczenie<select v-model="form.salary.importance">
                    <option value="required">Konieczne</option>
                    <option value="preferred">Preferowane</option>
                  </select></label
                ><label
                  >Kontrakt<select
                    v-model="form.salary.contract"
                    @change="salaryContractChanged"
                  >
                    <option value="">Wybierz</option>
                    <option>B2B</option>
                    <option>UoP</option>
                    <option>UZ</option>
                    <option>UoD</option>
                    <option>Kontrakt</option>
                    <option>Inne</option>
                  </select></label
                ><label
                  >Minimalna kwota<input
                    v-model="form.salary.minimum"
                    inputmode="decimal"
                    placeholder="np. 25000" /></label
                ><label
                  >Waluta<select v-model="form.salary.currency">
                    <option value="">Wybierz</option>
                    <option>PLN</option>
                    <option>EUR</option>
                    <option>USD</option>
                    <option>GBP</option>
                    <option>CHF</option>
                  </select></label
                ><label
                  >Okres<select v-model="form.salary.period">
                    <option value="">Wybierz</option>
                    <option value="Month">Miesięcznie</option>
                    <option value="Year">Rocznie</option>
                    <option value="Hour">Godzinowo</option>
                    <option value="Day">Dziennie</option>
                    <option value="Fixed">Za projekt</option>
                  </select></label
                ><label
                  >Podstawa kwoty<select v-model="form.salary.basis">
                    <option value="">Wybierz</option>
                    <option value="gross">Brutto</option>
                    <option value="net">Netto</option>
                    <option value="net_plus_vat">Netto + VAT</option>
                  </select></label
                >
              </div>
            </article>
            <article
              v-for="key in expectationKeys"
              :key="key"
              class="expectation-entry"
            >
              <h3>{{ labels[key] }}</h3>
              <div class="profile-grid">
                <label
                  >Oczekiwanie<select v-model="form.expectations[key].state">
                    <option value="unknown">Nieuzupełnione</option>
                    <option value="no_preference">Bez znaczenia</option>
                    <option value="specified">Określam</option>
                  </select></label
                ><label v-if="form.expectations[key].state === 'specified'"
                  >Znaczenie<select v-model="form.expectations[key].importance">
                    <option value="required">Konieczne</option>
                    <option value="preferred">Preferowane</option>
                  </select></label
                >
              </div>
              <label v-if="form.expectations[key].state === 'specified'"
                >Warunek<textarea
                  v-model="form.expectations[key].value"
                  rows="2"
                  maxlength="12000"
                />
              </label>
            </article>
            <label
              >Jawne wykluczenia<textarea
                v-model="form.exclusions"
                rows="4"
                maxlength="12000"
                placeholder="Czego zdecydowanie nie chcesz? Możesz zostawić puste."
              />
            </label>
          </section>
          <section v-if="step === 5" class="profile-card">
            <p class="eyebrow">5 / PRZEGLĄD I ZATWIERDZENIE</p>
            <h2>Sprawdź profil przed aktywacją</h2>
            <p class="muted section-intro">
              Zatwierdzenie tworzy nową wersję. Dotychczasowe wersje i źródłowe
              CV pozostają zachowane.
            </p>
            <h3>Podsumowanie zawodowe</h3>
            <p class="offer-description">
              {{ form.summary || 'Nieuzupełnione' }}
            </p>
            <h3>Doświadczenie</h3>
            <ul class="profile-summary-list">
              <li v-for="item in form.experience" :key="item.id">
                <strong>{{ item.role || 'Rola bez nazwy' }}</strong> ·
                {{ item.company || 'Firma niepodana' }}
                <p>
                  {{ item.start ?? '?' }} —
                  {{ item.ongoing ? 'obecnie' : (item.end ?? '?') }}
                </p>
                <p>{{ item.description }}</p>
              </li>
              <li v-if="!form.experience.length" class="muted">
                Brak zapisanych pozycji
              </li>
            </ul>
            <h3>Technologie</h3>
            <div class="skill-tags">
              <span v-for="s in form.skills" :key="s.id" class="skill-tag"
                >{{ s.name || 'Bez nazwy'
                }}{{
                  s.proficiency
                    ? ` · ${skillLevel(s.proficiency)}`
                    : ' · poziom nieokreślony'
                }}</span
              >
            </div>
            <h3>Kierunek</h3>
            <p>
              {{ form.goals.roles || 'Role nieuzupełnione' }} ·
              {{ form.goals.seniority || 'Seniority nieuzupełnione' }}
            </p>
            <p>{{ form.goals.description }}</p>
            <h3>Wynagrodzenie</h3>
            <p>
              {{
                form.salary.state === 'unknown'
                  ? 'Nieuzupełnione'
                  : form.salary.state === 'no_preference'
                    ? 'Bez znaczenia'
                    : `${salaryValue(form.salary)}`
              }}
            </p>
            <dl class="profile-review">
              <template v-for="key in expectationKeys" :key="key"
                ><dt>{{ labels[key] }}</dt>
                <dd>
                  {{ expectationValue(form.expectations[key]) }}
                </dd></template
              >
              <dt>Wykluczenia</dt>
              <dd>{{ form.exclusions || 'Nieuzupełnione' }}</dd>
            </dl>
            <label class="profile-checkbox review-checkbox"
              ><input v-model="reviewed" type="checkbox" />Przejrzałem dane i
              chcę zatwierdzić tę wersję profilu.</label
            ><UButton
              size="lg"
              :loading="busy"
              :disabled="!reviewed || !!loadError"
              @click="confirm"
              >Zatwierdź profil</UButton
            >
          </section>
          <div class="profile-bottom">
            <UButton
              v-if="step > 1"
              variant="outline"
              color="neutral"
              @click="step--"
              >Poprzednia sekcja</UButton
            ><UButton v-if="step < 5" @click="step++"
              >Dalej: {{ steps[step] }}</UButton
            ><UButton
              variant="ghost"
              color="neutral"
              :loading="busy"
              @click="save"
              >Zapisz szkic</UButton
            >
          </div>
          <section v-if="state?.versions.length" class="profile-card">
            <h2>Historia zatwierdzonych wersji</h2>
            <div class="version-buttons">
              <UButton
                v-for="v in state.versions"
                :key="v.id"
                variant="outline"
                color="neutral"
                @click="showVersion(v.id)"
                >Wersja {{ v.number }} · {{ dates(v.created_at) }}</UButton
              >
            </div>
            <div v-if="historyVersion" class="historical-profile">
              <h3>Wersja {{ historyVersion.number }}</h3>
              <p>
                {{
                  historyVersion.data.summary || 'Podsumowanie nieuzupełnione'
                }}
              </p>
              <p>
                Technologie:
                {{
                  historyVersion.data.skills.map((s) => s.name).join(', ') ||
                  'Brak danych'
                }}
              </p>
              <p>
                Role:
                {{
                  historyVersion.data.experience
                    .map((e) => `${e.role} · ${e.company}`)
                    .join('; ') || 'Brak danych'
                }}
              </p>
              <p>
                Kierunek:
                {{ historyVersion.data.goals.roles || 'Nieuzupełniony' }}
              </p>
              <dl class="profile-review">
                <template v-for="key in expectationKeys" :key="key"
                  ><dt>{{ labels[key] }}</dt>
                  <dd>
                    {{
                      expectationValue(historyVersion.data.expectations[key])
                    }}
                  </dd></template
                >
              </dl>
              <p>
                Wykluczenia:
                {{ historyVersion.data.exclusions || 'Nieuzupełnione' }}
              </p>
              <h4>Wynagrodzenie</h4>
              <p>{{ salaryValue(historyVersion.data.salary) }}</p>
              <h4>Szczegóły umiejętności</h4>
              <article v-for="s in historyVersion.data.skills" :key="s.id">
                <strong>{{ s.name }} · {{ skillLevel(s.proficiency) }}</strong>
                <p>
                  Doświadczenie:
                  {{
                    s.experience
                      ? `${s.experience.amount} ${s.experience.unit === 'years' ? 'lat' : 'miesięcy'}`
                      : 'Niepodane'
                  }}. Ostatnie użycie:
                  {{
                    s.lastUsed.state === 'current'
                      ? 'Obecnie'
                      : (s.lastUsed.date ?? 'Niepodane')
                  }}.
                </p>
                <p>{{ s.description }}</p>
                <blockquote v-if="s.source">
                  Źródło: {{ s.source.evidence }}
                </blockquote>
              </article>
              <h4>Szczegóły doświadczenia</h4>
              <article v-for="e in historyVersion.data.experience" :key="e.id">
                <strong>{{ e.role }} · {{ e.company }}</strong>
                <p>
                  {{ e.start ?? '?' }} —
                  {{ e.ongoing ? 'obecnie' : (e.end ?? '?') }}
                </p>
                <p>{{ e.description }}</p>
                <p>{{ e.technologies.join(', ') }}</p>
                <blockquote v-if="e.source">
                  Źródło: {{ e.source.evidence }}
                </blockquote>
              </article>
              <p>
                Seniority:
                {{ historyVersion.data.goals.seniority || 'Nieuzupełnione' }}
              </p>
              <p>
                Technologie do rozwoju:
                {{ historyVersion.data.goals.technologies || 'Nieuzupełnione' }}
              </p>
              <p>{{ historyVersion.data.goals.description }}</p>
              <p
                v-for="id in historyVersion.data.sources.filter((id) =>
                  state?.imports.some((i) => i.id === id && i.kind !== 'text'),
                )"
                :key="id"
              >
                <a :href="`/api/profile/imports/${id}/file`"
                  >Zachowany plik CV</a
                >
              </p>
            </div>
          </section>
          <section v-if="state?.budget.length" class="profile-card">
            <h2>Budżet AI</h2>
            <p class="field-note">
              Koszt księgowy to konserwatywne oszacowanie na podstawie użycia
              tokenów. Nieznany koszt pozostaje zarezerwowany.
            </p>
            <div v-for="b in state.budget" :key="b.month" class="budget-row">
              <strong>{{ b.month }}</strong
              ><span>Limit {{ b.limit_pln }} PLN</span
              ><span>Rozliczone {{ b.spent }} PLN</span
              ><span>Zarezerwowane {{ b.reserved }} PLN</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

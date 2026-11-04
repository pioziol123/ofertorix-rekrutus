<script setup lang="ts">
import {
  researchTopicLabels,
  researchKindLabels,
  researchScopeLabels,
  researchTopics,
} from '../../lib/companies/research-model'
const props = defineProps<{ companyId: string }>()
const { data, error, refresh } = await useFetch(
  () => `/api/companies/${props.companyId}/research`,
)
const busy = ref(false),
  message = ref(''),
  selected = ref('')
const operations = computed(() => data.value?.operations ?? [])
const active = computed(() =>
  operations.value.find((o) =>
    ['waiting_budget', 'queued', 'running'].includes(o.state),
  ),
)
const completed = computed(() =>
  operations.value.filter((o) => o.state === 'completed'),
)
const current = computed(
  () =>
    [...completed.value].sort((a, b) =>
      (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''),
    )[0],
)
const shown = computed(
  () => completed.value.find((o) => o.id === selected.value) ?? current.value,
)
const latestFailure = computed(() =>
  operations.value.find(
    (o) => o.error && (!current.value || o.createdAt > current.value.createdAt),
  ),
)
const states: Record<string, string> = {
  waiting_budget: 'Czeka na dostępny budżet',
  queued: 'Czeka na wykonanie',
  running: 'Trwa zbieranie źródeł i przygotowywanie raportu',
  completed: 'Gotowy',
  failed: 'Nie udało się przygotować raportu',
  unknown: 'Przerwano — koszt wymaga sprawdzenia',
}
const date = (v: string) => new Date(v).toLocaleString('pl-PL')
const money = (v: string) =>
  new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    maximumFractionDigits: 4,
  }).format(Number(v))
let pending: { id: string; refresh: boolean } | null = null
async function start(renew: boolean) {
  busy.value = true
  message.value = ''
  if (!pending || pending.refresh !== renew)
    pending = { id: crypto.randomUUID(), refresh: renew }
  try {
    await $fetch(`/api/companies/${props.companyId}/research`, {
      method: 'POST',
      body: { commandId: pending.id, refresh: renew },
    })
    pending = null
    await refresh()
  } catch {
    message.value =
      'Nie udało się zlecić researchu. Sprawdź konfigurację i odśwież stan przed ponowieniem.'
  } finally {
    busy.value = false
  }
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (active.value) void refresh()
  }, 5000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>
<template>
  <section class="company-section research-panel">
    <h2>Research podstawowy</h2>
    <p class="muted">
      Raport dotyczy tego profilu firmy. Nie ustala automatycznie pracodawcy ani
      klienta. Dane z wyszukiwania mogą zawierać deklaracje firmy i wymagają
      oceny.
    </p>
    <p v-if="error" role="alert" class="notice">
      Nie udało się odczytać stanu researchu.
    </p>
    <p v-if="message" role="alert" class="notice">{{ message }}</p>
    <p v-if="data && !data.configured" class="notice">
      Research wymaga skonfigurowania modelu i cen na serwerze
      (AI_RESEARCH_PRICING_JSON). Zapisane raporty pozostają dostępne.
    </p>
    <p v-if="data?.ceiling" class="muted">
      Maksymalna rezerwacja: {{ money(data.ceiling) }} ze wspólnego miesięcznego
      budżetu AI. Do OpenAI trafia nazwa, rodzaj, strona i opis firmy.
    </p>
    <p v-if="active" role="status" class="notice">{{ states[active.state] }}</p>
    <p v-if="latestFailure" role="alert" class="notice">
      {{ latestFailure.error }}
      {{
        latestFailure.costState === 'unknown'
          ? 'Rezerwacja kosztu pozostaje zajęta.'
          : ''
      }}
    </p>
    <div class="research-actions">
      <UButton
        v-if="!current"
        :disabled="!data?.configured || !!active"
        :loading="busy"
        @click="start(false)"
        >Uruchom research podstawowy</UButton
      >
      <UButton
        v-else
        :disabled="!data?.configured || !!active"
        :loading="busy"
        variant="outline"
        @click="start(true)"
        >Odśwież research — nowy koszt</UButton
      >
      <UButton variant="ghost" @click="refresh()">Sprawdź stan</UButton>
    </div>
    <template v-if="shown?.report">
      <label v-if="completed.length > 1" class="profile-label"
        >Wersja raportu
        <select v-model="selected" class="profile-input">
          <option value="">
            Aktualna · {{ current ? date(current.finishedAt!) : '' }}
          </option>
          <option
            v-for="version in completed"
            :key="version.id"
            :value="version.id"
          >
            {{ date(version.finishedAt!) }}
          </option>
        </select>
      </label>
      <p class="small-label">
        {{ date(shown.finishedAt!) }} ·
        {{ shown.id === current?.id ? 'Aktualny raport' : 'Wersja historyczna'
        }}<template v-if="shown.cost">
          · Konserwatywne rozliczenie: {{ money(shown.cost) }}</template
        >
      </p>
      <p v-if="shown.costState === 'unknown'" class="notice">
        Raport gotowy, ale koszt nie został potwierdzony i pozostaje
        zarezerwowany.
      </p>
      <p class="notice">{{ shown.report.identity }}</p>
      <section
        v-for="topic in researchTopics"
        :key="topic"
        class="research-topic"
      >
        <h3>{{ researchTopicLabels[topic] }}</h3>
        <article
          v-for="(claim, index) in shown.report.claims.filter(
            (c) => c.topic === topic,
          )"
          :key="index"
          class="research-claim"
        >
          <p class="small-label">
            {{ researchKindLabels[claim.kind] }} ·
            {{ researchScopeLabels[claim.scope] }}
          </p>
          <p>{{ claim.text }}</p>
          <ul v-if="claim.sources.length" class="research-sources">
            <li v-for="source in claim.sources" :key="source.url">
              <a :href="source.url" target="_blank" rel="noopener noreferrer"
                >{{ source.title }} ↗</a
              ><span class="muted">
                ·
                {{
                  source.kind === 'page'
                    ? 'Odczyt strony'
                    : 'Wynik wyszukiwania'
                }}
                · {{ date(source.accessedAt) }}</span
              >
            </li>
          </ul>
        </article>
      </section>
    </template>
    <p v-else-if="!active" class="muted">
      Nie przygotowano jeszcze raportu. Nieznane technologie i warunki pozostają
      niewiadomą.
    </p>
    <details v-if="operations.length" class="research-history">
      <summary>Historia zleceń ({{ operations.length }})</summary>
      <p v-for="operation in operations" :key="operation.id">
        {{ date(operation.createdAt) }} · {{ states[operation.state]
        }}<template v-if="operation.reserved">
          · Rezerwacja {{ money(operation.reserved) }}</template
        ><template v-if="operation.error"> · {{ operation.error }}</template>
      </p>
    </details>
    <p class="muted">
      Research pogłębiony i przygotowanie do konkretnej rozmowy to kolejne
      etapy.
    </p>
  </section>
</template>

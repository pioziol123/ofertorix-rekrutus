<script setup lang="ts">
import {
  researchTopicLabels,
  researchKindLabels,
  researchScopeLabels,
  researchTopics,
  hasSourcedFindings,
  researchActiveStates,
  researchStateLabels as states,
} from '../../modules/companies/view'
const props = defineProps<{ companyId: string }>()
const { data, error, refresh } = await useFetch(
  () => `/api/companies/${props.companyId}/research`,
)
const busy = ref(false),
  message = ref(''),
  selected = ref('')
const operations = computed(() => data.value?.operations ?? [])
const active = computed(() =>
  operations.value.find((o) => researchActiveStates.includes(o.state)),
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
const date = (v: string) => new Date(v).toLocaleString('pl-PL')
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
      Research wymaga klucza OpenAI na serwerze (OPENAI_API_KEY). Zapisane
      raporty pozostają dostępne.
    </p>
    <!-- ASSUMPTION(oferty-pracy-sq2.10/ASM-2): no amount, not even the most
      one research reserves; only what is sent to OpenAI. -->
    <p v-if="data?.configured" class="muted">
      Do OpenAI trafia nazwa, rodzaj, strona i opis firmy.
    </p>
    <p v-if="active" role="status" class="notice">{{ states[active.state] }}</p>
    <p v-if="latestFailure" role="alert" class="notice">
      {{ latestFailure.error }}
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
      <p v-if="!hasSourcedFindings(shown.report)" role="alert" class="notice">
        Research nie dostarczył żadnych ustaleń popartych źródłami. Ten
        historyczny wynik zawiera wyłącznie niewiadome lub przypuszczenia i nie
        stanowi gotowego researchu firmy. Ponowienie przyciskiem „Odśwież
        research” wiąże się z nowym kosztem.
      </p>
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
        {{
          !hasSourcedFindings(shown.report)
            ? 'Brak ustaleń ze źródłami'
            : shown.id === current?.id
              ? 'Aktualny raport'
              : 'Wersja historyczna'
        }}
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
        }}<template v-if="operation.error"> · {{ operation.error }}</template>
      </p>
    </details>
    <p class="muted">
      Research pogłębiony i przygotowanie do konkretnej rozmowy to kolejne
      etapy.
    </p>
  </section>
</template>

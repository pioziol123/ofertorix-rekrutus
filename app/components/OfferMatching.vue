<script setup lang="ts">
import {
  matchingCriterionLabel,
  matchingPending,
} from '../../lib/matching/view'
const props = defineProps<{ offerId: string; refreshVersion?: number }>()
const emit = defineEmits<{ updated: [] }>()
const { data, refresh, error } = await useFetch(
  () => `/api/offers/${encodeURIComponent(props.offerId)}/matching`,
)
watch(
  () => props.refreshVersion,
  () => {
    void refresh()
  },
)
const busy = ref(false),
  message = ref('')
const pending = computed(() =>
  data.value?.history.some((row) =>
    matchingPending.some((state) => state === row.state),
  ),
)
const money = (value: string) =>
  Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 6 })
const current = computed(() => data.value?.current)
// ASSUMPTION(oferty-pracy-0mq.21/ASM-3): one in-progress state replaces the
// steps of the former batch path.
const labels: Record<string, string> = {
  waiting_budget: 'Czeka na budżet',
  queued: 'W kolejce',
  running: 'Ocena w toku',
  completed: 'Ocena gotowa',
  failed: 'Ocena nie powiodła się',
  unknown: 'Wysyłka lub koszt wymagają sprawdzenia',
  excluded: 'Niezgodność z wymaganiem koniecznym',
}
const groups: Record<string, string> = {
  technologies: 'Technologie',
  experience: 'Doświadczenie',
  conditions: 'Warunki',
  direction: 'Kierunek zawodowy',
}
async function ratingUpdated() {
  await refresh()
  emit('updated')
}
async function assess() {
  busy.value = true
  message.value = ''
  try {
    const result = await $fetch(
      `/api/offers/${encodeURIComponent(props.offerId)}/matching`,
      { method: 'POST', body: {} },
    )
    message.value = result.reused
      ? 'Ocena tej oferty już oczekuje.'
      : 'Zapisano zlecenie oceny.'
    await refresh()
    emit('updated')
  } catch (e) {
    const response = e as { data?: { data?: { message?: string } } }
    message.value =
      response.data?.data?.message ??
      'Nie udało się zlecić oceny. Sprawdź profil, konfigurację i kolejkę.'
  } finally {
    busy.value = false
  }
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (pending.value) void refresh()
  }, 5000)
})
onUnmounted(() => clearInterval(timer))
</script>
<template>
  <section class="detail-section" aria-label="Dopasowanie do profilu">
    <h3>Dopasowanie do profilu</h3>
    <p>
      Ocena wykorzystuje zatwierdzony profil i treść ogłoszenia. Wymagania bez
      wystarczających danych pozostają do sprawdzenia.
    </p>
    <p v-if="error" role="alert">Nie udało się wczytać ocen.</p>
    <p v-if="data && !data.configured" class="notice">
      <!-- ASSUMPTION(oferty-pracy-0mq.21/ASM-3): no longer the Batch price list. -->
      Oceny AI wymagają konfiguracji modelu i cennika.
    </p>
    <p v-if="data && !data.profileReady" class="notice">
      Najpierw zatwierdź <NuxtLink to="/profile">profil zawodowy</NuxtLink>.
    </p>
    <p v-if="data?.maximumCostPln">
      Maksymalna rezerwacja na ocenę:
      {{
        Number(data.maximumCostPln).toLocaleString('pl-PL', {
          maximumFractionDigits: 6,
        })
      }}
      zł. Koszt zostanie rozliczony według zużycia.
    </p>
    <UButton
      :loading="busy"
      :disabled="!data?.configured || !data?.profileReady || pending"
      @click="assess"
      >{{ current ? 'Oceń ponownie' : 'Oceń ofertę' }}</UButton
    >
    <p v-if="message" role="status">{{ message }}</p>
    <div v-if="data?.history[0]" class="notice" role="status">
      <strong>{{
        labels[data.history[0].state] ?? data.history[0].state
      }}</strong>
      <p v-if="data.history[0].state === 'unknown'">
        Przed kolejnym zleceniem sprawdź stan wykonania u dostawcy. Ponowna
        ocena może wygenerować dodatkowy koszt.
      </p>
      <p v-if="data.history[0].error">{{ data.history[0].error }}</p>
      <p v-for="check in data.history[0].checks" :key="check.criterion">
        {{ matchingCriterionLabel(check.criterion) }}:
        {{
          check.state === 'match'
            ? 'zgodność'
            : check.state === 'conflict'
              ? 'niezgodność'
              : 'do sprawdzenia'
        }}
        — {{ check.reason }}
      </p>
    </div>
    <div v-if="current?.calculation">
      <p>
        <strong>{{
          current.calculation.rating === null
            ? 'Brak podstaw do ratingu'
            : `${current.calculation.rating}/100`
        }}</strong>
        · Kompletność {{ current.calculation.completeness }}%
      </p>
      <p v-if="current.stale" class="notice">
        Ocena nieaktualna — profil lub ogłoszenie zmieniły się od jej
        przygotowania.
      </p>
      <p>
        Źródło oceny:
        {{ current.assessment_author === 'owner' ? 'Twoja ocena' : 'AI' }} ·
        Wagi v{{ current.weights_number }}
      </p>
      <p>{{ current.result?.summary }}</p>
      <ul>
        <li v-for="part in current.calculation.components" :key="part.group">
          {{ groups[part.group] }}:
          {{ part.score === null ? 'niewiadoma' : `${part.score}/100` }} ·
          kompletność {{ part.completeness }}%
        </li>
      </ul>
      <p v-for="strength in current.result?.strengths" :key="strength">
        Mocna strona: {{ strength }}
      </p>
      <p v-for="gap in current.result?.gaps" :key="gap">Luka: {{ gap }}</p>
      <details>
        <summary>Uzasadnienia i dowody</summary>
        <div v-for="criterion in current.result?.criteria" :key="criterion.id">
          <strong
            >{{
              matchingCriterionLabel(
                current.criteria?.find((c) => c.id === criterion.id)?.label ??
                  criterion.id,
              )
            }}
            ·
            {{
              criterion.score === null ? 'niewiadoma' : `${criterion.score}/100`
            }}</strong
          >
          <p>{{ criterion.reason }}</p>
          <blockquote v-if="criterion.profileEvidence">
            Profil: {{ criterion.profileEvidence }}
          </blockquote>
          <blockquote v-if="criterion.offerEvidence">
            Ogłoszenie: {{ criterion.offerEvidence }}
          </blockquote>
        </div>
      </details>
    </div>
    <OfferManualRating
      :key="offerId"
      :offer-id="offerId"
      @updated="ratingUpdated"
    />
    <details v-if="data?.ratings.length">
      <summary>Historia ocen ({{ data.ratings.length }})</summary>
      <div v-for="row in data.ratings" :key="row.id" class="detail-section">
        <p>
          {{ new Date(row.created_at).toLocaleString('pl-PL') }} ·
          {{
            row.author === 'owner'
              ? 'Twoja ocena'
              : row.author === 'system'
                ? 'Przeliczenie wag'
                : 'AI'
          }}<span v-if="row.is_current"> · aktualnie wybrana</span
          ><span v-if="row.stale"> · nieaktualne dane</span>
        </p>
        <p>
          {{ row.reason }} · Rating
          {{ row.calculation.rating ?? 'niewiadoma' }}/100 · kompletność
          {{ row.calculation.completeness }}%
        </p>
        <p>
          Profil v{{ row.profile_number }} · ogłoszenie z
          {{ new Date(row.offer_version_at).toLocaleString('pl-PL') }} · wagi
          v{{ row.weights_number }}
        </p>
        <p>
          Technologie {{ row.weights.technologies }}%, doświadczenie
          {{ row.weights.experience }}%, warunki {{ row.weights.conditions }}%,
          kierunek {{ row.weights.direction }}%
        </p>
        <details>
          <summary>Treść oceny i uzasadnienia</summary>
          <p>{{ row.result.summary }}</p>
          <p v-for="criterion in row.result.criteria" :key="criterion.id">
            {{
              matchingCriterionLabel(
                row.criteria.find((c) => c.id === criterion.id)?.label ??
                  criterion.id,
              )
            }}
            · {{ criterion.score ?? 'niewiadoma' }}: {{ criterion.reason }}
          </p>
        </details>
      </div>
    </details>
    <details v-if="data?.history.length">
      <summary>Historia zleceń AI ({{ data.history.length }})</summary>
      <div v-for="row in data.history" :key="row.id">
        <p>
          {{ new Date(row.created_at).toLocaleString('pl-PL') }} ·
          {{ labels[row.state] }}
          <span v-if="row.stale">· nieaktualne wejście</span>
        </p>
        <p v-if="row.calculation">
          {{ row.calculation.rating ?? 'Brak ratingu' }} · kompletność
          {{ row.calculation.completeness }}%
        </p>
        <p v-if="row.result">{{ row.result.summary }}</p>
        <p v-if="row.cost">
          Koszt:
          {{
            row.cost.actual === null
              ? `zarezerwowano ${money(row.cost.reserved)} zł, nierozliczony`
              : `${money(row.cost.actual)} zł`
          }}
        </p>
        <p>
          <a
            :href="`/api/matching/${encodeURIComponent(row.id)}/archive`"
            download
          >
            Pobierz archiwum całej partii (JSON)
          </a>
        </p>
        <details v-if="row.result">
          <summary>Pełna ocena historyczna</summary>
          <pre style="white-space: pre-wrap">{{
            JSON.stringify(row.result, null, 2)
          }}</pre>
        </details>
        <p>
          Profil v{{ row.profile_number }} · ogłoszenie z
          {{ new Date(row.offer_version_at).toLocaleString('pl-PL') }}
        </p>
        <small>Zlecenie {{ row.id }}</small>
      </div>
    </details>
  </section>
</template>

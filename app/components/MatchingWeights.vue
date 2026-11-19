<script setup lang="ts">
import { weightsSchema, type Weights } from '../../modules/matching/view'
const emit = defineEmits<{ updated: [] }>()
const { data, refresh, error } = await useFetch('/api/matching/weights')
const draft = ref<Weights | null>(null),
  busy = ref(false),
  message = ref('')
const labels = {
  technologies: 'Technologie',
  experience: 'Doświadczenie',
  conditions: 'Warunki',
  direction: 'Kierunek zawodowy',
}
let commandId: string | undefined
watch(
  data,
  (value) => {
    draft.value = value ? { ...value.current.weights } : null
  },
  { immediate: true },
)
watch(
  draft,
  () => {
    if (!busy.value) commandId = undefined
  },
  { deep: true },
)
const total = computed(() =>
  draft.value
    ? Object.values(draft.value).reduce((a, b) => a + Number(b), 0)
    : 0,
)
async function save() {
  const parsed = weightsSchema.safeParse(draft.value)
  if (!parsed.success || !data.value) return
  commandId ??= crypto.randomUUID()
  busy.value = true
  try {
    const result = await $fetch('/api/matching/weights', {
      method: 'POST',
      body: {
        commandId,
        expectedVersionId: data.value.current.id,
        weights: parsed.data,
      },
    })
    message.value = `Zapisano wagi. Przeliczono ocen: ${result.updated}. Bez wywołań AI.`
    await refresh()
    commandId = undefined
    emit('updated')
  } catch (e) {
    message.value =
      (e as { data?: { data?: { message?: string } } }).data?.data?.message ??
      'Nie udało się zapisać wag. Formularz zachowano.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <details class="detail-section">
    <summary>Wagi dopasowania</summary>
    <p>
      Zmiana przeliczy aktualne oceny wszystkich ofert. Poprzednie wersje
      zostaną w historii. Niewiadome obniżają kompletność i nie są liczone jako
      zero.
    </p>
    <p v-if="error" role="alert">Nie udało się wczytać wag.</p>
    <form v-if="draft" class="matching-editor" @submit.prevent="save">
      <fieldset :disabled="busy">
        <label v-for="(label, key) in labels" :key="key"
          >{{ label }} (%)<input
            v-model.number="draft[key]"
            type="number"
            min="0"
            max="100"
            step="1"
            required
        /></label>
        <p>Suma: {{ total }}% (wymagane 100%)</p>
        <UButton
          type="submit"
          :disabled="!weightsSchema.safeParse(draft).success"
          :loading="busy"
          >Zapisz i przelicz oceny</UButton
        >
        <UButton type="button" variant="outline" @click="refresh()"
          >Wczytaj aktualne wagi</UButton
        >
      </fieldset>
    </form>
    <p v-if="message" role="status">{{ message }}</p>
    <details v-if="data">
      <summary>Historia wag ({{ data.history.length }})</summary>
      <p v-for="version in data.history" :key="version.id">
        Wersja {{ version.number }} ·
        {{ new Date(version.created_at).toLocaleString('pl-PL') }} · Technologie
        {{ version.weights.technologies }}%, doświadczenie
        {{ version.weights.experience }}%, warunki
        {{ version.weights.conditions }}%, kierunek
        {{ version.weights.direction }}%
      </p>
    </details>
  </details>
</template>

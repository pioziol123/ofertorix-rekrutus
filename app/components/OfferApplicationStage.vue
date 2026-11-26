<script setup lang="ts">
import {
  allowedStages,
  isStage,
  noApplicationLabel,
  refusalText,
  stageLabels,
  type Stage,
} from '../../modules/recruitments/view'

/**
 * The stage field of offer details (A-R04, T1-R01, T1-R02): it shows the
 * application's stage, or "Bez aplikacji", and when opened lists exactly
 * the stages allowed from it. A choice moves the application at once; a
 * refusal shows its message next to the field and the stage stays.
 */
const props = defineProps<{ offerId: string }>()
const request = useRequestFetch()
const { data, error } = await useAsyncData(
  `offer-application-${props.offerId}`,
  async () => {
    try {
      const application = await request<{ stage: string }>(
        `/api/applications/${encodeURIComponent(props.offerId)}`,
      )
      return isStage(application.stage) ? application.stage : null
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) return null
      throw e
    }
  },
)
/** The stage the page shows, null for no application. */
const shown = ref<Stage | null>(data.value ?? null)
watch(data, (value) => {
  shown.value = value ?? null
})
const message = ref('')
const busy = ref(false)
const field = ref<HTMLSelectElement | null>(null)
const options = computed(() => allowedStages(shown.value))
const currentLabel = computed(() =>
  shown.value ? stageLabels[shown.value] : noApplicationLabel,
)

async function choose(event: Event) {
  const target = (event.target as HTMLSelectElement).value
  // The field goes back to the shown stage until the answer arrives.
  if (field.value) field.value.value = shown.value ?? ''
  if (!isStage(target) || busy.value) return
  busy.value = true
  message.value = ''
  const id = encodeURIComponent(props.offerId)
  try {
    const result = await $fetch<{ stage: string }>(
      shown.value === null
        ? `/api/offers/${id}/application`
        : `/api/applications/${id}/stage`,
      {
        method: 'POST',
        body:
          shown.value === null ? { target } : { expected: shown.value, target },
      },
    )
    if (isStage(result.stage)) shown.value = result.stage
  } catch (e) {
    const code = (e as { data?: { data?: { code?: string } } }).data?.data?.code
    message.value = code
      ? refusalText(code)
      : 'Nie udało się zmienić etapu. Spróbuj ponownie.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="application-stage" data-testid="application-stage">
    <label :for="`application-stage-${offerId}`">Etap aplikacji</label>
    <p v-if="error" role="alert">Nie udało się wczytać etapu aplikacji.</p>
    <select
      v-else
      :id="`application-stage-${offerId}`"
      ref="field"
      :value="shown ?? ''"
      :disabled="busy"
      @change="choose"
    >
      <option :value="shown ?? ''" selected disabled hidden>
        {{ currentLabel }}
      </option>
      <option v-for="stage in options" :key="stage" :value="stage">
        {{ stageLabels[stage] }}
      </option>
    </select>
    <p v-if="message" role="alert" class="application-stage-message">
      {{ message }}
    </p>
  </div>
</template>
<style scoped>
.application-stage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0;
}
.application-stage select {
  border: 1px solid var(--ui-border, #d0d5dd);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
}
.application-stage-message {
  flex-basis: 100%;
  color: var(--ui-error, #b42318);
}
</style>

<script setup lang="ts">
import {
  allowedStages,
  isStage,
  noApplicationLabel,
  stageLabels,
  stageMarks,
  type Stage,
} from '../../modules/recruitments/view'
import { moveFailureText } from '../utils/application-stage'

/**
 * The stage field of A-R04, in offer details (T1-R01, T1-R02) and in the
 * application details (T2-R10): it shows the stage the page read, with its
 * icon and colour (T2-R13), or "Bez aplikacji", and when opened lists
 * exactly the stages allowed from it. A choice moves the application at
 * once and tells the page the new stage; a refusal shows its message next
 * to the field and the stage stays.
 */
const props = defineProps<{ offerId: string; stage: Stage | null }>()
const emit = defineEmits<{ moved: [stage: Stage] }>()
/** The stage the field shows, null for no application. */
const shown = ref<Stage | null>(props.stage)
watch(
  () => props.stage,
  (value) => {
    shown.value = value
  },
)
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
    if (isStage(result.stage)) {
      shown.value = result.stage
      emit('moved', result.stage)
    }
  } catch (e) {
    // ASSUMPTION(oferty-pracy-lq3.1/ASM-1): a failure without a code shows
    // the move failure text.
    message.value = moveFailureText(e)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="application-stage-field">
    <label :for="`application-stage-${offerId}`">Etap aplikacji</label>
    <span
      v-if="shown"
      class="application-stage-icon"
      :data-stage="shown"
      :style="{
        color: stageMarks[shown].colour,
        background: stageMarks[shown].background,
      }"
      ><SyncIcon :paths="stageMarks[shown].paths"
    /></span>
    <select
      :id="`application-stage-${offerId}`"
      ref="field"
      :value="shown ?? ''"
      :disabled="busy"
      @change="choose"
    >
      <option :value="shown ?? ''" selected disabled hidden>
        {{ currentLabel }}
      </option>
      <option v-for="choice in options" :key="choice" :value="choice">
        {{ stageLabels[choice] }}
      </option>
    </select>
    <p v-if="message" role="alert" class="application-stage-message">
      {{ message }}
    </p>
  </div>
</template>
<style scoped>
.application-stage-field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.application-stage-field select {
  border: 1px solid var(--ui-border, #d0d5dd);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
}
.application-stage-icon {
  display: inline-flex;
  border-radius: 999px;
  padding: 4px;
}
.application-stage-message {
  flex-basis: 100%;
  color: var(--ui-error, #b42318);
}
</style>

<script setup lang="ts">
import { isStage, type Stage } from '../../modules/recruitments/view'
import {
  readFailureOutcome,
  stageReadFailureText,
} from '../utils/application-stage'

/**
 * The application in offer details (T1-R01, T1-R02, T2-R12): the stage
 * field of the offer's application, or "Bez aplikacji", and for an offer
 * with an application, in any stage, the link "Szczegóły aplikacji" to its
 * details on Moja lista.
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
      // Any failure other than 404 shows the read failure text instead of
      // the field. ASSUMPTION(oferty-pracy-lq3.1/ASM-1)
      if (readFailureOutcome(e) === 'no_application') return null
      throw e
    }
  },
)
/** The stage the page shows, null for no application. */
const shown = ref<Stage | null>(data.value ?? null)
watch(data, (value) => {
  shown.value = value ?? null
})
</script>
<template>
  <div class="application-stage" data-testid="application-stage">
    <!-- ASSUMPTION(oferty-pracy-lq3.1/ASM-1) -->
    <template v-if="error">
      <span>Etap aplikacji</span>
      <p role="alert">{{ stageReadFailureText }}</p>
    </template>
    <template v-else>
      <ApplicationStageField
        :offer-id="offerId"
        :stage="shown"
        @moved="shown = $event"
      />
      <NuxtLink
        v-if="shown"
        class="application-link"
        data-testid="application-details-link"
        :to="{ path: '/my-list', query: { offer: offerId } }"
        >Szczegóły aplikacji</NuxtLink
      >
    </template>
  </div>
</template>
<style scoped>
.application-stage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin: 0.75rem 0;
}
.application-link {
  color: #245c44;
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>

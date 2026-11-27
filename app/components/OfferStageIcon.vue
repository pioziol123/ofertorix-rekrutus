<script setup lang="ts">
import { listStageIcon } from '../../modules/offers/view'
import type { Stage } from '../../modules/recruitments/view'

/**
 * The stage icon of an offer on the offer list (lq3 T3-R01): the icon of
 * its stage with the stage label as its tooltip and accessible name, for
 * "Do rozważenia", "CV wysłane" and "Odrzucone". An offer without an
 * application and one in "Zdjęta z listy" show nothing. It only informs;
 * the stage changes in offer details (T3-R02).
 */
const props = defineProps<{ stage?: Stage }>()
const icon = computed(() => listStageIcon(props.stage))
</script>
<template>
  <span
    v-if="icon"
    class="offer-stage-icon"
    role="img"
    :data-stage="icon.stage"
    :title="icon.label"
    :aria-label="icon.label"
    :style="{ color: icon.colour }"
    ><SyncIcon :paths="icon.paths"
  /></span>
</template>
<style scoped>
.offer-stage-icon {
  display: inline-flex;
  align-items: center;
  margin-right: 6px;
  vertical-align: middle;
}
</style>

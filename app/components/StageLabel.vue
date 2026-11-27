<script setup lang="ts">
import {
  stageLabels,
  stageMarks,
  type Stage,
} from '../../modules/recruitments/view'
/**
 * An application's stage as its label with its icon and colour (A-R14,
 * T2-R13), the same wherever a stage is shown.
 */
defineProps<{ stage: Stage }>()
</script>
<template>
  <span
    class="stage-label"
    :data-stage="stage"
    :style="{
      color: stageMarks[stage].colour,
      background: stageMarks[stage].background,
    }"
    ><SyncIcon :paths="stageMarks[stage].paths" />{{ stageLabels[stage] }}</span
  >
</template>
<style scoped>
.stage-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 1px 9px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
</style>

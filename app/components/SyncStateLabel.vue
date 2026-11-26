<script setup lang="ts">
import {
  stateIcons,
  stateLabels,
  stateTooltips,
  type SyncState,
} from '../../modules/sources/view'
/**
 * A sync's state as a label with its icon (T1-R07). Hovering over it or
 * focusing it shows its meaning in the page's tooltip (`data-tip`).
 */
defineProps<{ state: SyncState }>()
</script>
<template>
  <span
    :class="['sync-state', `sync-state-${state}`]"
    :data-tip="stateTooltips[state]"
    :data-state="state"
    tabindex="0"
    ><SyncIcon
      :paths="stateIcons[state].paths"
      :filled="stateIcons[state].filled"
    />{{ stateLabels[state] }}</span
  >
</template>

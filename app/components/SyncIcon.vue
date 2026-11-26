<script setup lang="ts">
/** A stroke icon on a 24×24 grid; `filled` paths take the text colour. */
defineProps<{ paths: string[]; filled?: string[] }>()
</script>
<template>
  <svg
    class="sync-icon"
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="d in paths" :key="d" :d="d" />
    <path v-for="d in filled ?? []" :key="d" :d="d" fill="currentColor" />
  </svg>
</template>

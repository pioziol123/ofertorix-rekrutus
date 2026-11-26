<script setup lang="ts">
/**
 * The header with the navigation every page shows, the page
 * "Synchronizacje" included (T1-R01). The item "Zlecenia AI"
 * carries the number of AI assignments needing attention when it is above
 * zero (T11-R01, T11-R04); the number is fetched with each page.
 */
defineProps<{
  current: 'offers' | 'companies' | 'profile' | 'syncs' | 'ai'
}>()
const { data: attention } = await useFetch(
  '/api/ai-assignments/needing-attention',
)
</script>
<template>
  <header class="app-header">
    <NuxtLink to="/offers" class="brand"
      ><span class="brand-mark">o.</span> Oferty pracy</NuxtLink
    >
    <nav class="app-nav">
      <NuxtLink
        to="/offers"
        :aria-current="current === 'offers' ? 'page' : undefined"
        >Oferty</NuxtLink
      ><NuxtLink
        to="/companies"
        :aria-current="current === 'companies' ? 'page' : undefined"
        >Firmy</NuxtLink
      ><NuxtLink
        to="/profile"
        :aria-current="current === 'profile' ? 'page' : undefined"
        >Mój profil</NuxtLink
      ><NuxtLink
        to="/syncs"
        :aria-current="current === 'syncs' ? 'page' : undefined"
        >Synchronizacje</NuxtLink
      ><NuxtLink
        to="/ai-assignments"
        :aria-current="current === 'ai' ? 'page' : undefined"
        >Zlecenia AI<span
          v-if="attention && attention.count > 0"
          class="nav-counter"
          data-testid="ai-attention-count"
          :aria-label="`Wymaga uwagi: ${attention.count}`"
          >{{ attention.count }}</span
        ></NuxtLink
      >
    </nav>
  </header>
</template>

<script setup lang="ts">
import { companyKindLabels } from '../../../lib/companies/model'
useHead({ title: 'Firmy — Oferty pracy' })
const route = useRoute()
const q = ref(typeof route.query.q === 'string' ? route.query.q : ''),
  sort = ref(typeof route.query.sort === 'string' ? route.query.sort : 'name')
const { data, error, status } = await useFetch('/api/companies', {
  query: computed(() => ({
    q: typeof route.query.q === 'string' ? route.query.q : '',
    sort: typeof route.query.sort === 'string' ? route.query.sort : 'name',
    page: typeof route.query.page === 'string' ? route.query.page : '1',
  })),
})
async function apply() {
  await navigateTo({
    path: '/companies',
    query: { q: q.value, sort: sort.value },
  })
}
const pageLink = (page: number) => ({
  path: '/companies',
  query: { ...route.query, page: String(page) },
})
</script>
<template>
  <div class="workspace">
    <header class="app-header">
      <NuxtLink to="/offers" class="brand"
        ><span class="brand-mark">o.</span> Oferty pracy</NuxtLink
      >
      <nav class="app-nav">
        <NuxtLink to="/offers">Oferty</NuxtLink
        ><NuxtLink to="/companies" aria-current="page">Firmy</NuxtLink
        ><NuxtLink to="/profile">Mój profil</NuxtLink>
      </nav>
    </header>
    <main class="offers-main companies-main">
      <div class="page-heading">
        <div>
          <p class="eyebrow">PRACODAWCY I PUBLIKUJĄCY</p>
          <h1>
            Firmy <span v-if="data" class="count-badge">{{ data.total }}</span>
          </h1>
          <p class="muted">
            Profile, powiązane oferty i technologie wraz z ich pochodzeniem.
          </p>
        </div>
      </div>
      <form class="company-filters" @submit.prevent="apply">
        <label
          >Szukaj firmy<input
            v-model="q"
            maxlength="300"
            placeholder="Nazwa lub opis" /></label
        ><label
          >Sortuj<select v-model="sort">
            <option value="name">Nazwa</option>
            <option value="offers">Liczba ofert</option>
            <option value="newest">Najnowsze profile</option>
          </select></label
        ><UButton type="submit">Zastosuj</UButton>
      </form>
      <p v-if="error" role="alert" class="notice">
        Nie udało się wczytać firm. Spróbuj odświeżyć stronę.
      </p>
      <p v-else-if="status === 'pending'" role="status">Wczytywanie firm…</p>
      <template v-else-if="data">
        <div v-if="!data.total" class="company-empty">
          <h2>
            {{
              q ? 'Brak pasujących profili' : 'Nie masz jeszcze profili firm'
            }}
          </h2>
          <p>
            Otwórz ofertę i przypisz ją do istniejącego lub nowego profilu. Sama
            nazwa z ogłoszenia nie potwierdza tożsamości firmy.
          </p>
          <UButton to="/offers" variant="outline">Przejdź do ofert</UButton>
        </div>
        <div v-else class="company-grid">
          <NuxtLink
            v-for="company in data.items"
            :key="company.id"
            :to="`/companies/${company.id}`"
            class="company-card"
            ><p class="small-label">{{ companyKindLabels[company.kind] }}</p>
            <h2>{{ company.name }}</h2>
            <p>{{ company.description || 'Opis nieuzupełniony' }}</p>
            <span class="company-offer-count"
              >Powiązane oferty: {{ company.offerCount }}</span
            ></NuxtLink
          >
        </div>
        <nav
          v-if="data.total > data.pageSize"
          class="company-pagination"
          aria-label="Strony firm"
        >
          <UButton
            v-if="data.page > 1"
            :to="pageLink(data.page - 1)"
            variant="outline"
            >Poprzednia</UButton
          ><span
            >Strona {{ data.page }} z
            {{ Math.ceil(data.total / data.pageSize) }}</span
          ><UButton
            v-if="data.page * data.pageSize < data.total"
            :to="pageLink(data.page + 1)"
            variant="outline"
            >Następna</UButton
          >
        </nav>
      </template>
      <details class="company-create">
        <summary>Dodaj profil firmy bez przypisanej oferty</summary>
        <CompanyCreate @created="(id) => navigateTo(`/companies/${id}`)" />
      </details>
    </main>
  </div>
</template>

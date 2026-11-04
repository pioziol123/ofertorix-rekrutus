<script setup lang="ts">
import {
  companyKindLabels,
  companyRoleLabels,
  companyRoles,
} from '../../../lib/companies/model'
const route = useRoute()
const { data, error } = await useFetch(
  () => `/api/companies/${String(route.params.id)}`,
)
useHead({
  title: computed(() => `${data.value?.name ?? 'Firma'} — Oferty pracy`),
})
const date = (value: string) => new Date(value).toLocaleString('pl-PL')
const technologies = computed(() =>
  [...new Set(data.value?.technologies.map((t) => t.name) ?? [])].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  ),
)
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
      <NuxtLink to="/companies" class="back-link">← Wszystkie firmy</NuxtLink>
      <p v-if="error" role="alert" class="notice">
        Nie udało się otworzyć profilu firmy. Sprawdź adres lub spróbuj
        ponownie.
      </p>
      <template v-else-if="data">
        <div class="page-heading">
          <div>
            <p class="eyebrow">
              PROFIL FIRMY · {{ companyKindLabels[data.kind] }}
            </p>
            <h1>{{ data.name }}</h1>
            <p>{{ data.description || 'Opis firmy nieuzupełniony.' }}</p>
          </div>
          <UButton
            v-if="data.website"
            :to="data.website"
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            >Strona firmy ↗</UButton
          >
        </div>
        <p v-if="data.kind === 'unknown'" class="notice">
          Tożsamość podmiotu nie została ustalona. Profil nie potwierdza
          konkretnej spółki.
        </p>
        <div class="company-detail-grid">
          <div>
            <CompanyResearch :key="data.id" :company-id="data.id" />
            <section class="company-section">
              <h2>
                Powiązane oferty
                <span class="count-badge">{{ data.offers.length }}</span>
              </h2>
              <p v-if="!data.offers.length" class="muted">
                Brak przypisanych ofert. Powiązania dodasz w szczegółach
                wybranej oferty.
              </p>
              <article
                v-for="offer in data.offers"
                :key="offer.id"
                class="company-offer"
              >
                <NuxtLink :to="{ path: '/offers', query: { offer: offer.id } }"
                  ><h3>{{ offer.title }}</h3></NuxtLink
                >
                <p class="muted">
                  {{ offer.source ?? 'SOLID.Jobs' }} · {{ offer.company }}
                </p>
                <p v-for="role in companyRoles" :key="role" class="small-label">
                  {{ companyRoleLabels[role] }}:
                  {{
                    offer.roles.includes(role)
                      ? data.name
                      : 'Nie ustalono jako tej firmy'
                  }}
                </p>
                <p
                  v-if="offer.expired || offer.availability === 'unavailable'"
                  class="notice"
                >
                  {{
                    offer.expired
                      ? 'Ogłoszenie wygasło'
                      : 'Ogłoszenie niedostępne w źródle'
                  }}
                </p>
                <h4>Technologie w tej ofercie</h4>
                <div class="skill-tags">
                  <span
                    v-for="skill in offer.skills"
                    :key="`${skill.name}-${skill.optional}`"
                    class="skill-tag"
                    >{{ skill.name }} ·
                    {{
                      skill.optional === true
                        ? 'opcjonalna'
                        : skill.optional === false
                          ? 'wymagana'
                          : 'rola niepodana'
                    }}</span
                  ><span v-if="!offer.skills.length" class="muted"
                    >Brak danych o technologiach.</span
                  >
                </div>
                <a
                  v-if="offer.url"
                  :href="offer.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="back-link"
                  >Źródło ogłoszenia ↗</a
                >
              </article>
            </section>
            <section class="company-section">
              <h2>Historia powiązań</h2>
              <p v-if="!data.history.length" class="muted">
                Nie zapisano jeszcze zmian powiązań.
              </p>
              <article
                v-for="event in data.history"
                :key="event.id"
                class="company-history"
              >
                <p class="small-label">
                  {{ date(event.at) }} ·
                  {{ event.action === 'link' ? 'Przypisano' : 'Odpięto' }} ·
                  {{ companyRoleLabels[event.role] }}
                </p>
                <NuxtLink
                  :to="{ path: '/offers', query: { offer: event.adId } }"
                  >{{ event.title }}</NuxtLink
                >
                <p>{{ event.evidence }}</p>
              </article>
            </section>
          </div>
          <aside>
            <section class="company-section">
              <h2>Technologie z powiązanych ofert</h2>
              <p class="muted">
                To zbiorczy indeks ogłoszeń, nie potwierdzony stos wewnętrzny
                firmy. Wymagania i źródło znajdziesz przy konkretnej ofercie.
              </p>
              <div class="skill-tags">
                <span
                  v-for="technology in technologies"
                  :key="technology"
                  class="skill-tag"
                  >{{ technology }}</span
                ><span v-if="!technologies.length" class="muted"
                  >Brak danych.</span
                >
              </div>
            </section>
          </aside>
        </div>
      </template>
    </main>
  </div>
</template>

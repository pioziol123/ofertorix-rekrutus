<script setup lang="ts">
import {
  companyRoles,
  companyRoleLabels,
  companyKindLabels,
  type CompanyRole,
} from '../../modules/companies/view'
const props = defineProps<{ offerId: string; companyName: string }>()
const {
  data,
  error: loadError,
  refresh,
} = await useFetch(() => `/api/offers/${props.offerId}/companies`)
const editDetails = ref<HTMLDetailsElement | null>(null)
const search = ref('')
const { data: choices, refresh: refreshChoices } = await useFetch(
  '/api/companies',
  { query: computed(() => ({ q: search.value })) },
)
const selected = ref(''),
  role = ref<CompanyRole>('publisher'),
  evidence = ref(''),
  busy = ref(false),
  error = ref(''),
  notice = ref('')
let pending: { key: string; id: string } | null = null
async function created(id: string) {
  selected.value = id
  search.value = ''
  await Promise.all([refresh(), refreshChoices()])
  notice.value =
    'Profil utworzony. Wybierz rolę, podaj uzasadnienie i przypisz ofertę.'
}
async function change(
  action: 'link' | 'unlink',
  companyId: string,
  which: CompanyRole,
) {
  if (busy.value) return
  if (!evidence.value.trim()) {
    error.value = 'Podaj źródło lub uzasadnienie przypisania albo odpięcia.'
    if (editDetails.value) editDetails.value.open = true
    return
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  const current =
    data.value?.links.find((link) => link.role === which)?.id ?? null
  const body = {
    adId: props.offerId,
    role: which,
    action,
    expectedCompanyId: current,
    evidence: evidence.value.trim(),
  }
  const key = JSON.stringify({ companyId, ...body })
  if (pending?.key !== key) pending = { key, id: crypto.randomUUID() }
  try {
    await $fetch(`/api/companies/${companyId}/links`, {
      method: 'POST',
      body: { commandId: pending.id, ...body },
    })
    pending = null
    evidence.value = ''
    notice.value =
      action === 'link'
        ? 'Powiązanie zapisane w historii firmy.'
        : 'Powiązanie odpięte; historia została zachowana.'
    await refresh()
  } catch (e) {
    error.value =
      (e as { statusCode?: number }).statusCode === 409
        ? 'Powiązanie zostało zmienione. Odśwież dane i porównaj przed ponowieniem.'
        : 'Nie udało się zapisać powiązania. Możesz ponowić te same dane.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="detail-section">
    <h3>Firmy powiązane z ofertą</h3>
    <p v-if="loadError" role="alert">Nie udało się wczytać powiązań.</p>
    <div v-for="which in companyRoles" :key="which" class="company-role-row">
      <strong>{{ companyRoleLabels[which] }}</strong>
      <template v-if="data?.links.some((link) => link.role === which)">
        <div
          v-for="link in data.links.filter((link) => link.role === which)"
          :key="link.id"
        >
          <NuxtLink :to="`/companies/${link.id}`">{{ link.name }}</NuxtLink>
          <small> · {{ companyKindLabels[link.kind] }}</small>
          <p class="muted">{{ link.evidence }}</p>
          <UButton
            size="sm"
            variant="ghost"
            :disabled="busy"
            @click="change('unlink', link.id, which)"
            >Odepnij powiązanie</UButton
          >
        </div>
      </template>
      <span v-else class="muted">Nieustalona</span>
    </div>
    <p v-if="notice" role="status" class="notice">{{ notice }}</p>
    <p v-if="error" role="alert" class="notice">{{ error }}</p>
    <details ref="editDetails">
      <summary>Przypisz lub utwórz profil firmy</summary>
      <p class="muted">
        Nazwa w źródle: {{ companyName }}. To podpowiedź, nie potwierdzenie
        tożsamości pracodawcy.
      </p>
      <div class="matching-editor">
        <label
          >Rola<select v-model="role">
            <option v-for="which in companyRoles" :key="which" :value="which">
              {{ companyRoleLabels[which] }}
            </option>
          </select></label
        >
        <label
          >Szukaj profilu<input
            v-model="search"
            maxlength="300"
            placeholder="Nazwa firmy"
        /></label>
        <label
          >Profil<select v-model="selected">
            <option value="">Wybierz profil</option>
            <option
              v-if="selected && !choices?.items.some((c) => c.id === selected)"
              :value="selected"
            >
              Wybrany profil
            </option>
            <option
              v-for="company in choices?.items"
              :key="company.id"
              :value="company.id"
            >
              {{ company.name }} · {{ companyKindLabels[company.kind] }}
            </option>
          </select></label
        >
        <div v-if="data?.suggestions.length" class="company-suggestions">
          <p class="muted">Podobna nazwa — sprawdź przed przypisaniem:</p>
          <UButton
            v-for="suggestion in data.suggestions"
            :key="suggestion.id"
            variant="outline"
            size="sm"
            @click="selected = suggestion.id"
            >{{ suggestion.name }} ·
            {{ companyKindLabels[suggestion.kind] }}</UButton
          >
        </div>
        <label
          >Źródło lub uzasadnienie (także do odpięcia)<textarea
            v-model="evidence"
            maxlength="2000"
            placeholder="Np. dane w ogłoszeniu lub informacja od rekrutera"
          />
        </label>
        <UButton
          :disabled="
            busy ||
            !selected ||
            !!data?.links.some((link) => link.role === role)
          "
          :loading="busy"
          @click="change('link', selected, role)"
          >Przypisz wybraną rolę</UButton
        >
        <UButton variant="ghost" :disabled="busy" @click="refresh()"
          >Odśwież powiązania</UButton
        >
      </div>
      <details class="company-create">
        <summary>Utwórz nowy profil</summary>
        <CompanyCreate :suggested-name="companyName" @created="created" />
      </details>
    </details>
  </section>
</template>

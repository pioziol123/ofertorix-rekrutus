<script setup lang="ts">
import { matchingCriterionLabel } from '../../lib/matching/view'
import type { Assessment } from '../../lib/matching/model'
const props = defineProps<{ offerId: string }>()
const emit = defineEmits<{ updated: [] }>()
const { data, refresh, error } = await useFetch(
  () => `/api/offers/${encodeURIComponent(props.offerId)}/rating`,
)
const draft = ref<Assessment | null>(null)
const reason = ref(''),
  message = ref(''),
  busy = ref(false)
let commandId: string | undefined
watch(
  data,
  (value) => {
    draft.value = value ? JSON.parse(JSON.stringify(value.assessment)) : null
  },
  { immediate: true },
)
watch(
  [draft, reason],
  () => {
    if (!busy.value) commandId = undefined
  },
  { deep: true },
)
const valid = computed(
  () =>
    !!draft.value &&
    !!reason.value.trim() &&
    draft.value.criteria.every(
      (c) =>
        c.state === 'unknown' ||
        (typeof c.score === 'number' &&
          Number.isInteger(c.score) &&
          c.score >= 0 &&
          c.score <= 100 &&
          !!c.reason.trim()),
    ),
)
function changeState(c: Assessment['criteria'][number]) {
  if (c.state === 'unknown') c.score = null
}
async function save() {
  if (!data.value || !draft.value || !valid.value) return
  commandId ??= crypto.randomUUID()
  busy.value = true
  message.value = ''
  try {
    await $fetch(`/api/offers/${encodeURIComponent(props.offerId)}/rating`, {
      method: 'POST',
      body: {
        commandId,
        expectedRevisionId: data.value.headId,
        profileVersionId: data.value.profileVersionId,
        adRevisionId: data.value.adRevisionId,
        assessment: draft.value,
        reason: reason.value,
      },
    })
    message.value =
      'Zapisano własną ocenę. Poprzednia wersja pozostaje w historii.'
    await refresh()
    reason.value = ''
    commandId = undefined
    emit('updated')
  } catch (e) {
    message.value =
      (e as { data?: { data?: { message?: string } } }).data?.data?.message ??
      'Nie udało się zapisać oceny. Formularz zachowano.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <details class="detail-section">
    <summary>Własna ocena lub korekta</summary>
    <p>
      Możesz ocenić kryteria na podstawie własnej wiedzy. Wyjaśnij ocenę; brak
      danych pozostaw jako niewiadomą. Zapis nie korzysta z AI.
    </p>
    <p v-if="error" role="alert">Nie udało się wczytać formularza.</p>
    <p v-else-if="!data">Najpierw zatwierdź profil zawodowy.</p>
    <form class="matching-editor" v-if="data && draft" @submit.prevent="save">
      <fieldset :disabled="busy">
        <p v-if="data.staleBase" class="notice">
          Profil lub ogłoszenie zmieniły się. Formularz obejmuje aktualne
          kryteria; poprzednia ocena pozostaje w historii.
        </p>
        <label
          >Podsumowanie<textarea
            v-model="draft.summary"
            required
            maxlength="3000"
          />
        </label>
        <details
          v-for="criterion in draft.criteria"
          :key="criterion.id"
          class="detail-section"
        >
          <summary>
            {{
              matchingCriterionLabel(
                data.input.criteria.find((c) => c.id === criterion.id)?.label ??
                  criterion.id,
              )
            }}
            · {{ criterion.score ?? 'niewiadoma' }}
          </summary>
          <label
            >Wynik<select
              v-model="criterion.state"
              @change="changeState(criterion)"
            >
              <option value="unknown">Niewiadoma</option>
              <option value="match">Zgodność</option>
              <option value="gap">Luka</option>
            </select></label
          >
          <label v-if="criterion.state !== 'unknown'"
            >Ocena 0–100<input
              v-model.number="criterion.score"
              type="number"
              min="0"
              max="100"
              step="1"
              required
          /></label>
          <label
            >Uzasadnienie<textarea
              v-model="criterion.reason"
              required
              maxlength="1000"
            />
          </label>
        </details>
        <label
          >Powód zapisania tej wersji<textarea
            v-model="reason"
            required
            maxlength="3000"
          />
        </label>
        <UButton type="submit" :disabled="!valid" :loading="busy"
          >Zapisz własną ocenę</UButton
        >
        <UButton variant="outline" type="button" @click="refresh()"
          >Wczytaj aktualne dane</UButton
        >
      </fieldset>
    </form>
    <p v-if="message" role="status">{{ message }}</p>
  </details>
</template>

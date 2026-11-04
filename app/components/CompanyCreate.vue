<script setup lang="ts">
import { companyKindLabels } from '../../lib/companies/model'
const props = defineProps<{ suggestedName?: string }>()
const emit = defineEmits<{ created: [id: string] }>()
const name = ref(props.suggestedName ?? ''),
  kind = ref<'organization' | 'brand' | 'unknown'>('unknown'),
  website = ref(''),
  description = ref(''),
  busy = ref(false),
  error = ref('')
let pending: { key: string; id: string } | null = null
async function save() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const body = {
    name: name.value.trim(),
    kind: kind.value,
    website: website.value.trim() || null,
    description: description.value.trim(),
  }
  const key = JSON.stringify(body)
  if (pending?.key !== key) pending = { key, id: crypto.randomUUID() }
  try {
    const result = await $fetch('/api/companies', {
      method: 'POST',
      body: { commandId: pending.id, ...body },
    })
    pending = null
    emit('created', result.id)
  } catch {
    error.value =
      'Nie udało się utworzyć profilu. Sprawdź pola; ponowienie tych samych danych nie utworzy drugiego profilu.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <form class="matching-editor" @submit.prevent="save">
    <label>Nazwa<input v-model="name" required maxlength="300" /></label>
    <label
      >Rodzaj profilu<select v-model="kind">
        <option
          v-for="(label, key) in companyKindLabels"
          :key="key"
          :value="key"
        >
          {{ label }}
        </option>
      </select></label
    >
    <label
      >Strona internetowa (opcjonalnie)<input
        v-model="website"
        type="url"
        maxlength="2000"
        placeholder="https://"
    /></label>
    <label
      >Opis (opcjonalnie)<textarea v-model="description" maxlength="5000" />
    </label>
    <p class="muted">
      Podobna nazwa lub wspólna domena nie potwierdza, że to ta sama spółka.
      Nowy profil pozostaje osobny.
    </p>
    <p v-if="error" role="alert" class="notice">{{ error }}</p>
    <UButton type="submit" :loading="busy">Utwórz profil firmy</UButton>
  </form>
</template>

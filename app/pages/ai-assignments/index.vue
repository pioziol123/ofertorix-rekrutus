<script setup lang="ts">
import {
  amountText,
  assignmentStatusLabels,
  assignmentTypeLabels,
  failureReasonLabels,
  timeLeftText,
  type AssignmentListPage,
} from '../../../modules/ai/view'
useHead({ title: 'Zlecenia AI — Oferty pracy' })
const route = useRoute()
const cursor = computed(() =>
  typeof route.query.cursor === 'string' ? route.query.cursor : '',
)
const { data, error, status } = await useFetch<AssignmentListPage>(
  '/api/ai-assignments',
  { query: computed(() => (cursor.value ? { cursor: cursor.value } : {})) },
)
const placed = (at: string) =>
  new Date(at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })
</script>
<template>
  <div class="workspace">
    <AppHeader current="ai" />
    <main class="offers-main">
      <div class="page-heading">
        <div>
          <p class="eyebrow">PRACA MODELI I AGENTÓW</p>
          <h1>Zlecenia AI</h1>
          <p class="muted">
            Zlecenia wymagające uwagi na górze, pozostałe od najnowszych.
          </p>
        </div>
        <UButton to="/ai-assignments/budget" variant="outline"
          >Budżet AI</UButton
        >
      </div>
      <p v-if="error" role="alert" class="notice">
        Nie udało się wczytać zleceń AI. Spróbuj odświeżyć stronę.
      </p>
      <p v-else-if="status === 'pending'" role="status">Wczytywanie zleceń…</p>
      <template v-else-if="data">
        <p v-if="!data.items.length" class="muted">
          {{ cursor ? 'Nie ma więcej zleceń.' : 'Nie ma jeszcze zleceń AI.' }}
        </p>
        <table v-else class="ai-table">
          <thead>
            <tr>
              <th>Zlecenie</th>
              <th>Typ</th>
              <th>Moduł zlecający</th>
              <th>Wykonawca</th>
              <th>Status</th>
              <th>Do limitu czasu</th>
              <th>Koszt obciążający budżet</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.items"
              :key="row.assignmentId"
              :class="{ 'needs-attention': row.status === 'needs_attention' }"
            >
              <td>
                <NuxtLink :to="`/ai-assignments/${row.assignmentId}`">{{
                  row.label
                }}</NuxtLink>
                <span class="small-label">{{ placed(row.placedAt) }}</span>
              </td>
              <td>{{ assignmentTypeLabels[row.type] }}</td>
              <td>{{ row.requestingModule }}</td>
              <td>{{ row.executor }}</td>
              <td>
                {{ assignmentStatusLabels[row.status]
                }}<span v-if="row.failureReason" class="small-label">{{
                  failureReasonLabels[row.failureReason]
                }}</span>
              </td>
              <td>{{ timeLeftText(row.timeLeftSeconds) ?? '—' }}</td>
              <td>{{ amountText(row.charge) }}</td>
            </tr>
          </tbody>
        </table>
        <nav
          v-if="cursor || data.nextCursor"
          class="company-pagination"
          aria-label="Strony zleceń"
        >
          <UButton v-if="cursor" to="/ai-assignments" variant="outline"
            >Pierwsza strona</UButton
          ><UButton
            v-if="data.nextCursor"
            :to="{
              path: '/ai-assignments',
              query: { cursor: data.nextCursor },
            }"
            variant="outline"
            >Następne</UButton
          >
        </nav>
      </template>
    </main>
  </div>
</template>

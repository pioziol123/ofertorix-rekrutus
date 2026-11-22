<script setup lang="ts">
import {
  actionFailedText,
  actionOutcomeText,
  actualCostText,
  amountText,
  assignmentActions,
  assignmentStatusLabels,
  assignmentTypeLabels,
  failureReasonLabels,
  operationCauseText,
  operationStateText,
  parametersText,
  timeLeftText,
  type AssignmentActionOutcome,
  type AssignmentDetails,
} from '../../../modules/ai/view'
const route = useRoute()
const { data, error, refresh } = await useFetch<AssignmentDetails>(
  () => `/api/ai-assignments/${route.params.id}`,
)
useHead({
  title: computed(() =>
    data.value ? `${data.value.label} — Zlecenia AI` : 'Zlecenie AI',
  ),
})
const at = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })
    : '—'
const actions = computed(() =>
  data.value ? assignmentActions(data.value) : { retry: false, reject: false },
)
const busy = ref(false)
const message = ref<string | null>(null)
/** Runs an owner's action (T12) and shows its outcome with the new state. */
async function act(action: 'retry' | 'reject') {
  if (busy.value) return
  busy.value = true
  message.value = null
  try {
    const outcome = await $fetch<AssignmentActionOutcome>(
      `/api/ai-assignments/${route.params.id}/${action}`,
      { method: 'POST' },
    )
    message.value = actionOutcomeText(outcome)
  } catch {
    message.value = actionFailedText[action]
  } finally {
    await refresh()
    busy.value = false
  }
}
</script>
<template>
  <div class="workspace">
    <AppHeader current="ai" />
    <main class="offers-main">
      <NuxtLink to="/ai-assignments" class="back-link"
        >← Wszystkie zlecenia AI</NuxtLink
      >
      <p v-if="error" role="alert" class="notice">
        Nie udało się otworzyć zlecenia AI. Sprawdź adres lub spróbuj ponownie.
      </p>
      <template v-else-if="data">
        <div class="page-heading">
          <div>
            <p class="eyebrow">ZLECENIE AI</p>
            <h1>{{ data.label }}</h1>
          </div>
        </div>
        <dl class="ai-facts">
          <dt>Status</dt>
          <dd data-testid="ai-status">
            {{ assignmentStatusLabels[data.status] }}
          </dd>
          <template v-if="data.failureReason">
            <dt>Przyczyna niepowodzenia</dt>
            <dd>{{ failureReasonLabels[data.failureReason] }}</dd>
          </template>
          <dt>Typ</dt>
          <dd>{{ assignmentTypeLabels[data.type] }}</dd>
          <dt>Moduł zlecający</dt>
          <dd>{{ data.requestingModule }}</dd>
          <dt>Wykonawca</dt>
          <dd>{{ data.executor }}</dd>
          <dt>Złożone</dt>
          <dd>{{ at(data.placedAt) }}</dd>
          <dt>Limit czasu</dt>
          <dd>
            {{ at(data.deadline)
            }}<template v-if="data.timeLeftSeconds !== null">
              ({{ timeLeftText(data.timeLeftSeconds) }})</template
            >
          </dd>
          <template v-if="data.finishedAt">
            <dt>Zakończone</dt>
            <dd>{{ at(data.finishedAt) }}</dd>
          </template>
          <dt>Koszt potencjalny operacji</dt>
          <dd>{{ amountText(data.cost.potential) }}</dd>
          <dt>Znany koszt faktyczny</dt>
          <dd>{{ amountText(data.cost.actual) }}</dd>
          <dt>Koszt obciążający budżet</dt>
          <dd>{{ amountText(data.cost.charge) }}</dd>
          <dt>Operacje o nieznanym koszcie</dt>
          <dd>{{ data.cost.unknownCosts }}</dd>
        </dl>
        <div
          v-if="actions.retry || actions.reject"
          class="ai-actions"
          data-testid="ai-actions"
        >
          <template v-if="actions.retry">
            <UButton
              :loading="busy"
              data-testid="ai-retry"
              @click="act('retry')"
              >Ponów</UButton
            >
            <span class="muted" data-testid="ai-retry-time-left"
              >Pozostały czas do limitu:
              {{ timeLeftText(data.timeLeftSeconds) }}. Ponowienie go nie
              przedłuża.</span
            >
          </template>
          <UButton
            v-if="actions.reject"
            :loading="busy"
            color="error"
            variant="outline"
            data-testid="ai-reject"
            @click="act('reject')"
            >Odrzuć</UButton
          >
        </div>
        <p v-if="message" role="status" class="notice">{{ message }}</p>
        <h2>Operacje</h2>
        <p v-if="!data.operations.length" class="muted">
          Zlecenie nie ma operacji.
        </p>
        <table v-else class="ai-table">
          <thead>
            <tr>
              <th>Nr</th>
              <th>Stan</th>
              <th>Parametry wykonawcy</th>
              <th>Początek</th>
              <th>Koniec</th>
              <th>Koszt potencjalny</th>
              <th>Koszt faktyczny</th>
              <th>Przyczyna błędu</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="operation in data.operations" :key="operation.ordinal">
              <td>
                {{ operation.ordinal
                }}<span v-if="operation.origin === 'manual'" class="small-label"
                  >ponowiona przez właściciela</span
                >
              </td>
              <td>{{ operationStateText(operation) }}</td>
              <td>{{ parametersText(operation.executorParameters) }}</td>
              <td>{{ at(operation.startedAt) }}</td>
              <td>{{ at(operation.finishedAt) }}</td>
              <td>
                {{
                  operation.potentialCost === null
                    ? '—'
                    : amountText(operation.potentialCost)
                }}
              </td>
              <td>{{ actualCostText(operation) }}</td>
              <td>{{ operationCauseText(operation) ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </main>
  </div>
</template>

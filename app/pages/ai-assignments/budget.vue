<script setup lang="ts">
import { aboveZero, amountText, type AiBudget } from '../../../modules/ai/view'
useHead({ title: 'Budżet AI — Zlecenia AI' })
const { data, error, refresh } = await useFetch<AiBudget>('/api/ai-budget')

/** A month in the form year-month, as the owner reads it. */
const monthText = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pl-PL', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Warsaw',
  })

type Limit = 'current' | 'default'
const typed = reactive<Record<Limit, string>>({ current: '', default: '' })
const messages = reactive<Record<Limit, string | null>>({
  current: null,
  default: null,
})
const saved = reactive<Record<Limit, boolean>>({
  current: false,
  default: false,
})
const busy = ref(false)

/**
 * Saves one of the two limits (T13-R02, T13-R03) and shows the budget
 * after it; a refused amount shows the AI module's message (T13-R04).
 */
async function save(limit: Limit) {
  if (busy.value) return
  busy.value = true
  messages[limit] = null
  saved[limit] = false
  try {
    await $fetch(`/api/ai-budget/${limit}-limit`, {
      method: 'PUT',
      body: { amount: typed[limit] },
    })
    typed[limit] = ''
    saved[limit] = true
  } catch (failure) {
    const data = (failure as { data?: { data?: { message?: string } } }).data
    messages[limit] =
      data?.data?.message ?? 'Nie udało się zapisać limitu. Spróbuj ponownie.'
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
      <div class="page-heading">
        <div>
          <p class="eyebrow">ZLECENIA AI</p>
          <h1>Budżet AI</h1>
          <p class="muted">
            Płatne operacje zleceń AI startują, dopóki budżet miesiąca ma na nie
            miejsce.
          </p>
        </div>
      </div>
      <p v-if="error" role="alert" class="notice">
        Nie udało się wczytać budżetu AI. Spróbuj odświeżyć stronę.
      </p>
      <template v-else-if="data">
        <h2>{{ monthText(data.current.month) }}</h2>
        <dl class="ai-facts" data-testid="ai-budget-current">
          <dt>Limit</dt>
          <dd data-testid="ai-budget-limit">
            {{ amountText(data.current.limit) }}
          </dd>
          <dt>Wydane</dt>
          <dd data-testid="ai-budget-spent">
            {{ amountText(data.current.spent) }}
          </dd>
          <dt>Zarezerwowane przez trwające operacje</dt>
          <dd data-testid="ai-budget-running">
            {{ amountText(data.current.running) }}
          </dd>
          <dt>Operacje o nieznanym koszcie</dt>
          <dd data-testid="ai-budget-unknown">
            {{ amountText(data.current.unknownCost) }} ({{
              data.current.unknownCount
            }})
          </dd>
          <!-- ASSUMPTION(oferty-pracy-sq2.14/ASM-1) -->
          <template
            v-if="
              aboveZero(data.current.carriedSettled) ||
              aboveZero(data.current.carriedHeld)
            "
          >
            <dt>Przeniesione sprzed wdrożenia</dt>
            <dd data-testid="ai-budget-carried">
              rozliczone {{ amountText(data.current.carriedSettled) }} (w kwocie
              wydanej), zarezerwowane
              {{ amountText(data.current.carriedHeld) }}
            </dd>
          </template>
          <dt>Koszt obciążający budżet</dt>
          <dd data-testid="ai-budget-charge">
            {{ amountText(data.current.charge) }}
          </dd>
          <dt>Pozostało</dt>
          <dd data-testid="ai-budget-remaining">
            {{ amountText(data.current.remaining) }}
          </dd>
        </dl>
        <form
          class="ai-budget-form"
          data-testid="ai-budget-current-form"
          @submit.prevent="save('current')"
        >
          <label
            >Limit bieżącego miesiąca (zł)<UInput
              v-model="typed.current"
              inputmode="decimal"
              :placeholder="data.current.limit.replace(/\.?0+$/, '')"
          /></label>
          <UButton type="submit" :loading="busy">Ustaw limit</UButton>
          <span class="muted"
            >Niewydana kwota nie przechodzi na następny miesiąc.</span
          >
          <p v-if="messages.current" role="alert" class="notice">
            {{ messages.current }}
          </p>
          <p v-else-if="saved.current" role="status" class="muted">
            Zapisano limit bieżącego miesiąca.
          </p>
        </form>
        <form
          class="ai-budget-form"
          data-testid="ai-budget-default-form"
          @submit.prevent="save('default')"
        >
          <label
            >Limit domyślny (zł)<UInput
              v-model="typed.default"
              inputmode="decimal"
              :placeholder="data.defaultLimit.replace(/\.?0+$/, '')"
          /></label>
          <UButton type="submit" :loading="busy">Ustaw limit</UButton>
          <span class="muted" data-testid="ai-budget-default"
            >Nowy miesiąc zaczyna z limitem domyślnym
            {{ amountText(data.defaultLimit) }}. Zmiana nie dotyczy bieżącego
            miesiąca.</span
          >
          <p v-if="messages.default" role="alert" class="notice">
            {{ messages.default }}
          </p>
          <p v-else-if="saved.default" role="status" class="muted">
            Zapisano limit domyślny.
          </p>
        </form>
        <h2>Wcześniejsze miesiące</h2>
        <p v-if="!data.earlier.length" class="muted">
          Nie ma wcześniejszych miesięcy z budżetem.
        </p>
        <table v-else class="ai-table" data-testid="ai-budget-earlier">
          <thead>
            <tr>
              <th>Miesiąc</th>
              <th>Limit</th>
              <th>Koszt obciążający budżet</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="month in data.earlier" :key="month.month">
              <td>{{ monthText(month.month) }}</td>
              <td>{{ amountText(month.limit) }}</td>
              <td>{{ amountText(month.charge) }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import {
  changeFilters,
  changePageSize,
  choiceOnClose,
  choiceSummary,
  clearFilters,
  detailNumbers,
  emptyHistoryText,
  filtersAtDefault,
  groupByDay,
  historyAddress,
  pageSizes,
  periodChoices,
  rowResult,
  rowTime,
  showPage,
  sourceName,
  stateLabels,
  syncCourse,
  syncProblem,
  syncStates,
  triggerChoices,
  triggerIcons,
  triggerTooltips,
  type PageSize,
  type SyncDetails,
  type SyncHistoryFilters,
  type SyncHistoryPage,
  type SyncHistoryQuery,
  type SyncPeriod,
  type SyncState,
  type SyncTrigger,
} from '../../modules/sources/view'
import {
  escapeCloses,
  pageJumpKey,
  pageJumpNumbers,
  tooltipPosition,
  type PageJump,
} from '../utils/page-controls'
import { isNotFound } from '../utils/fetch-errors'

/**
 * The page "Synchronizacje" (T1): the history of every sync grouped by
 * day, its filters and pages in the address, and one sync's details in a
 * drawer. It does not refresh by itself; "Odśwież" reads the list and the
 * open details again.
 */
useHead({ title: 'Synchronizacje — Oferty pracy' })
const route = useRoute()
const listQuery = computed(() =>
  Object.fromEntries(
    Object.entries(route.query).filter(([key]) => key !== 'sync'),
  ),
)
const {
  data,
  error,
  status,
  refresh: refreshList,
} = await useFetch<SyncHistoryPage>('/api/sources/syncs', {
  query: listQuery,
})
const selected = computed(() =>
  typeof route.query.sync === 'string' ? route.query.sync : '',
)
const request = useRequestFetch()
const {
  data: details,
  error: detailsError,
  refresh: refreshDetails,
} = await useAsyncData(
  'sync-details',
  async (): Promise<SyncDetails | null> => {
    if (!selected.value) return null
    try {
      return await request<SyncDetails>(
        `/api/sources/syncs/${encodeURIComponent(selected.value)}`,
      )
    } catch (failure) {
      // Only an unknown sync shows the list without details (T1-R16);
      // any other failure shows a notice.
      if (isNotFound(failure)) return null
      throw failure
    }
  },
  { watch: [selected] },
)
async function refresh() {
  await Promise.all([refreshList(), refreshDetails()])
}

/** The query the page shows, as the read normalised it. */
const current = computed<SyncHistoryQuery | null>(() =>
  data.value
    ? { ...data.value.filters, page: data.value.page, size: data.value.size }
    : null,
)
function go(query: SyncHistoryQuery, sync: string | null = selected.value) {
  return navigateTo({ path: '/syncs', query: historyAddress(query, sync) })
}
function setFilters(change: Partial<SyncHistoryFilters>) {
  if (current.value) void go(changeFilters(current.value, change))
}
const names = computed(
  () =>
    new Map(
      (data.value?.sources ?? []).map((source) => [source.id, source.name]),
    ),
)
const nameOf = (id: string) => names.value.get(id) ?? sourceName(id)
const days = computed(() =>
  groupByDay(
    (data.value?.items ?? []).map((item) => ({
      ...item,
      time: rowTime(item),
      result: rowResult(item),
    })),
  ),
)

// Multi-choice lists: a choice applies when the list closes (T1-R08).
const ticked = reactive<{ sources: string[]; states: SyncState[] }>({
  sources: [],
  states: [],
})
const sourceList = ref<HTMLDetailsElement>()
const stateList = ref<HTMLDetailsElement>()
function toggled(key: 'sources' | 'states', event: Event) {
  if (!current.value) return
  const open = (event.target as HTMLDetailsElement).open
  if (open) {
    ticked[key] = [...current.value[key]] as never
    return
  }
  const choice = choiceOnClose<string>(current.value[key], ticked[key])
  if (choice) setFilters({ [key]: choice })
}
function closeLists(except?: EventTarget | null) {
  for (const list of [sourceList.value, stateList.value])
    if (list?.open && !(except instanceof Node && list.contains(except)))
      list.open = false
}

// The page list under "Strona X z Y" (T1-R09).
const jump = ref<PageJump | null>(null)
const jumpKeys = ref<HTMLInputElement>()
const jumpBox = ref<HTMLElement>()
const jumpNumbers = computed(() =>
  jump.value && data.value ? pageJumpNumbers(data.value.pages, jump.value) : [],
)
async function toggleJump() {
  jump.value = jump.value ? null : { typed: '' }
  if (jump.value) {
    await nextTick()
    jumpKeys.value?.focus({ preventScroll: true })
  }
}
function jumpKey(event: KeyboardEvent) {
  if (!jump.value || !data.value) return
  const outcome = pageJumpKey(data.value.pages, jump.value, event.key)
  if (/^\d$|^Backspace$|^Enter$|^Escape$/.test(event.key)) {
    event.preventDefault()
    event.stopPropagation()
  }
  if (outcome.action === 'list') jump.value = outcome.jump
  else if (outcome.action === 'close') jump.value = null
  else openPage(outcome.page)
}
function openPage(page: number) {
  jump.value = null
  if (current.value) void go(showPage(current.value, page))
}

function closeDetails() {
  if (current.value) void go(current.value, null)
  else void navigateTo({ path: '/syncs', query: listQuery.value })
}
function openDetails(id: string) {
  if (current.value) void go(current.value, id)
}

// The tooltip of the state labels and the way-of-starting icon (T1-R07).
const tip = reactive({ text: '', left: 0, top: 0, shown: false })
const tipBox = ref<HTMLElement>()
async function showTip(event: Event) {
  const anchor = (event.target as Element | null)?.closest?.('[data-tip]')
  if (!anchor) {
    tip.shown = false
    return
  }
  tip.text = anchor.getAttribute('data-tip') ?? ''
  tip.shown = true
  await nextTick()
  const box = tipBox.value
  if (!box) return
  const position = tooltipPosition(
    anchor.getBoundingClientRect(),
    { width: box.offsetWidth, height: box.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  )
  tip.left = position.left
  tip.top = position.top
}
const hideTip = () => (tip.shown = false)

function onMouseDown(event: MouseEvent) {
  closeLists(event.target)
  if (jump.value && !jumpBox.value?.contains(event.target as Node))
    jump.value = null
}
function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  const closes = escapeCloses({
    filterList: !!(sourceList.value?.open || stateList.value?.open),
    pageList: !!jump.value,
    details: !!details.value,
  })
  if (closes === 'filterList') closeLists()
  else if (closes === 'pageList') jump.value = null
  else if (closes === 'details') closeDetails()
}
onMounted(() => {
  document.addEventListener('mousedown', onMouseDown)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('scroll', hideTip, true)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onMouseDown)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('scroll', hideTip, true)
})

const problem = computed(() =>
  details.value ? syncProblem(details.value) : null,
)
const selectValue = (event: Event) => (event.target as HTMLSelectElement).value
</script>

<template>
  <div class="workspace" @mouseover="showTip" @focusin="showTip">
    <AppHeader current="syncs" />
    <main class="offers-main">
      <div class="page-heading">
        <div>
          <p class="eyebrow">SYNCHRONIZACJA OGŁOSZEŃ</p>
          <h1>Synchronizacje</h1>
        </div>
        <UButton variant="outline" data-testid="sync-refresh" @click="refresh"
          >Odśwież</UButton
        >
      </div>

      <div v-if="data && current" class="sync-toolbar">
        <label
          >Źródło
          <details
            ref="sourceList"
            class="sync-choice"
            data-testid="sync-filter-source"
            @toggle="toggled('sources', $event)"
          >
            <summary>
              {{ choiceSummary(current.sources, nameOf) }}
            </summary>
            <div class="sync-choice-list">
              <label v-for="source in data.sources" :key="source.id"
                ><input
                  v-model="ticked.sources"
                  type="checkbox"
                  :value="source.id"
                />
                {{ source.name }}</label
              >
            </div>
          </details>
        </label>
        <label
          >Stan
          <details
            ref="stateList"
            class="sync-choice"
            data-testid="sync-filter-state"
            @toggle="toggled('states', $event)"
          >
            <summary>
              {{
                choiceSummary(
                  current.states,
                  (state) => stateLabels[state as SyncState],
                )
              }}
            </summary>
            <div class="sync-choice-list">
              <label v-for="state in syncStates" :key="state"
                ><input
                  v-model="ticked.states"
                  type="checkbox"
                  :value="state"
                />
                {{ stateLabels[state] }}</label
              >
            </div>
          </details>
        </label>
        <label
          >Sposób uruchomienia
          <select
            :value="current.trigger ?? ''"
            data-testid="sync-filter-trigger"
            @change="
              setFilters({
                trigger: (selectValue($event) || null) as SyncTrigger | null,
              })
            "
          >
            <option
              v-for="choice in triggerChoices"
              :key="choice.value"
              :value="choice.value"
              :selected="choice.value === (current.trigger ?? '')"
            >
              {{ choice.label }}
            </option>
          </select>
        </label>
        <label
          >Okres
          <select
            :value="current.period"
            data-testid="sync-filter-period"
            @change="setFilters({ period: selectValue($event) as SyncPeriod })"
          >
            <option
              v-for="choice in periodChoices"
              :key="choice.value"
              :value="choice.value"
              :selected="choice.value === current.period"
            >
              {{ choice.label }}
            </option>
          </select>
        </label>
        <UButton
          v-if="!filtersAtDefault(current)"
          variant="ghost"
          class="sync-clear"
          data-testid="sync-clear-filters"
          @click="go(clearFilters(current))"
          >Wyczyść filtry</UButton
        >
      </div>

      <p
        v-if="detailsError && !error"
        role="alert"
        class="notice"
        data-testid="sync-details-error"
      >
        Nie udało się wczytać szczegółów synchronizacji. Spróbuj odświeżyć
        stronę.
      </p>
      <p v-if="error" role="alert" class="notice">
        Nie udało się wczytać synchronizacji. Spróbuj odświeżyć stronę.
      </p>
      <p v-else-if="status === 'pending' && !data" role="status">
        Wczytywanie synchronizacji…
      </p>
      <template v-else-if="data && current">
        <div
          v-if="!data.items.length"
          class="sync-empty"
          data-testid="sync-empty"
        >
          <p>{{ emptyHistoryText }}</p>
          <UButton
            v-if="!filtersAtDefault(current)"
            variant="outline"
            @click="go(clearFilters(current))"
            >Wyczyść filtry</UButton
          >
        </div>
        <template v-else>
          <div class="sync-row sync-head" aria-hidden="true">
            <span>Godzina</span><span>Źródło</span><span>Wynik</span
            ><span class="sync-state-cell">Stan</span>
          </div>
          <section
            v-for="day in days"
            :key="day.heading"
            data-testid="sync-day"
          >
            <h2 class="sync-day">{{ day.heading }}</h2>
            <div class="sync-day-list">
              <div
                v-for="item in day.items"
                :key="item.id"
                :class="['sync-row', { selected: item.id === selected }]"
                data-testid="sync-row"
                :data-sync="item.id"
                role="button"
                tabindex="0"
                @click="openDetails(item.id)"
                @keydown.enter="openDetails(item.id)"
              >
                <span class="sync-time">{{ item.time }}</span>
                <span class="sync-source">{{ nameOf(item.source) }}</span>
                <span class="sync-result" data-testid="sync-result">
                  <span v-if="item.result.kind !== 'finished'" class="muted">{{
                    item.result.text
                  }}</span>
                  <template v-else>
                    <span
                      v-for="part in item.result.parts"
                      :key="part.key"
                      :class="[`sync-${part.key}`, { zero: part.zero }]"
                      >{{ part.text }}</span
                    >
                  </template>
                </span>
                <span class="sync-state-cell"
                  ><SyncStateLabel :state="item.status"
                /></span>
              </div>
            </div>
          </section>
        </template>

        <nav class="sync-pager" aria-label="Strony synchronizacji">
          <UButton
            variant="outline"
            :disabled="current.page <= 1"
            @click="openPage(current.page - 1)"
            >Poprzednia</UButton
          >
          <span ref="jumpBox" class="sync-jump">
            <button
              type="button"
              class="sync-jump-button"
              aria-haspopup="listbox"
              :aria-expanded="jump ? 'true' : 'false'"
              data-testid="sync-page-jump"
              @click="toggleJump"
            >
              Strona {{ data.page }} z {{ data.pages }}
            </button>
            <div v-if="jump" class="sync-jump-list">
              <input
                ref="jumpKeys"
                class="sync-jump-keys"
                inputmode="numeric"
                autocomplete="off"
                aria-label="Numer strony"
                @keydown="jumpKey"
              />
              <p v-if="jump.typed" class="sync-jump-typed">{{ jump.typed }}</p>
              <div role="listbox">
                <button
                  v-for="page in jumpNumbers"
                  :key="page"
                  type="button"
                  role="option"
                  :aria-selected="page === data.page"
                  @click="openPage(page)"
                >
                  Strona {{ page }}
                </button>
                <span v-if="!jumpNumbers.length" class="muted"
                  >Brak takiej strony</span
                >
              </div>
            </div>
          </span>
          <UButton
            variant="outline"
            :disabled="current.page >= data.pages"
            @click="openPage(current.page + 1)"
            >Następna</UButton
          >
          <label class="sync-size"
            >Na stronie
            <select
              :value="String(current.size)"
              data-testid="sync-page-size"
              @change="
                go(
                  changePageSize(
                    current,
                    Number(selectValue($event)) as PageSize,
                  ),
                )
              "
            >
              <option
                v-for="size in pageSizes"
                :key="size"
                :value="String(size)"
                :selected="size === current.size"
              >
                {{ size }}
              </option>
            </select>
          </label>
        </nav>
      </template>

      <template v-if="details">
        <div class="sync-backdrop" @click="closeDetails" />
        <aside
          class="sync-drawer"
          aria-label="Szczegóły synchronizacji"
          data-testid="sync-details"
        >
          <div class="sync-drawer-top">
            <p class="eyebrow">SZCZEGÓŁY SYNCHRONIZACJI</p>
            <UButton
              variant="ghost"
              size="sm"
              data-testid="sync-details-close"
              @click="closeDetails"
              >Zamknij</UButton
            >
          </div>
          <h2 class="sync-drawer-title">
            {{ nameOf(details.source) }}
            <span
              class="sync-trigger"
              :data-tip="triggerTooltips[details.trigger]"
              :data-trigger="details.trigger"
              tabindex="0"
              ><SyncIcon :paths="triggerIcons[details.trigger].paths"
            /></span>
          </h2>
          <SyncStateLabel :state="details.status" />
          <div
            v-if="problem"
            :class="['sync-problem', { failed: details.status === 'failed' }]"
            data-testid="sync-problem"
          >
            {{ problem.text }}
          </div>
          <div class="sync-facts">
            <div
              v-for="fact in detailNumbers(details)"
              :key="fact.label"
              class="sync-fact"
            >
              <b>{{ fact.value }}</b
              ><small>{{ fact.label }}</small>
            </div>
          </div>
          <section class="sync-section">
            <h3>Przebieg</h3>
            <dl>
              <template v-for="step in syncCourse(details)" :key="step.label">
                <dt>{{ step.label }}</dt>
                <dd>{{ step.value }}</dd>
              </template>
            </dl>
          </section>
          <section v-if="problem?.technical" class="sync-section">
            <details data-testid="sync-technical">
              <summary class="muted">Szczegóły techniczne</summary>
              <pre>{{ problem.technical }}</pre>
            </details>
          </section>
        </aside>
      </template>
    </main>
    <div
      v-show="tip.shown"
      ref="tipBox"
      class="sync-tip"
      role="tooltip"
      :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
    >
      {{ tip.text }}
    </div>
  </div>
</template>

<style scoped>
.sync-toolbar {
  display: flex;
  gap: 10px;
  align-items: end;
  flex-wrap: wrap;
  margin: 16px 0 12px;
}
.sync-toolbar > label,
.sync-size {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  color: #69766f;
  gap: 2px;
}
.sync-toolbar select,
.sync-choice summary,
.sync-size select {
  width: 180px;
  height: 34px;
  font-size: 14px;
  padding: 5px 8px;
  border: 1px solid #dce4dd;
  border-radius: 7px;
  background: #fff;
  color: #20372f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sync-size select {
  width: 80px;
}
.sync-choice {
  position: relative;
}
.sync-choice summary {
  list-style: none;
  cursor: pointer;
}
.sync-choice[open] summary {
  border-color: #245c44;
}
.sync-choice-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 4;
  background: #fff;
  border: 1px solid #dce4dd;
  border-radius: 9px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 6px;
  min-width: 210px;
  max-height: 320px;
  overflow: auto;
}
.sync-choice-list label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  font-size: 13px;
  color: #20372f;
  cursor: pointer;
}
.sync-clear {
  margin-left: auto;
}
.sync-row {
  display: grid;
  grid-template-columns: 62px 190px 1fr 120px;
  gap: 12px;
  align-items: center;
  padding: 9px 16px;
  cursor: pointer;
  border-bottom: 1px solid #eef2ee;
}
.sync-row:hover {
  background: #f7faf6;
}
.sync-row.selected {
  background: #eef5ec;
}
.sync-head {
  cursor: default;
  border: 0;
  font-size: 11px;
  color: #69766f;
  font-weight: 600;
}
.sync-head:hover {
  background: none;
}
.sync-day {
  margin: 18px 0 6px;
  font-size: 12px;
  font-weight: 650;
  color: #69766f;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.sync-day-list {
  background: #fff;
  border: 1px solid #dce4dd;
  border-radius: 12px;
}
.sync-day-list .sync-row:last-child {
  border-bottom: 0;
}
.sync-time {
  font-variant-numeric: tabular-nums;
  color: #69766f;
  font-size: 13px;
}
.sync-source {
  font-weight: 600;
}
.sync-result {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
}
.sync-new {
  color: #2f6b3f;
  font-weight: 650;
}
.sync-changed {
  color: #4b5f88;
  font-weight: 600;
}
.sync-result .zero {
  color: #a3aea7;
  font-weight: 400;
}
.sync-state-cell {
  justify-self: end;
}
:deep(.sync-state) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 1px 9px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: help;
}
:deep(.sync-state-queued) {
  color: #6b7280;
  background: #eef0f2;
}
:deep(.sync-state-running) {
  color: #1d5fa8;
  background: #e6effa;
}
:deep(.sync-state-complete) {
  color: #2f6b3f;
  background: #e3f0e3;
}
:deep(.sync-state-partial) {
  color: #8a5a00;
  background: #fbf0d9;
}
:deep(.sync-state-failed) {
  color: #a1302a;
  background: #f9e3e1;
}
.sync-empty {
  padding: 40px;
  text-align: center;
  color: #69766f;
  background: #fff;
  border: 1px solid #dce4dd;
  border-radius: 12px;
}
.sync-pager {
  display: flex;
  justify-content: center;
  align-items: end;
  gap: 14px;
  margin: 18px 0;
  font-size: 13px;
  color: #69766f;
}
.sync-jump {
  position: relative;
  align-self: center;
}
.sync-jump-button {
  border: 0;
  background: none;
  color: #245c44;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.sync-jump-list {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  border: 1px solid #dce4dd;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  padding: 8px;
  width: 160px;
  z-index: 4;
}
.sync-jump-list [role='listbox'] {
  display: flex;
  flex-direction: column;
  max-height: 220px;
  overflow: auto;
}
.sync-jump-list button {
  border: 0;
  border-radius: 6px;
  background: none;
  padding: 5px 10px;
  font-size: 13px;
  cursor: pointer;
}
.sync-jump-list button:hover {
  background: #f3f6f2;
}
.sync-jump-list button[aria-selected='true'] {
  font-weight: 650;
  color: #245c44;
  background: #eef5ec;
}
.sync-jump-keys {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  border: 0;
  padding: 0;
  pointer-events: none;
}
.sync-jump-typed {
  margin: 0 2px 6px;
  text-align: center;
  font-weight: 650;
  color: #20372f;
}
.sync-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 30, 25, 0.25);
  z-index: 5;
}
.sync-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(460px, 100vw);
  background: #fff;
  z-index: 6;
  padding: 22px;
  overflow: auto;
  box-shadow: -8px 0 30px rgba(0, 0, 0, 0.12);
}
.sync-drawer-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sync-drawer-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 20px;
  font-weight: 650;
  margin: 4px 0;
}
.sync-trigger {
  display: inline-flex;
  color: #69766f;
  cursor: help;
}
.sync-problem {
  background: #fbf0d9;
  border-radius: 9px;
  padding: 10px 12px;
  margin-top: 12px;
  font-size: 13px;
}
.sync-problem.failed {
  background: #f9e3e1;
}
.sync-facts {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin: 14px 0;
}
.sync-fact {
  border: 1px solid #dce4dd;
  border-radius: 9px;
  padding: 9px 11px;
}
.sync-fact b {
  display: block;
  font-size: 21px;
  line-height: 1.2;
}
.sync-fact small {
  color: #69766f;
}
.sync-section {
  border-top: 1px solid #dce4dd;
  padding-top: 14px;
  margin-top: 14px;
}
.sync-section h3 {
  font-size: 13px;
  font-weight: 650;
  margin: 0 0 10px;
}
.sync-section dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 16px;
  margin: 0;
  font-size: 13px;
}
.sync-section dt {
  color: #69766f;
}
.sync-section dd {
  margin: 0;
}
.sync-section pre {
  background: #f5f7f4;
  border-radius: 8px;
  padding: 10px;
  font-size: 11px;
  overflow: auto;
  white-space: pre-wrap;
}
.sync-tip {
  position: fixed;
  z-index: 100;
  max-width: min(380px, calc(100vw - 32px));
  font-size: 12px;
  line-height: 1.45;
  padding: 8px 12px;
  border-radius: 8px;
  background: #1f2a24;
  color: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}
</style>

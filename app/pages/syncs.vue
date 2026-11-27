<script setup lang="ts">
import {
  afterRequestQuery,
  canConfirm,
  dialogSources,
  dialogTitles,
  initiallyChecked,
  panelScopeText,
  requestFailure,
  requestSummary,
  rerunOffered,
  rerunOutcome,
  unansweredRequest,
  type DialogPreset,
  type DialogSource,
  type PanelSyncResult,
  changeFilters,
  clearFilters,
  detailNumbers,
  emptyHistoryText,
  filtersAtDefault,
  groupByDay,
  historyAddress,
  periodChoices,
  rowResult,
  rowTime,
  sourceName,
  stateLabels,
  syncCourse,
  syncProblem,
  syncStates,
  triggerChoices,
  triggerIcons,
  triggerTooltips,
  type SyncDetails,
  type SyncHistoryFilters,
  type SyncHistoryPage,
  type SyncHistoryQuery,
  type SyncPeriod,
  type SyncTrigger,
  type UnavailableContext,
  shownWarnings,
  stripCounts,
  healthFailureText,
  warningHeading,
  warningQuery,
  warningReasons,
} from '../../modules/sources/view'
import { changePageSize, showPage, type PageSize } from '../../lib/paging'
import {
  escapeCloses,
  navigationStayed,
  tooltipPosition,
} from '../utils/page-controls'
import { isNotFound } from '../utils/fetch-errors'
import { readSyncPage } from '../utils/sync-page-read'

/**
 * The page "Synchronizacje" (T1, T3, T4): the summary strip and the
 * warning of source health, the history of every sync grouped by day, its
 * filters and pages in the address, one sync's details in a drawer, and
 * requesting syncs through a dialog of the sources or "Uruchom ponownie"
 * in the details. It does not refresh by itself; "Odśwież" reads the list
 * with the strip and the open details again.
 */
useHead({ title: 'Synchronizacje — Oferty pracy' })
const route = useRoute()
const listQuery = computed(() =>
  Object.fromEntries(
    Object.entries(route.query).filter(([key]) => key !== 'sync'),
  ),
)
const request = useRequestFetch()
// Every read of the list reads the strip too (T4-R07).
const {
  data: pageData,
  error,
  status,
  refresh: refreshList,
} = await useAsyncData(
  'sync-history',
  () => readSyncPage(request, listQuery.value),
  { watch: [listQuery] },
)
const data = computed<SyncHistoryPage | null>(
  () => pageData.value?.history ?? null,
)
const health = computed(() => pageData.value?.health ?? null)
// ASSUMPTION(oferty-pracy-nq3.4/ASM-2): a strip that cannot be read leaves the history working and shows a notice in its place.
const healthFailed = computed(() => !!pageData.value && !pageData.value.health)
const selected = computed(() =>
  typeof route.query.sync === 'string' ? route.query.sync : '',
)
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
/** What the unavailable count of a sync of the source needs (T2). */
const marking = computed(
  () =>
    new Set(
      (data.value?.sources ?? [])
        .filter((source) => source.marksUnavailable)
        .map((source) => source.id),
    ),
)
const unavailableContext = (source: string): UnavailableContext => ({
  marksUnavailable: marking.value.has(source),
  countedSince: data.value?.unavailableCountedSince ?? null,
})
const days = computed(() =>
  groupByDay(
    (data.value?.items ?? []).map((item) => ({
      ...item,
      time: rowTime(item),
      result: rowResult(item, unavailableContext(item.source)),
    })),
  ),
)

// The shared filter and paging; the page decides what Escape closes.
const sourceFilter = ref<{ isOpen: () => boolean; close: () => void }>()
const stateFilter = ref<{ isOpen: () => boolean; close: () => void }>()
const pager = ref<{ listOpen: () => boolean; closeList: () => void }>()
const filterLists = () => [sourceFilter.value, stateFilter.value]
const sourceOptions = computed(() =>
  (data.value?.sources ?? []).map((source) => ({
    value: source.id,
    label: source.name,
  })),
)
const stateOptions = syncStates.map((state) => ({
  value: state,
  label: stateLabels[state],
}))
function openPage(page: number) {
  if (current.value) void go(showPage(current.value, page))
}
function choosePageSize(size: PageSize) {
  if (current.value) void go(changePageSize(current.value, size))
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

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  const closes = escapeCloses({
    dialog: !!dialog.value,
    filterList: filterLists().some((list) => list?.isOpen()),
    pageList: !!pager.value?.listOpen(),
    details: !!details.value,
  })
  if (closes === 'dialog') dialog.value = null
  else if (closes === 'filterList')
    for (const list of filterLists()) list?.close()
  else if (closes === 'pageList') pager.value?.closeList()
  else if (closes === 'details') closeDetails()
}
onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('scroll', hideTip, true)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('scroll', hideTip, true)
})

// The warning of source health (T4-R06): folded to 3 names until expanded.
const warningExpanded = ref(false)
const warning = computed(() =>
  health.value
    ? shownWarnings(health.value.warnings, warningExpanded.value)
    : null,
)
function showSource(source: string) {
  if (current.value) void go(warningQuery(current.value, source))
}

const problem = computed(() =>
  details.value ? syncProblem(details.value) : null,
)

// Requesting syncs (T3): the dialog of the sources and its outcome.
const dialog = ref<{
  preset: DialogPreset
  sources: DialogSource[]
  checked: string[]
} | null>(null)
const sending = ref(false)
const outcome = ref<{ summary: string; failure: string | null } | null>(null)
function openDialog(preset: DialogPreset) {
  if (!data.value) return
  const sources = dialogSources(data.value.sources)
  dialog.value = { preset, sources, checked: initiallyChecked(sources, preset) }
}
/**
 * One request with every source; no answer counts each as not requested.
 * ASSUMPTION(oferty-pracy-nq3.3/ASM-2): a request without an answer counts every sent source as not requested.
 */
async function requestSyncs(sources: string[]): Promise<PanelSyncResult> {
  try {
    return await $fetch<PanelSyncResult>('/api/sources/syncs', {
      method: 'POST',
      body: { sources },
    })
  } catch {
    return unansweredRequest(sources)
  }
}
/** Shows the query and the sync, reading the list once (T3-R07, R08). */
async function showAfterRequest(query: SyncHistoryQuery, sync: string | null) {
  if (navigationStayed(await go(query, sync))) await refreshList()
}
async function confirmDialog() {
  if (!dialog.value || !canConfirm(dialog.value.checked) || !current.value)
    return
  sending.value = true
  try {
    const result = await requestSyncs(dialog.value.checked)
    outcome.value = {
      summary: requestSummary(result.counts),
      failure: requestFailure(result.counts),
    }
    dialog.value = null
    await showAfterRequest(afterRequestQuery(current.value), selected.value)
  } finally {
    sending.value = false
  }
}
// ASSUMPTION(oferty-pracy-nq3.3/ASM-1): a rerun that requested nothing keeps the details and shows the dialog's summary and message.
async function rerun() {
  if (!details.value || !current.value) return
  sending.value = true
  try {
    const next = rerunOutcome(await requestSyncs([details.value.source]))
    outcome.value = 'open' in next ? null : next
    await showAfterRequest(
      current.value,
      'open' in next ? next.open : selected.value,
    )
  } finally {
    sending.value = false
  }
}
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
        <div class="sync-actions">
          <UButton variant="outline" data-testid="sync-refresh" @click="refresh"
            >Odśwież</UButton
          >
          <template v-if="data">
            <UButton
              variant="outline"
              data-testid="sync-choose"
              @click="openDialog('none')"
              >Wybierz źródła</UButton
            >
            <UButton data-testid="sync-all" @click="openDialog('all')"
              >Synchronizuj wszystkie</UButton
            >
          </template>
        </div>
      </div>

      <section
        v-if="health"
        class="sync-strip"
        aria-label="Podsumowanie synchronizacji"
        data-testid="sync-strip"
      >
        <span
          v-for="count in stripCounts(health)"
          :key="count.key"
          class="sync-count"
          :data-count="count.key"
          ><b>{{ count.value }}</b> {{ count.label }}</span
        >
        <!-- ASSUMPTION(oferty-pracy-nq3.4/ASM-1): each source shows its reasons in brackets after its name. -->
        <p v-if="warning" class="sync-warning" data-testid="sync-warning">
          <span class="muted">{{ warningHeading }}:</span>
          <template v-for="(item, index) in warning.shown" :key="item.source">
            <button
              type="button"
              class="sync-link"
              :data-source="item.source"
              @click="showSource(item.source)"
            >
              {{ item.name }}</button
            ><span class="muted">
              ({{ warningReasons(item) }}){{
                index < warning.shown.length - 1 ? ',' : ''
              }}</span
            >
          </template>
          <button
            v-if="warning.more"
            type="button"
            class="sync-link"
            data-testid="sync-warning-more"
            @click="warningExpanded = true"
          >
            {{ warning.more }}
          </button>
        </p>
      </section>

      <!-- ASSUMPTION(oferty-pracy-nq3.4/ASM-2): a strip that cannot be read leaves the history working and shows a notice in its place. -->
      <p
        v-if="healthFailed"
        role="alert"
        class="notice"
        data-testid="sync-strip-error"
      >
        {{ healthFailureText }}
      </p>

      <div v-if="outcome" class="sync-outcome" data-testid="sync-outcome">
        <p role="status">{{ outcome.summary }}</p>
        <p v-if="outcome.failure" role="alert" class="notice">
          {{ outcome.failure }}
        </p>
      </div>

      <div v-if="data && current" class="sync-toolbar">
        <MultiChoiceFilter
          ref="sourceFilter"
          label="Źródło"
          :options="sourceOptions"
          :chosen="current.sources"
          data-testid="sync-filter-source"
          @change="setFilters({ sources: $event })"
        />
        <MultiChoiceFilter
          ref="stateFilter"
          label="Stan"
          :options="stateOptions"
          :chosen="current.states"
          data-testid="sync-filter-state"
          @change="setFilters({ states: $event })"
        />
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
                      :data-tip="part.tip"
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

        <PagePager
          ref="pager"
          :page="data.page"
          :pages="data.pages"
          :size="current.size"
          label="Strony synchronizacji"
          @page="openPage"
          @size="choosePageSize"
        />
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
            v-if="data && rerunOffered(details, data.sources)"
            class="sync-rerun"
          >
            <UButton data-testid="sync-rerun" :disabled="sending" @click="rerun"
              >Uruchom ponownie</UButton
            >
          </div>
          <div
            v-if="problem"
            :class="['sync-problem', { failed: details.status === 'failed' }]"
            data-testid="sync-problem"
          >
            {{ problem.text }}
          </div>
          <div class="sync-facts">
            <div
              v-for="fact in detailNumbers(
                details,
                unavailableContext(details.source),
              )"
              :key="fact.label"
              class="sync-fact"
            >
              <b :data-tip="fact.tip" :tabindex="fact.tip ? 0 : undefined">{{
                fact.value
              }}</b
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

      <template v-if="dialog">
        <div
          class="sync-backdrop sync-dialog-backdrop"
          @click="dialog = null"
        />
        <div
          class="sync-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sync-dialog-title"
          data-testid="sync-dialog"
        >
          <h2 id="sync-dialog-title">{{ dialogTitles[dialog.preset] }}</h2>
          <p class="muted">
            Zaznaczone źródła dostaną po jednej synchronizacji. Źródło, które
            już ma trwającą, nie dostanie drugiej.
          </p>
          <div class="sync-dialog-list">
            <label
              v-for="source in dialog.sources"
              :key="source.id"
              :class="['sync-dialog-item', { off: !source.checkable }]"
              ><input
                v-model="dialog.checked"
                type="checkbox"
                :value="source.id"
                :disabled="!source.checkable"
              />
              {{ source.name }}
              <span v-if="source.note" class="sync-dialog-note">{{
                source.note
              }}</span></label
            >
          </div>
          <p class="muted">
            Każde źródło pobiera ten sam zakres: {{ panelScopeText }}.
          </p>
          <div class="sync-dialog-foot">
            <UButton variant="outline" @click="dialog = null">Anuluj</UButton>
            <UButton
              data-testid="sync-confirm"
              :disabled="!canConfirm(dialog.checked) || sending"
              @click="confirmDialog"
              >Synchronizuj</UButton
            >
          </div>
        </div>
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
.sync-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  align-items: baseline;
  margin: 16px 0 0;
  padding: 12px 16px;
  border: 1px solid #e3e8e3;
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
}
.sync-count b {
  font-size: 18px;
}
.sync-warning {
  flex-basis: 100%;
  margin: 0;
}
.sync-link {
  border: 0;
  background: none;
  padding: 0;
  margin-left: 4px;
  font-size: inherit;
  color: #2f7d4f;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.sync-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sync-outcome {
  margin: 12px 0 0;
  font-size: 13px;
}
.sync-outcome p {
  margin: 4px 0;
}
.sync-rerun {
  margin-top: 12px;
}
.sync-dialog-backdrop {
  z-index: 7;
}
.sync-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 8;
  width: min(620px, 94vw);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 14px;
  padding: 22px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}
.sync-dialog h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
}
.sync-dialog-list {
  max-height: 52vh;
  overflow: auto;
  border: 1px solid #dce4dd;
  border-radius: 9px;
  margin: 12px 0;
}
.sync-dialog-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 12px;
  border-top: 1px solid #f0f2ef;
  font-size: 13px;
}
.sync-dialog-item:first-child {
  border-top: 0;
}
.sync-dialog-item.off {
  color: #9aa49e;
}
.sync-dialog-note {
  margin-left: auto;
  font-size: 12px;
  color: #69766f;
}
.sync-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.sync-toolbar {
  display: flex;
  gap: 10px;
  align-items: end;
  flex-wrap: wrap;
  margin: 16px 0 12px;
}
.sync-toolbar > label {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  color: #69766f;
  gap: 2px;
}
.sync-toolbar select {
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
.sync-unavailable {
  color: #8a4b2f;
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

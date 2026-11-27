<script setup lang="ts">
import { changePageSize, showPage, type PageSize } from '../../lib/paging'
import { formatDate, formatDateTime } from '../../lib/time/index'
import {
  salaryLabel,
  salaryOriginLabel,
  salaryTermsLabel,
} from '../../modules/offers/view'
import {
  applicationsAddress,
  changeStageChoice,
  noteCounterText,
  stageChoiceLabels,
  stageChoices,
  type ApplicationsQuery,
  type StageChoice,
} from '../../modules/recruitments/view'
import { escapeCloses } from '../utils/page-controls'
import {
  detailsReadFailureText,
  emptyListText,
  listReadFailureText,
  noteCheckText,
  noteSaveFailureText,
  noteSavedText,
  queryAfterMove,
  readApplicationDrawer,
  readMyListPage,
} from '../utils/my-list'

/**
 * The page "Moja lista" (lq3 T2): the offers with an application not
 * removed from the list, by the stage switch, from the latest stage change,
 * with the shared paging, the switch, the page and the open application in
 * the address; and the application details in a drawer with the stage
 * field, the note and the history of stages.
 */
useHead({ title: 'Moja lista — Oferty pracy' })
const route = useRoute()
const listQuery = computed(() =>
  Object.fromEntries(
    Object.entries(route.query).filter(([key]) => key !== 'offer'),
  ),
)
const request = useRequestFetch()
const {
  data,
  error,
  status,
  refresh: refreshList,
} = await useAsyncData(
  'my-list',
  () => readMyListPage(request, listQuery.value),
  { watch: [listQuery] },
)
const list = computed(() => data.value?.list ?? null)
const selected = computed(() =>
  typeof route.query.offer === 'string' ? route.query.offer : '',
)
const {
  data: details,
  error: detailsError,
  refresh: refreshDetails,
} = await useAsyncData(
  'my-list-details',
  () => readApplicationDrawer(request, selected.value),
  { watch: [selected] },
)

/** The query the page shows, as the read normalised it. */
const current = computed<ApplicationsQuery | null>(() =>
  list.value
    ? { stage: list.value.stage, page: list.value.page, size: list.value.size }
    : null,
)
function go(
  query: ApplicationsQuery,
  offer: string | null = selected.value || null,
  replace = false,
) {
  return navigateTo(
    { path: '/my-list', query: applicationsAddress(query, offer) },
    { replace },
  )
}
function chooseStage(event: Event) {
  const stage = (event.target as HTMLSelectElement).value as StageChoice
  if (current.value) void go(changeStageChoice(current.value, stage))
}
function openPage(page: number) {
  if (current.value) void go(showPage(current.value, page))
}
function choosePageSize(size: PageSize) {
  if (current.value) void go(changePageSize(current.value, size))
}
function openDetails(offerId: string) {
  if (current.value) void go(current.value, offerId)
}
function closeDetails() {
  if (current.value) void go(current.value, null)
  else void navigateTo({ path: '/my-list', query: listQuery.value })
}

const offerOf = (offerId: string) => data.value?.offers[offerId] ?? null

/**
 * After a move in the details: the details show the new stage and history,
 * the list is read again, and when the row left the last page the address
 * moves to the last page that exists (T2-R10).
 */
async function moved() {
  const shown = current.value
  await Promise.all([refreshDetails(), refreshList()])
  const next = shown && list.value ? queryAfterMove(shown, list.value) : null
  if (next) await go(next, selected.value || null, true)
}

// The note of the open application (A-R09, A-R10, T2-R13). The typed text
// stays while the details are read again after a move.
const note = ref('')
const noteMessage = ref<{ text: string; failed: boolean } | null>(null)
const savingNote = ref(false)
watch(
  () => details.value?.application.offerId,
  () => {
    note.value = details.value?.application.note ?? ''
    noteMessage.value = null
  },
  { immediate: true },
)
async function saveNote() {
  const application = details.value?.application
  if (!application || savingNote.value) return
  const tooLong = noteCheckText(note.value)
  if (tooLong) {
    noteMessage.value = { text: tooLong, failed: true }
    return
  }
  savingNote.value = true
  noteMessage.value = null
  try {
    await $fetch(
      `/api/applications/${encodeURIComponent(application.offerId)}/note`,
      { method: 'POST', body: { note: note.value } },
    )
    // ASSUMPTION(oferty-pracy-lq3.2/ASM-2): a saved note says so.
    noteMessage.value = { text: noteSavedText, failed: false }
  } catch (e) {
    // ASSUMPTION(oferty-pracy-lq3.2/ASM-2): the typed text stays.
    noteMessage.value = { text: noteSaveFailureText(e), failed: true }
  } finally {
    savingNote.value = false
  }
}

// The shared paging; the page decides what Escape closes.
const pager = ref<{ listOpen: () => boolean; closeList: () => void }>()
function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  const closes = escapeCloses({
    dialog: false,
    filterList: false,
    pageList: !!pager.value?.listOpen(),
    // ASSUMPTION(oferty-pracy-lq3.2/ASM-1): a failed read of the details is open details.
    details: !!details.value || !!detailsError.value,
  })
  if (closes === 'pageList') pager.value?.closeList()
  else if (closes === 'details') closeDetails()
}
onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))

const shownDate = (moment: string) => formatDate(new Date(moment))
const shownMoment = (moment: string) => formatDateTime(new Date(moment))
</script>

<template>
  <div class="workspace">
    <AppHeader current="my-list" />
    <main class="offers-main">
      <div class="page-heading">
        <div>
          <p class="eyebrow">REKRUTACJE</p>
          <h1>Moja lista</h1>
        </div>
      </div>

      <div v-if="list && current" class="my-list-toolbar">
        <label
          >Etap
          <select
            :value="current.stage"
            data-testid="my-list-stage"
            @change="chooseStage"
          >
            <option
              v-for="choice in stageChoices"
              :key="choice"
              :value="choice"
              :selected="choice === current.stage"
            >
              {{ stageChoiceLabels[choice] }}
            </option>
          </select>
        </label>
      </div>

      <!-- ASSUMPTION(oferty-pracy-lq3.2/ASM-1) -->
      <p v-if="error" role="alert" class="notice">
        {{ listReadFailureText }}
      </p>
      <p v-else-if="status === 'pending' && !list" role="status">
        Wczytywanie listy…
      </p>
      <template v-else-if="list && current">
        <div
          v-if="!list.items.length"
          class="my-list-empty"
          data-testid="my-list-empty"
        >
          <p>{{ emptyListText }}</p>
        </div>
        <table v-else class="my-list-table" data-testid="my-list-table">
          <thead>
            <tr>
              <th>Oferta</th>
              <th>Etap</th>
              <th>Ostatnia zmiana etapu</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in list.items"
              :key="item.offerId"
              :class="['my-list-row', { selected: item.offerId === selected }]"
              data-testid="my-list-row"
              :data-offer="item.offerId"
              role="button"
              tabindex="0"
              @click="openDetails(item.offerId)"
              @keydown.enter="openDetails(item.offerId)"
            >
              <td>
                <template v-if="offerOf(item.offerId)">
                  <div class="my-list-title">
                    {{ offerOf(item.offerId)!.title
                    }}<span
                      v-if="
                        offerOf(item.offerId)!.availability === 'unavailable'
                      "
                      class="my-list-gone"
                      data-testid="my-list-unavailable"
                      >Niedostępna w źródle</span
                    >
                  </div>
                  <div class="muted my-list-company">
                    {{ offerOf(item.offerId)!.company }}
                  </div>
                </template>
              </td>
              <td><StageLabel :stage="item.stage" /></td>
              <td class="my-list-date" data-testid="my-list-date">
                {{ shownDate(item.stageChangedAt) }}
              </td>
            </tr>
          </tbody>
        </table>

        <PagePager
          ref="pager"
          :page="list.page"
          :pages="list.pages"
          :size="current.size"
          label="Strony listy"
          @page="openPage"
          @size="choosePageSize"
        />
      </template>

      <!-- ASSUMPTION(oferty-pracy-lq3.2/ASM-1): a failed read of the details opens the drawer with its notice. -->
      <template v-if="selected && (details || detailsError)">
        <div class="my-list-backdrop" @click="closeDetails" />
        <aside
          class="my-list-drawer"
          aria-label="Szczegóły aplikacji"
          data-testid="application-details"
        >
          <div class="my-list-drawer-top">
            <p class="eyebrow">APLIKACJA</p>
            <UButton
              variant="ghost"
              size="sm"
              data-testid="application-details-close"
              @click="closeDetails"
              >Zamknij</UButton
            >
          </div>
          <!-- ASSUMPTION(oferty-pracy-lq3.2/ASM-1) -->
          <p v-if="detailsError" role="alert" class="notice">
            {{ detailsReadFailureText }}
          </p>
          <template v-else-if="details">
            <template v-if="details.offer">
              <h2 class="my-list-drawer-title">{{ details.offer.title }}</h2>
              <p class="muted">
                {{ details.offer.company
                }}<span
                  v-if="details.offer.availability === 'unavailable'"
                  class="my-list-gone"
                  >Niedostępna w źródle</span
                >
              </p>
              <section class="my-list-section" data-testid="application-salary">
                <h3>Widełki</h3>
                <div
                  v-for="(salary, i) in details.offer.salaries"
                  :key="i"
                  class="salary"
                >
                  <small v-if="salaryOriginLabel(salary)" class="muted">{{
                    salaryOriginLabel(salary)
                  }}</small>
                  <strong>{{ salaryLabel(salary) }}</strong>
                  <span>{{ salaryTermsLabel(salary) }}</span>
                </div>
                <p v-if="!details.offer.salaries.length" class="muted">
                  Brak danych
                </p>
              </section>
            </template>
            <section class="my-list-section">
              <ApplicationStageField
                :key="details.application.offerId"
                :offer-id="details.application.offerId"
                :stage="details.application.stage"
                @moved="moved"
              />
            </section>
            <section class="my-list-section" data-testid="application-note">
              <h3><label for="application-note">Notatka</label></h3>
              <textarea
                id="application-note"
                v-model="note"
                class="my-list-note"
                rows="6"
              />
              <div class="my-list-note-foot">
                <small class="muted" data-testid="application-note-counter">{{
                  noteCounterText(note)
                }}</small>
                <UButton
                  data-testid="application-note-save"
                  :disabled="savingNote"
                  @click="saveNote"
                  >Zapisz notatkę</UButton
                >
              </div>
              <p
                v-if="noteMessage"
                :role="noteMessage.failed ? 'alert' : 'status'"
                :class="[
                  'my-list-note-message',
                  { failed: noteMessage.failed },
                ]"
              >
                {{ noteMessage.text }}
              </p>
            </section>
            <section class="my-list-section" data-testid="application-history">
              <h3>Historia etapów</h3>
              <ol class="my-list-history">
                <li v-for="(record, i) in details.application.history" :key="i">
                  <time>{{ shownMoment(record.changedAt) }}</time>
                  <StageLabel :stage="record.stage" />
                </li>
              </ol>
            </section>
            <section class="my-list-section">
              <NuxtLink
                class="my-list-link"
                data-testid="application-offer-link"
                :to="{
                  path: '/offers',
                  query: { offer: details.application.offerId },
                }"
                >Otwórz ofertę</NuxtLink
              >
            </section>
          </template>
        </aside>
      </template>
    </main>
  </div>
</template>

<style scoped>
.my-list-toolbar {
  display: flex;
  gap: 10px;
  align-items: end;
  margin: 16px 0 12px;
}
.my-list-toolbar > label {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  color: #69766f;
  gap: 2px;
}
.my-list-toolbar select {
  width: 200px;
  height: 34px;
  font-size: 14px;
  padding: 5px 8px;
  border: 1px solid #dce4dd;
  border-radius: 7px;
  background: #fff;
  color: #20372f;
}
.my-list-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid #dce4dd;
  border-radius: 12px;
}
.my-list-table th {
  text-align: left;
  font-size: 11px;
  color: #69766f;
  font-weight: 600;
  padding: 10px 14px;
  border-bottom: 1px solid #dce4dd;
}
.my-list-table td {
  padding: 11px 14px;
  border-bottom: 1px solid #eef2ee;
}
.my-list-row {
  cursor: pointer;
}
.my-list-row:hover {
  background: #f7faf6;
}
.my-list-row.selected {
  background: #eef5ec;
}
.my-list-title {
  font-weight: 600;
}
.my-list-company {
  font-size: 12px;
}
.my-list-date {
  font-variant-numeric: tabular-nums;
}
.my-list-gone {
  font-size: 11px;
  font-weight: 400;
  color: #a1302a;
  border: 1px solid #efc9c5;
  border-radius: 999px;
  padding: 0 7px;
  margin-left: 6px;
}
.my-list-empty {
  padding: 40px;
  text-align: center;
  color: #69766f;
  background: #fff;
  border: 1px solid #dce4dd;
  border-radius: 12px;
}
.my-list-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 30, 25, 0.25);
  z-index: 5;
}
.my-list-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(480px, 100vw);
  background: #fff;
  z-index: 6;
  padding: 22px;
  overflow: auto;
  box-shadow: -8px 0 30px rgba(0, 0, 0, 0.12);
}
.my-list-drawer-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.my-list-drawer-title {
  font-size: 20px;
  font-weight: 650;
  margin: 4px 0;
}
.my-list-section {
  border-top: 1px solid #dce4dd;
  padding-top: 14px;
  margin-top: 14px;
}
.my-list-section h3 {
  font-size: 13px;
  font-weight: 650;
  margin: 0 0 8px;
}
.my-list-section .salary {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  margin-bottom: 6px;
}
.my-list-note {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  border: 1px solid #dce4dd;
  border-radius: 7px;
  padding: 5px 8px;
}
.my-list-note-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}
.my-list-note-message {
  border-radius: 8px;
  padding: 7px 10px;
  margin-top: 8px;
  font-size: 13px;
  background: #eaf3e6;
}
.my-list-note-message.failed {
  background: #f9e3e1;
  color: #a1302a;
}
.my-list-history {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 13px;
}
.my-list-history li {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 5px 0;
  border-bottom: 1px solid #eef2ee;
}
.my-list-history time {
  color: #69766f;
  min-width: 128px;
  font-variant-numeric: tabular-nums;
}
.my-list-link {
  color: #245c44;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>

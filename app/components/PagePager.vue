<script setup lang="ts">
import { pageSizes, type PageSize } from '../../lib/paging'
import {
  pageJumpKey,
  pageJumpNumbers,
  type PageJump,
} from '../utils/page-controls'

/**
 * The shared paging below a paged list (lq3 T4-R01, nq3 T1-R09):
 * "Poprzednia", "Strona X z Y" opening the list of page numbers that typed
 * digits narrow, "Następna", and the number per page. It shows the page it
 * is given and tells the page which page or number per page was chosen;
 * the page builds its address from that, going back to page 1 for a new
 * number per page with `changePageSize` of the paging library.
 */
const props = defineProps<{
  page: number
  pages: number
  size: PageSize
  /** The accessible name of the paging, e.g. "Strony synchronizacji". */
  label: string
}>()
const emit = defineEmits<{ page: [page: number]; size: [size: PageSize] }>()

const jump = ref<PageJump | null>(null)
const jumpKeys = ref<HTMLInputElement>()
const jumpBox = ref<HTMLElement>()
const jumpNumbers = computed(() =>
  jump.value ? pageJumpNumbers(props.pages, jump.value) : [],
)
async function toggleJump() {
  jump.value = jump.value ? null : { typed: '' }
  if (jump.value) {
    await nextTick()
    jumpKeys.value?.focus({ preventScroll: true })
  }
}
function jumpKey(event: KeyboardEvent) {
  if (!jump.value) return
  const outcome = pageJumpKey(props.pages, jump.value, event.key)
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
  emit('page', page)
}
function chooseSize(event: Event) {
  emit('size', Number((event.target as HTMLSelectElement).value) as PageSize)
}

// A click outside the page list closes it (nq3 T1-R09).
function onMouseDown(event: MouseEvent) {
  if (jump.value && !jumpBox.value?.contains(event.target as Node))
    jump.value = null
}
onMounted(() => document.addEventListener('mousedown', onMouseDown))
onUnmounted(() => document.removeEventListener('mousedown', onMouseDown))

/**
 * Whether the page list is open and a way to close it, so the page decides
 * what one Escape closes among its overlays (`escapeCloses`).
 */
defineExpose({
  listOpen: () => !!jump.value,
  closeList: () => (jump.value = null),
})
</script>

<template>
  <nav class="pager" :aria-label="label">
    <UButton variant="outline" :disabled="page <= 1" @click="openPage(page - 1)"
      >Poprzednia</UButton
    >
    <span ref="jumpBox" class="page-jump">
      <button
        type="button"
        class="page-jump-button"
        aria-haspopup="listbox"
        :aria-expanded="jump ? 'true' : 'false'"
        data-testid="page-jump"
        @click="toggleJump"
      >
        Strona {{ page }} z {{ pages }}
      </button>
      <div v-if="jump" class="page-jump-list">
        <input
          ref="jumpKeys"
          class="page-jump-keys"
          inputmode="numeric"
          autocomplete="off"
          aria-label="Numer strony"
          @keydown="jumpKey"
        />
        <p v-if="jump.typed" class="page-jump-typed">{{ jump.typed }}</p>
        <div role="listbox">
          <button
            v-for="number in jumpNumbers"
            :key="number"
            type="button"
            role="option"
            :aria-selected="number === page"
            @click="openPage(number)"
          >
            Strona {{ number }}
          </button>
          <span v-if="!jumpNumbers.length" class="muted"
            >Brak takiej strony</span
          >
        </div>
      </div>
    </span>
    <UButton
      variant="outline"
      :disabled="page >= pages"
      @click="openPage(page + 1)"
      >Następna</UButton
    >
    <label class="page-size"
      >Na stronie
      <select
        :value="String(size)"
        data-testid="page-size"
        @change="chooseSize"
      >
        <option
          v-for="choice in pageSizes"
          :key="choice"
          :value="String(choice)"
          :selected="choice === size"
        >
          {{ choice }}
        </option>
      </select>
    </label>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  justify-content: center;
  align-items: end;
  gap: 14px;
  margin: 18px 0;
  font-size: 13px;
  color: #69766f;
}
.page-size {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  color: #69766f;
  gap: 2px;
}
.page-size select {
  width: 80px;
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
.page-jump {
  position: relative;
  align-self: center;
}
.page-jump-button {
  border: 0;
  background: none;
  color: #245c44;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.page-jump-list {
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
.page-jump-list [role='listbox'] {
  display: flex;
  flex-direction: column;
  max-height: 220px;
  overflow: auto;
}
.page-jump-list button {
  border: 0;
  border-radius: 6px;
  background: none;
  padding: 5px 10px;
  font-size: 13px;
  cursor: pointer;
}
.page-jump-list button:hover {
  background: #f3f6f2;
}
.page-jump-list button[aria-selected='true'] {
  font-weight: 650;
  color: #245c44;
  background: #eef5ec;
}
.page-jump-keys {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  border: 0;
  padding: 0;
  pointer-events: none;
}
.page-jump-typed {
  margin: 0 2px 6px;
  text-align: center;
  font-weight: 650;
  color: #20372f;
}
</style>

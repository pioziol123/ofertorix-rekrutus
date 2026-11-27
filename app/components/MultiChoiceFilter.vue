<script setup lang="ts" generic="T extends string">
import {
  choiceOnClose,
  choiceSummary,
  type ChoiceOption,
} from '../utils/multi-choice'

/**
 * The shared multi-choice filter (lq3 T4-R02, nq3 T1-R08): a list of
 * values to tick under the filter's name. Ticking changes nothing until
 * the list closes, by its button or a click outside; then a changed choice
 * goes to the page, which applies it. Nothing chosen means all.
 */
// The page's attributes, such as its test id, go to the list, not the label.
defineOptions({ inheritAttrs: false })
const props = defineProps<{
  /** The filter's name shown above its button, e.g. "Źródło". */
  label: string
  options: readonly ChoiceOption<T>[]
  /** The applied choice. */
  chosen: readonly T[]
}>()
const emit = defineEmits<{ change: [choice: T[]] }>()

const list = ref<HTMLDetailsElement>()
const ticked = ref<T[]>([]) as Ref<T[]>
const summary = computed(() =>
  choiceSummary(
    props.chosen,
    (value) =>
      props.options.find((option) => option.value === value)?.label ?? value,
  ),
)
function toggled(event: Event) {
  if ((event.target as HTMLDetailsElement).open) {
    ticked.value = [...props.chosen]
    return
  }
  const choice = choiceOnClose<T>(props.chosen, ticked.value)
  if (choice) emit('change', choice)
}
function close() {
  if (list.value?.open) list.value.open = false
}

// A click outside the list closes it, which applies its choice.
function onMouseDown(event: MouseEvent) {
  if (!(event.target instanceof Node && list.value?.contains(event.target)))
    close()
}
onMounted(() => document.addEventListener('mousedown', onMouseDown))
onUnmounted(() => document.removeEventListener('mousedown', onMouseDown))

/**
 * Whether the list is open and a way to close it, so the page decides what
 * one Escape closes among its overlays (`escapeCloses`).
 */
defineExpose({ isOpen: () => !!list.value?.open, close })
</script>

<template>
  <label
    >{{ label }}
    <details ref="list" class="multi-choice" v-bind="$attrs" @toggle="toggled">
      <summary>{{ summary }}</summary>
      <div class="multi-choice-list">
        <label v-for="option in options" :key="option.value"
          ><input v-model="ticked" type="checkbox" :value="option.value" />
          {{ option.label }}</label
        >
      </div>
    </details>
  </label>
</template>

<style scoped>
.multi-choice {
  position: relative;
}
.multi-choice summary {
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
  list-style: none;
  cursor: pointer;
}
.multi-choice[open] summary {
  border-color: #245c44;
}
.multi-choice-list {
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
.multi-choice-list label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  font-size: 13px;
  color: #20372f;
  cursor: pointer;
}
</style>

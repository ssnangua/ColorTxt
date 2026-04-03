<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import AppModal from "./AppModal.vue";
import {
  SHORTCUT_ACTIONS,
  type ShortcutActionId,
  type ShortcutBindingMap,
} from "../services/shortcutRegistry";
import {
  acceleratorToDisplayKeys,
  acceleratorToDisplayText,
  collectShortcutConflicts,
  keyboardEventToAccelerator,
  normalizeAccelerator,
} from "../services/shortcutUtils";

const modelValue = defineModel<boolean>({ default: false });
const props = defineProps<{
  shortcutBindings: ShortcutBindingMap;
  defaultShortcutBindings: ShortcutBindingMap;
}>();
const emit = defineEmits<{ apply: [payload: ShortcutBindingMap] }>();

const isMac = computed(() =>
  /mac|iphone|ipad|ipod/i.test(navigator.platform || ""),
);
const draft = ref<ShortcutBindingMap>({ ...props.shortcutBindings });
const editingId = ref<ShortcutActionId | null>(null);
const panelErrorText = ref("");
const pendingRecordedAccel = ref("");
const recordError = ref("");
const recordInputRef = ref<HTMLElement | null>(null);

watch(
  () => modelValue.value,
  async (open) => {
    if (!open) return;
    draft.value = { ...props.shortcutBindings };
    panelErrorText.value = "";
    await closeEditModal();
  },
);

function displayKeys(accel: string) {
  return acceleratorToDisplayKeys(accel, isMac.value);
}

async function tryApplyDraft(next: ShortcutBindingMap): Promise<boolean> {
  const conflicts = collectShortcutConflicts(next);
  if (conflicts.length > 0) return false;
  const globalAccel = next.toggleAllWindowsVisibility;
  if (globalAccel) {
    const result = await window.colorTxt.validateGlobalShortcut(globalAccel);
    if (!result.ok) return false;
  }
  draft.value = { ...next };
  emit("apply", { ...next });
  return true;
}

async function resetAllBindings() {
  const ok = await tryApplyDraft({ ...props.defaultShortcutBindings });
  panelErrorText.value = ok ? "" : "默认快捷键设置失败";
}

const editingAction = computed(
  () => SHORTCUT_ACTIONS.find((x) => x.id === editingId.value) ?? null,
);
const pendingRecordedDisplayText = computed(() => {
  return acceleratorToDisplayText(pendingRecordedAccel.value, isMac.value);
});

async function openEditModal(id: ShortcutActionId) {
  if (editingId.value === null) {
    await window.colorTxt.suspendGlobalShortcutsForRecording();
  }
  editingId.value = id;
  pendingRecordedAccel.value = "";
  recordError.value = "";
  void nextTick(() => {
    recordInputRef.value?.focus();
  });
}

async function closeEditModal() {
  const wasOpen = editingId.value !== null;
  editingId.value = null;
  pendingRecordedAccel.value = "";
  recordError.value = "";
  if (wasOpen) {
    await window.colorTxt.resumeGlobalShortcutsAfterRecording();
  }
}

async function onRecordInputKeydown(ev: KeyboardEvent) {
  const action = editingAction.value;
  if (!action) return;
  if (ev.isComposing || ev.key === "Process" || ev.key === "Dead") {
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }

  if (ev.key === "Enter") {
    ev.preventDefault();
    ev.stopPropagation();
    const nextAccel = normalizeAccelerator(pendingRecordedAccel.value);
    if (!nextAccel) {
      void closeEditModal();
      return;
    }
    const next = { ...draft.value, [action.id]: nextAccel };
    const conflicts = collectShortcutConflicts(next);
    if (conflicts.length > 0) {
      recordError.value = "该快捷键已被占用";
      return;
    }
    if (action.scope === "global") {
      const result = await window.colorTxt.validateGlobalShortcut(nextAccel);
      if (!result.ok) {
        recordError.value = "该快捷键已被占用";
        return;
      }
    }
    const ok = await tryApplyDraft(next);
    if (ok) void closeEditModal();
    return;
  }

  if (ev.key === "Escape") {
    if (pendingRecordedAccel.value) {
      ev.preventDefault();
      ev.stopPropagation();
      pendingRecordedAccel.value = "";
      recordError.value = "";
    }
    // 未输入任何快捷键时不处理，保持默认行为
    return;
  }

  ev.preventDefault();
  ev.stopPropagation();
  pendingRecordedAccel.value = accelFromKeyEvent(ev);
  const preview = { ...draft.value, [action.id]: pendingRecordedAccel.value };
  const conflicts = collectShortcutConflicts(preview);
  recordError.value = conflicts.length > 0 ? "该快捷键已被占用" : "";
}

function accelFromModifiersOnly(ev: KeyboardEvent): string {
  const parts = new Set<string>();
  if (ev.ctrlKey) parts.add("Control");
  if (ev.metaKey) parts.add("Command");
  if (ev.altKey) parts.add("Alt");
  if (ev.shiftKey) parts.add("Shift");
  const k = String(ev.key || "").toLowerCase();
  if (k === "control" || k === "ctrl") parts.add("Control");
  if (k === "meta" || k === "command" || k === "cmd") parts.add("Command");
  if (k === "alt" || k === "option") parts.add("Alt");
  if (k === "shift") parts.add("Shift");
  const ordered: string[] = [];
  if (parts.has("Control")) ordered.push("Control");
  if (parts.has("Command")) ordered.push("Command");
  if (parts.has("Alt")) ordered.push("Alt");
  if (parts.has("Shift")) ordered.push("Shift");
  return ordered.join("+");
}

function accelFromKeyEvent(ev: KeyboardEvent): string {
  const mods = accelFromModifiersOnly(ev);
  const normalizedKey = normalizeAccelerator(keyboardEventToAccelerator(ev));
  if (normalizedKey) return normalizedKey;
  return mods;
}

async function close() {
  panelErrorText.value = "";
  await closeEditModal();
  modelValue.value = false;
}
</script>

<template>
  <AppModal v-model="modelValue" title="快捷键" max-width="560px">
    <div class="shortcutTableWrap">
      <table class="shortcutTable">
        <thead>
          <tr>
            <th class="colDesc">功能</th>
            <th class="colKeys">快捷键</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in SHORTCUT_ACTIONS"
            :key="item.id"
            class="shortcutRow shortcutRow--clickable"
            role="button"
            tabindex="0"
            title="点击修改快捷键"
            aria-label="点击修改快捷键"
            @click="openEditModal(item.id)"
            @keydown.enter.prevent="openEditModal(item.id)"
            @keydown.space.prevent="openEditModal(item.id)"
          >
            <td class="shortcutDesc">{{ item.desc }}</td>
            <td class="shortcutKeysCell">
              <kbd
                v-for="key in displayKeys(draft[item.id])"
                :key="`${item.id}-${key}`"
                class="shortcutKey"
                >{{ key }}</kbd
              >
              <span v-if="!draft[item.id]" class="shortcutEmpty">未绑定</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="panelErrorText" class="shortcutError">{{ panelErrorText }}</p>
    </div>
    <template #footer>
      <div class="shortcutActions">
        <button
          class="btn"
          type="button"
          size="large"
          @click="void resetAllBindings()"
        >
          全部还原默认
        </button>
        <button class="btn" type="button" size="large" @click="close">
          关闭
        </button>
      </div>
    </template>
  </AppModal>

  <AppModal
    :model-value="editingId != null"
    max-width="520px"
    :esc-closable="!pendingRecordedAccel"
    @update:model-value="(v) => !v && void closeEditModal()"
  >
    <div v-if="editingAction" class="shortcutEditBody">
      <p class="shortcutHintMain">先按所需的组合快捷键，再按 Enter 键确认</p>
      <!-- 用不可编辑的聚焦区域代替 input，避免中文 IME 在控件内上屏全角标点 -->
      <div
        ref="recordInputRef"
        class="shortcutRecordInput"
        role="textbox"
        tabindex="0"
        aria-readonly="true"
        aria-label="快捷键录制"
        :class="{ 'shortcutRecordInput--error': Boolean(recordError) }"
        @keydown="onRecordInputKeydown"
      >
        <span class="shortcutRecordText">{{ pendingRecordedDisplayText }}</span>
        <span class="shortcutRecordCaret" aria-hidden="true" />
      </div>
      <p v-if="recordError" class="shortcutError">该快捷键已被占用</p>
    </div>
  </AppModal>
</template>

<style scoped>
/* 与弹窗 body 纵向滚动条留出间距，避免表格与滚动条贴边 */
.shortcutTableWrap {
  padding: 0 10px;
}

.shortcutTable {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.shortcutTable th,
.shortcutTable td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.shortcutTable thead th {
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.colDesc {
  text-align: left;
}

.colKeys {
  width: 46%;
  text-align: right;
}

.shortcutKeysCell {
  text-align: right;
  white-space: nowrap;
}

.shortcutKey + .shortcutKey {
  margin-left: 16px;
}

.shortcutKey + .shortcutKey::before {
  content: "+";
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.shortcutDesc {
  color: var(--fg);
  font-size: 13px;
  padding-right: 10px;
}

.shortcutActions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.shortcutRow--clickable {
  transition: background-color 0.15s ease;
}

.shortcutRow--clickable:hover,
.shortcutRow--clickable:focus-visible {
  background: var(--icon-btn-bg-hover);
  outline: none;
}

.shortcutError {
  margin: 0;
  color: var(--danger);
  font-size: 12px;
}

.shortcutEmpty {
  color: var(--muted);
  font-size: 12px;
}

.shortcutEditBody {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shortcutHintMain {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.shortcutRecordInput {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg);
  text-align: center;
  font-size: 14px;
  line-height: 1.4;
  outline: none;
  user-select: none;
  cursor: text;
}

.shortcutRecordText {
  min-height: 1em;
}

.shortcutRecordCaret {
  display: inline-block;
  width: 1px;
  height: 1.1em;
  margin-left: 1px;
  flex-shrink: 0;
  background: currentColor;
  opacity: 0;
}

.shortcutRecordInput:focus .shortcutRecordCaret {
  opacity: 1;
  animation: shortcutCaretBlink 1.05s step-end infinite;
}

@media (prefers-reduced-motion: reduce) {
  .shortcutRecordInput:focus .shortcutRecordCaret {
    animation: none;
    opacity: 1;
  }
}

@keyframes shortcutCaretBlink {
  50% {
    opacity: 0;
  }
}

.shortcutRecordInput:focus {
  border-color: var(--accent);
}

.shortcutRecordInput.shortcutRecordInput--error {
  border-color: var(--danger);
  background: var(--danger-bg);
}
</style>

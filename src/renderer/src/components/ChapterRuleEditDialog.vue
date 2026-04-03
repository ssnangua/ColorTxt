<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { getBuiltinRuleDefaults, previewChapterExamples } from "../chapter";
import AppModal from "./AppModal.vue";

export type ChapterRuleEditPayload = {
  pattern: string;
  examples: string[];
};

const modelValue = defineModel<boolean>({ default: false });

const props = defineProps<{
  title: string;
  pattern: string;
  examplesText: string;
  /** 非空且为内置规则 id 时显示「恢复默认」 */
  builtinRuleId?: string | null;
}>();

const emit = defineEmits<{
  save: [payload: ChapterRuleEditPayload];
}>();

const patternInput = ref(props.pattern);
const examplesInput = ref(props.examplesText);
const patternTemplate = "^\\s*(章节头)\\s*(.{0,40})\\s*$";

function normalizePatternForEdit(raw: string): string {
  return raw.replace(/\r?\n/g, " ").trim();
}

watch(
  () => [props.pattern, props.examplesText, modelValue.value] as const,
  ([pattern, examplesText, opened]) => {
    if (!opened) return;
    patternInput.value = normalizePatternForEdit(pattern);
    examplesInput.value = examplesText;
  },
  { immediate: true },
);

function parseExamples(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

const patternMatchPreview = computed(() =>
  previewChapterExamples(
    patternInput.value,
    parseExamples(examplesInput.value),
  ),
);

function close() {
  modelValue.value = false;
}

function onSave() {
  emit("save", {
    pattern: normalizePatternForEdit(patternInput.value),
    examples: parseExamples(examplesInput.value),
  });
  close();
}

function onPatternKeydown(e: KeyboardEvent) {
  if (e.key !== "Enter" || e.isComposing) return;
  e.preventDefault();
}

function onPatternPaste(e: ClipboardEvent) {
  e.preventDefault();
  const el = e.target as HTMLTextAreaElement;
  const pasted = (e.clipboardData?.getData("text/plain") ?? "").replace(
    /\r?\n/g,
    " ",
  );
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const v = patternInput.value;
  patternInput.value = v.slice(0, start) + pasted + v.slice(end);
  const caret = start + pasted.length;
  void nextTick(() => {
    el.focus();
    el.setSelectionRange(caret, caret);
  });
}

function onResetBuiltinDefault() {
  const id = props.builtinRuleId?.trim();
  if (!id) return;
  const d = getBuiltinRuleDefaults(id);
  if (!d) return;
  patternInput.value = normalizePatternForEdit(d.pattern);
  examplesInput.value = d.examples.join("\n");
}
</script>

<template>
  <AppModal
    v-model="modelValue"
    :title="title"
    max-width="600px"
    :mask-closable="false"
  >
    <p class="editHint">
      建议使用两个捕获组：第 1 组为 <b>章节头</b>（如 <code>第十章</code>），第
      2 组为 <b>章节名</b>。
    </p>

    <div class="fieldLabelRow">
      <label class="fieldLabel fieldLabelRowText" for="singleRulePattern">
        <b>匹配规则</b>（正则）
      </label>
      <button
        class="btn link patternTemplateBtn"
        type="button"
        size="small"
        @click="patternInput = patternTemplate"
      >
        填入模板
      </button>
    </div>
    <textarea
      id="singleRulePattern"
      v-model="patternInput"
      class="patternInput patternRegexInput"
      rows="3"
      wrap="soft"
      spellcheck="false"
      @keydown="onPatternKeydown"
      @paste="onPatternPaste"
    ></textarea>

    <div
      v-if="patternMatchPreview.kind !== 'empty'"
      class="patternMatchPreview"
      aria-live="polite"
    >
      <label class="fieldLabel" for="singleRulePattern">
        示例匹配结果（如果命中，颜色为绿色）
      </label>
      <div
        v-if="patternMatchPreview.kind === 'error'"
        class="patternMatchPreviewError"
      >
        {{ patternMatchPreview.message }}
      </div>
      <div v-else class="patternMatchPreviewBody">
        <span
          v-for="(item, i) in patternMatchPreview.items"
          :key="i"
          class="tag"
          :class="{ success: item.hit }"
          >{{ item.text }}
        </span>
      </div>
    </div>

    <label class="fieldLabel" for="singleRuleExamples">
      <b>示例</b>（每行一条示例）
    </label>
    <textarea
      id="singleRuleExamples"
      v-model="examplesInput"
      class="patternInput examplesInput"
      rows="3"
      spellcheck="false"
    ></textarea>

    <template #footer>
      <div class="editFooter">
        <button
          v-if="builtinRuleId"
          class="btn"
          type="button"
          size="large"
          @click="onResetBuiltinDefault"
        >
          恢复默认
        </button>
        <span class="editFooterSpacer" aria-hidden="true" />
        <button class="btn" type="button" size="large" @click="close">
          取消
        </button>
        <button class="btn primary" type="button" size="large" @click="onSave">
          确定
        </button>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.editHint {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
}

.fieldLabel {
  display: block;
  margin: 10px 0 6px;
  font-size: 12px;
  color: var(--fg);
}

.fieldLabelRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 10px 0 6px;
}

.fieldLabelRowText {
  margin: 0;
  flex: 1;
  min-width: 0;
}

.patternTemplateBtn {
  margin-right: 4px;
}

.patternInput {
  width: 100%;
  resize: none;
  min-height: 64px;
  font-family: Consolas, "Courier New", monospace;
}

.patternRegexInput {
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.45;
}

.patternMatchPreview {
  margin-bottom: 20px;
  font-size: 12px;
}

.patternMatchPreviewBody {
  min-width: 0;
  word-break: break-all;
  color: var(--info);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.patternMatchPreviewError {
  color: var(--danger);
}

.editFooter {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.editFooterSpacer {
  flex: 1;
  min-width: 8px;
}
</style>

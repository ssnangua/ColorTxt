<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  generateChapterRuleId,
  previewChapterExamples,
  type ChapterMatchRule,
} from "../chapter";
import { icons } from "../icons";
import AppModal from "./AppModal.vue";
import IconButton from "./IconButton.vue";
import SwitchToggle from "./SwitchToggle.vue";
import ChapterRuleEditDialog from "./ChapterRuleEditDialog.vue";
import type { ChapterRuleEditPayload } from "./ChapterRuleEditDialog.vue";

const modelValue = defineModel<boolean>({ default: false });

const props = defineProps<{
  rules: ChapterMatchRule[];
  errorText?: string;
}>();

const emit = defineEmits<{
  apply: [payload: { rules: ChapterMatchRule[] }];
}>();

const localRules = ref<ChapterMatchRule[]>([]);

const showEditDialog = ref(false);
const editDialogTitle = ref("编辑规则");
const editingRuleId = ref<string | null>(null);
const editBuiltinRuleId = ref<string | null>(null);
const editPatternDraft = ref("");
const editExamplesDraft = ref("");

watch(
  () => [props.rules, modelValue.value] as const,
  ([rules, opened]) => {
    if (!opened) return;
    localRules.value = rules.map((r) => ({
      ...r,
      examples: [...r.examples],
    }));
  },
  { immediate: true, deep: true },
);

// sync：先于主 AppModal 的注销，先关掉子级编辑弹框，保证栈顶先出栈
watch(
  modelValue,
  (open) => {
    if (!open) showEditDialog.value = false;
  },
  { flush: "sync" },
);

const rowsWithPreview = computed(() =>
  localRules.value.map((rule) => ({
    rule,
    preview: previewChapterExamples(rule.pattern, rule.examples),
  })),
);

/** 编辑框：每行一条示例 */
function examplesToEditText(examples: string[]): string {
  return examples.join("\n");
}

function close() {
  modelValue.value = false;
}

function applyRules() {
  emit("apply", {
    rules: localRules.value.map((r) => ({
      ...r,
      examples: [...r.examples],
    })),
  });
}

function openEdit(rule: ChapterMatchRule) {
  editingRuleId.value = rule.id;
  editBuiltinRuleId.value = rule.builtIn ? rule.id : null;
  editDialogTitle.value = rule.builtIn ? "编辑内置规则" : "编辑匹配规则";
  editPatternDraft.value = rule.pattern;
  editExamplesDraft.value = examplesToEditText(rule.examples);
  showEditDialog.value = true;
}

function openAdd() {
  editingRuleId.value = null;
  editBuiltinRuleId.value = null;
  editDialogTitle.value = "新增匹配规则";
  editPatternDraft.value = "";
  editExamplesDraft.value = "";
  showEditDialog.value = true;
}

function onEditSave(payload: ChapterRuleEditPayload) {
  if (editingRuleId.value === null) {
    localRules.value.push({
      id: generateChapterRuleId(),
      pattern: payload.pattern,
      enabled: true,
      examples: payload.examples,
      builtIn: false,
    });
    return;
  }
  const idx = localRules.value.findIndex((r) => r.id === editingRuleId.value);
  if (idx < 0) return;
  const prev = localRules.value[idx];
  localRules.value[idx] = {
    ...prev,
    pattern: payload.pattern,
    examples: payload.examples,
  };
}

function removeRule(rule: ChapterMatchRule) {
  if (rule.builtIn) return;
  localRules.value = localRules.value.filter((r) => r.id !== rule.id);
}

function setRuleEnabled(rule: ChapterMatchRule, enabled: boolean) {
  const idx = localRules.value.findIndex((r) => r.id === rule.id);
  if (idx < 0) return;
  localRules.value[idx] = { ...localRules.value[idx], enabled };
}

function moveRule(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return;
  const arr = [...localRules.value];
  const [item] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, item);
  localRules.value = arr;
}

function moveUp(index: number) {
  if (index <= 0) return;
  moveRule(index, index - 1);
}

function moveDown(index: number) {
  if (index >= localRules.value.length - 1) return;
  moveRule(index, index + 1);
}
</script>

<template>
  <AppModal v-model="modelValue" title="章节匹配规则" max-width="850px">
    <p class="desc">
      可启用多条规则，按顺序依次匹配；任一条匹配成功即视为章节标题。使用操作列的上移/下移调整优先级。内置规则不可删除，但可编辑。
    </p>

    <div class="tableWrap">
      <table class="ruleTable">
        <thead>
          <tr>
            <th class="colCheck" scope="col" aria-label="启用"></th>
            <th class="colRule" scope="col">规则与示例</th>
            <th class="colActions" scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in rowsWithPreview" :key="item.rule.id">
            <td class="cellCheck">
              <SwitchToggle
                :model-value="item.rule.enabled"
                size="sm"
                :aria-label="`启用规则 ${item.rule.id}`"
                @update:model-value="setRuleEnabled(item.rule, $event)"
              />
            </td>
            <td class="cellRule">
              <div class="rulePattern">{{ item.rule.pattern }}</div>
              <div class="ruleExamples">
                <template v-if="item.preview.kind === 'empty'"
                  >（无示例）</template
                >
                <span
                  v-else-if="item.preview.kind === 'error'"
                  class="ruleExamplesError"
                  >{{ item.preview.message }}</span
                >
                <div v-else class="ruleExamplesPreviewBody">
                  <span
                    v-for="(ex, i) in item.preview.items"
                    :key="i"
                    class="tag"
                    :class="{ success: ex.hit }"
                  >
                    {{ ex.text }}
                  </span>
                </div>
              </div>
            </td>
            <td class="cellActions">
              <div class="cellActionsInner">
                <IconButton
                  large
                  :icon-html="icons.up"
                  aria-label="上移"
                  title="上移"
                  :disabled="index === 0"
                  @click="moveUp(index)"
                />
                <IconButton
                  large
                  :icon-html="icons.down"
                  aria-label="下移"
                  title="下移"
                  :disabled="index === localRules.length - 1"
                  @click="moveDown(index)"
                />
                <IconButton
                  large
                  :icon-html="icons.edit"
                  aria-label="编辑"
                  title="编辑"
                  @click="openEdit(item.rule)"
                />
                <IconButton
                  v-if="!item.rule.builtIn"
                  large
                  :icon-html="icons.remove"
                  aria-label="移除"
                  title="移除"
                  @click="removeRule(item.rule)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="errorText" class="errorText">{{ errorText }}</p>

    <template #footer>
      <div class="chapterRuleFooter">
        <button class="btn" type="button" size="large" @click="openAdd">
          添加匹配规则
        </button>
        <div class="chapterRuleFooterEnd">
          <button class="btn" type="button" size="large" @click="close">
            关闭
          </button>
          <button
            class="btn primary"
            type="button"
            size="large"
            @click="applyRules"
          >
            保存
          </button>
        </div>
      </div>
    </template>
  </AppModal>

  <ChapterRuleEditDialog
    v-model="showEditDialog"
    :title="editDialogTitle"
    :pattern="editPatternDraft"
    :examples-text="editExamplesDraft"
    :builtin-rule-id="editBuiltinRuleId"
    @save="onEditSave"
  />
</template>

<style scoped>
.desc {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}

.tableWrap {
  overflow-x: hidden;
  overflow-y: auto;
  max-height: min(50vh, 420px);
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}

.ruleTable {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.ruleTable th,
.ruleTable td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.ruleTable thead th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  background: color-mix(in srgb, var(--bg) 92%, var(--border));
  position: sticky;
  top: 0;
  z-index: 1;
}

.ruleTable tbody tr:last-child td {
  border-bottom: none;
}

.colCheck {
  width: 44px;
}

.colActions {
  /* 4×32 + 3×gap + 左右 padding 24 */
  width: 172px;
  min-width: 172px;
  box-sizing: border-box;
}

.cellCheck {
  text-align: center;
}

.rulePattern {
  font-size: 12px;
  line-height: 1.45;
  font-family: Consolas, "Courier New", monospace;
  color: var(--fg);
  word-break: break-all;
  white-space: pre-wrap;
}

.ruleExamples {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.45;
}

.ruleExamplesPreviewBody {
  min-width: 0;
  word-break: break-all;
  color: var(--info);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ruleExamplesError {
  color: var(--danger, #f56c6c);
}

.cellRule {
  min-width: 0;
}

.cellActions {
  vertical-align: middle;
  text-align: left;
}

.cellActionsInner {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
}

.errorText {
  margin: 10px 0 0;
  color: #e85d75;
  font-size: 12px;
}

.chapterRuleFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
}

.chapterRuleFooterEnd {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
</style>

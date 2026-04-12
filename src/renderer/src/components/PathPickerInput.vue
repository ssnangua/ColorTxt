<script setup lang="ts">
import { computed, ref } from "vue";
import folderOpenSvgRaw from "../assets/folder-open.svg?raw";

const path = defineModel<string>({ default: "" });

const props = withDefaults(
  defineProps<{
    /** true：目录；false：文件 */
    isDirectory?: boolean;
    placeholder?: string;
    /** 与设置里「仅展示路径」一致时可设为 true */
    inputReadonly?: boolean;
    disabled?: boolean;
    /** 无障碍名称；缺省用 placeholder 或「文件/目录路径」 */
    ariaLabel?: string;
  }>(),
  {
    isDirectory: false,
    inputReadonly: false,
    disabled: false,
  },
);

const inputAria = computed(() => {
  if (props.ariaLabel?.trim()) return props.ariaLabel.trim();
  if (props.placeholder?.trim()) return props.placeholder.trim();
  return props.isDirectory ? "目录路径" : "文件路径";
});

const folderIconHtml = computed(() =>
  folderOpenSvgRaw.replace(/fill="[^"]*"/g, 'fill="currentColor"'),
);

/** 拖入文件/目录时高亮输入框（非 Files 类型不亮） */
const isDragOver = ref(false);

function onDragEnter(ev: DragEvent) {
  if (props.disabled) return;
  if (!ev.dataTransfer?.types?.includes("Files")) return;
  ev.preventDefault();
  isDragOver.value = true;
}

function onDragLeave(ev: DragEvent) {
  const root = ev.currentTarget;
  if (!(root instanceof HTMLElement)) return;
  const related = ev.relatedTarget;
  if (related instanceof Node && root.contains(related)) return;
  isDragOver.value = false;
}

function onDragOver(ev: DragEvent) {
  ev.preventDefault();
  if (props.disabled) return;
  try {
    ev.dataTransfer!.dropEffect = "copy";
  } catch {
    // ignore
  }
}

async function onDrop(ev: DragEvent) {
  ev.preventDefault();
  ev.stopPropagation();
  isDragOver.value = false;
  if (props.disabled) return;
  const api = window.colorTxt;
  if (!api?.getPathForFile || !api.stat) return;
  const files = ev.dataTransfer?.files;
  if (!files?.length) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    let fsPath: string;
    try {
      fsPath = api.getPathForFile(file);
    } catch {
      continue;
    }
    try {
      const st = await api.stat(fsPath);
      if (props.isDirectory) {
        if (st.isDirectory) {
          path.value = fsPath;
          return;
        }
      } else if (st.isFile) {
        path.value = fsPath;
        return;
      }
    } catch {
      continue;
    }
  }
}

async function onBrowse() {
  if (props.disabled) return;
  const api = window.colorTxt;
  if (!api) return;
  const p = props.isDirectory
    ? await api.openDirectoryPlainDialog()
    : await api.openFilePlainDialog();
  if (p) path.value = p;
}
</script>

<template>
  <div
    class="pathPicker"
    :class="{ 'pathPicker--disabled': disabled }"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <input
      v-model="path"
      class="pathPicker__input"
      :class="{ 'pathPicker__input--dragOver': isDragOver }"
      type="text"
      :readonly="inputReadonly"
      :disabled="disabled"
      :placeholder="placeholder"
      :aria-label="inputAria"
    />
    <button
      type="button"
      class="btn primary pathPicker__btn"
      :disabled="disabled"
      :aria-label="isDirectory ? '选择目录' : '选择文件'"
      :title="isDirectory ? '选择目录' : '选择文件'"
      @click="onBrowse"
    >
      <span class="pathPicker__icon" aria-hidden="true" v-html="folderIconHtml" />
    </button>
  </div>
</template>

<style scoped>
.pathPicker {
  display: flex;
  align-items: stretch;
  flex: 1 1 160px;
  min-width: 0;
}

.pathPicker--disabled {
  opacity: 0.65;
  pointer-events: none;
}

.pathPicker__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px 0 0 4px;
  font-size: 12px;
  background: var(--bg);
  color: var(--fg);
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}

.pathPicker__input--dragOver {
  background: var(--primary-bg);
  border-color: var(--accent);
}

.pathPicker__btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  min-width: 36px;
  padding: 0;
  box-sizing: border-box;
  border-radius: 0 4px 4px 0;
}

.pathPicker__icon {
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.pathPicker__icon :deep(svg) {
  width: 20px;
  height: 20px;
  display: block;
}
</style>

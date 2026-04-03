<script setup lang="ts">
import { computed, ref, type ComponentPublicInstance } from "vue";
import AppContextMenu from "./AppContextMenu.vue";
import VirtualList from "./VirtualList.vue";
import { READER_SIDEBAR_ROW_STRIDE } from "../composables/useReaderSidebarLists";

type BookmarkListItem = { line: number; note?: string; content: string };

const props = defineProps<{
  currentFilePath: string | null;
  bookmarks: BookmarkListItem[];
  activeBookmarkLine: number | null;
}>();

const emit = defineEmits<{
  jumpToBookmark: [line: number];
  clearBookmarks: [];
  editBookmark: [line: number];
  removeBookmark: [line: number];
  bindListRef: [value: InstanceType<typeof VirtualList> | null];
}>();

function onBindListRef(value: Element | ComponentPublicInstance | null) {
  if (value && typeof value === "object" && "$el" in value) {
    emit("bindListRef", value as InstanceType<typeof VirtualList>);
    return;
  }
  emit("bindListRef", null);
}

const sortedBookmarks = computed(() =>
  props.bookmarks.slice().sort((a, b) => a.line - b.line),
);
const contextMenuOpen = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuLine = ref<number | null>(null);
const contextMenuItems = [
  { id: "edit", label: "编辑" },
  { id: "remove", label: "移除", type: "danger" as const },
];

function onItemClick(line: number) {
  emit("jumpToBookmark", line);
}

function closeContextMenu() {
  contextMenuOpen.value = false;
  contextMenuLine.value = null;
}

function onItemContextMenu(line: number, ev: MouseEvent) {
  ev.preventDefault();
  contextMenuLine.value = line;
  contextMenuX.value = ev.clientX;
  contextMenuY.value = ev.clientY;
  contextMenuOpen.value = true;
}

function onContextMenuSelect(actionId: string) {
  const line = contextMenuLine.value;
  if (line == null) return;
  if (actionId === "edit") emit("editBookmark", line);
  if (actionId === "remove") emit("removeBookmark", line);
  closeContextMenu();
}
</script>

<template>
  <div class="sidebarListWrap">
    <div class="sidebarTabBody">
      <div v-if="sortedBookmarks.length === 0" class="empty">
        {{ currentFilePath ? "当前文件暂无书签" : "未打开文件" }}
      </div>
      <div v-else class="sidebarListViewportPad">
        <VirtualList
          :ref="onBindListRef"
          class="sidebarList sidebarList--itemGap"
          :item-count="sortedBookmarks.length"
          :row-stride="READER_SIDEBAR_ROW_STRIDE * 1.6"
          :overscan="8"
          :item-key="(i) => sortedBookmarks[i]?.line ?? i"
        >
          <template #default="{ index }">
            <button
              class="bookmarkItem"
              :class="{
                active: sortedBookmarks[index].line === activeBookmarkLine,
              }"
              @click="onItemClick(sortedBookmarks[index].line)"
              @contextmenu="
                onItemContextMenu(sortedBookmarks[index].line, $event)
              "
            >
              <span class="bookmarkMain">
                <span
                  class="bookmarkNote"
                  :class="{
                    bookmarkPlaceholder: !sortedBookmarks[index].note,
                  }"
                  :title="sortedBookmarks[index].note || undefined"
                >
                  {{ sortedBookmarks[index].note || "无备注" }}
                </span>
                <span
                  class="bookmarkContent"
                  :class="{
                    bookmarkPlaceholder:
                      !sortedBookmarks[index].content.trim(),
                  }"
                  :title="
                    sortedBookmarks[index].content.trim() || undefined
                  "
                >
                  {{ sortedBookmarks[index].content.trim() || "（空行）" }}
                </span>
              </span>
              <span class="itemMeta">{{ sortedBookmarks[index].line }} 行</span>
            </button>
          </template>
        </VirtualList>
      </div>
    </div>
    <div v-if="sortedBookmarks.length > 0" class="sidebarTabFooter">
      <span class="sidebarTabFooterStat"
        >共 {{ sortedBookmarks.length }} 条书签</span
      >
      <button
        type="button"
        class="link hoverDanger sidebarTabFooterAction"
        :disabled="sortedBookmarks.length === 0"
        @click="emit('clearBookmarks')"
      >
        清空
      </button>
    </div>
    <AppContextMenu
      :open="contextMenuOpen"
      :x="contextMenuX"
      :y="contextMenuY"
      :items="contextMenuItems"
      :min-width="140"
      @close="closeContextMenu"
      @select="onContextMenuSelect"
    />
  </div>
</template>

<style scoped>
.sidebarListWrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sidebarTabBody {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sidebarListViewportPad {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* 右侧由 .sidebar .virtualList-scroll.sidebarList 的 padding 控制列表与右缘间距 */
  padding: 6px 0 6px 6px;
  background: var(--bg);
}
.sidebarList {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
.sidebarList--itemGap :deep(.virtualList-row) {
  padding-bottom: 2px;
}
.bookmarkItem {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--list-item-fg);
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  gap: 8px;
  align-items: center;
}
.bookmarkMain {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.bookmarkNote {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bookmarkContent {
  font-size: 12px;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bookmarkNote.bookmarkPlaceholder,
.bookmarkContent.bookmarkPlaceholder {
  font-style: italic;
}
.bookmarkNote.bookmarkPlaceholder {
  opacity: 0.5;
}
.bookmarkContent.bookmarkPlaceholder {
  opacity: 0.42;
}
.itemMeta {
  font-size: 12px;
  opacity: 0.65;
  white-space: nowrap;
}
.bookmarkItem:hover {
  color: var(--list-item-fg);
  background: var(--list-item-bg-hover);
}
.bookmarkItem.active {
  color: var(--list-item-fg-active);
  background: var(--list-item-bg-active);
}
.empty {
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 10px 16px;
  font-size: 12px;
  color: var(--secondary);
}
.sidebarTabFooter {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--muted);
  border-top: 1px solid var(--border);
  background: var(--bg);
  user-select: none;
}
.sidebarTabFooterStat {
  flex: 1;
  min-width: 0;
  text-align: left;
}
.sidebarTabFooterAction {
  flex-shrink: 0;
}
</style>

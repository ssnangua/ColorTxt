<script setup lang="ts">
withDefaults(
  defineProps<{
    loading: boolean;
    /** 流式读取进度 0–100；未知总大小时为 null */
    loadingProgressPercent: number | null;
    currentFile: string | null;
    /** 底栏左侧路径展示文案（与正文打开路径一致） */
    pathCaption: string;
    readingProgressPercentPart: string;
    readingProgressDetailPart: string;
    readingProgressPlaceholder: boolean;
    readingProgressComplete: boolean;
    totalCharCountText: string;
    fileSizeText: string;
    fileEncoding: string;
  }>(),
  {
    loadingProgressPercent: null,
  },
);

defineEmits<{
  revealFileInFolder: [];
}>();
</script>

<template>
  <footer class="footer">
    <div class="footer-left">
      <div v-if="currentFile" class="footerPathWrap">
        <button
          type="button"
          class="link footerPath"
          :title="`在文件管理器中显示：${currentFile}`"
          @click="$emit('revealFileInFolder')"
        >
          {{ pathCaption }}
        </button>
      </div>
    </div>
    <div v-if="currentFile" class="footer-right">
      <span v-if="loading" class="footer-loading">
        <template v-if="loadingProgressPercent != null">
          加载中：<span class="footer-loading-pct"
            >{{ loadingProgressPercent }}%</span
          >
        </template>
        <template v-else>加载中...</template>
      </span>
      <span v-else>
        阅读进度：<span
          class="footer-reading-progress-pct"
          :class="{
            'footer-reading-progress-pct--placeholder':
              readingProgressPlaceholder,
            'footer-reading-progress-pct--complete': readingProgressComplete,
          }"
          >{{ readingProgressPercentPart }}</span
        >{{ readingProgressDetailPart }}
      </span>
      <span v-if="!loading">总字数：{{ totalCharCountText }}</span>
      <span>文件大小：{{ fileSizeText }}</span>
      <span>编码：{{ fileEncoding }}</span>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  height: 28px;
  flex-shrink: 0;
  min-width: 0;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  gap: 16px;
}

.footer-left {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.footer-loading {
  flex-shrink: 0;
}

.footer-loading-pct {
  color: var(--warning);
}

.footerPathWrap {
  flex: 1 1 0%;
  min-width: 0;
  overflow: hidden;
  display: flex;
  justify-content: flex-start;
  align-items: center;
}

.footerPath {
  display: block;
  min-width: 0;
  box-sizing: border-box;
  font-size: 12px;
  color: var(--fg);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.footer-right {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  display: inline-flex;
  min-width: 0;
  flex-shrink: 0;
  gap: 20px;
}

.footer-reading-progress-pct {
  color: var(--warning);
}

.footer-reading-progress-pct--placeholder {
  color: var(--muted);
}

.footer-reading-progress-pct--complete {
  color: var(--success);
}
</style>

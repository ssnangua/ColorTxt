<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AppModal from "./AppModal.vue";
import { GITHUB_RELEASES_LATEST_URL } from "../constants/appUi";
import { formatFileSize } from "../utils/format";

const showUpdateReadyModal = ref(false);
const updateReadyVersion = ref("");
const showUpdateAvailableModal = ref(false);
const updateAvailableVersion = ref("");
const awaitingUpdateDownload = ref(false);
const showUpdateDownloadingModal = ref(false);
const updateDownloadPercent = ref(0);
const updateDownloadTransferred = ref(0);
const updateDownloadTotal = ref(0);
const showUpdateInfoModal = ref(false);
const updateInfoTitle = ref("检查更新");
const updateInfoMessage = ref("");
const pendingManualUpdateCheck = ref(false);
/** 手动检查更新时立即展示，避免等待 IPC 期间无反馈 */
const showUpdateCheckingModal = ref(false);

const isMac = computed(() =>
  /mac|iphone|ipad|ipod/i.test(navigator.platform || ""),
);

function closeUpdateReadyModal() {
  showUpdateReadyModal.value = false;
}

function closeUpdateInfoModal() {
  showUpdateInfoModal.value = false;
}

function closeUpdateAvailableModal() {
  showUpdateAvailableModal.value = false;
}

function openMacReleaseDownload() {
  void window.colorTxt.openExternal(GITHUB_RELEASES_LATEST_URL);
}

async function startDownloadUpdate() {
  if (isMac.value) {
    openMacReleaseDownload();
    return;
  }
  showUpdateAvailableModal.value = false;
  awaitingUpdateDownload.value = true;
  updateDownloadPercent.value = 0;
  updateDownloadTransferred.value = 0;
  updateDownloadTotal.value = 0;
  showUpdateDownloadingModal.value = true;
  const r = await window.colorTxt.downloadUpdate();
  if ("skipped" in r && r.skipped) {
    awaitingUpdateDownload.value = false;
    showUpdateDownloadingModal.value = false;
    return;
  }
  if ("ok" in r && r.ok === false) {
    awaitingUpdateDownload.value = false;
    showUpdateDownloadingModal.value = false;
    updateInfoTitle.value = "下载失败";
    updateInfoMessage.value = r.message ?? "未知错误";
    showUpdateInfoModal.value = true;
    return;
  }
  if ("ok" in r && r.ok === true) {
    awaitingUpdateDownload.value = false;
    showUpdateDownloadingModal.value = false;
  }
}

function confirmQuitAndInstall() {
  void window.colorTxt.quitAndInstall().then((ok) => {
    if (ok) return;
    updateInfoTitle.value = "安装失败";
    updateInfoMessage.value = "未能触发自动安装，请重新下载并手动覆盖安装。";
    showUpdateInfoModal.value = true;
  });
}

async function checkForUpdates() {
  showUpdateCheckingModal.value = true;
  const isPackaged = await window.colorTxt.isPackaged();
  if (!isPackaged) {
    showUpdateCheckingModal.value = false;
    updateInfoTitle.value = "检查更新";
    updateInfoMessage.value =
      "开发模式下无法使用自动更新，请安装正式发布的安装包。";
    showUpdateInfoModal.value = true;
    return;
  }
  pendingManualUpdateCheck.value = true;
  const r = await window.colorTxt.checkForUpdates();
  if ("skipped" in r && r.skipped) {
    pendingManualUpdateCheck.value = false;
    showUpdateCheckingModal.value = false;
    return;
  }
  if ("ok" in r && r.ok === false) {
    pendingManualUpdateCheck.value = false;
    showUpdateCheckingModal.value = false;
    updateInfoTitle.value = "检查更新失败";
    updateInfoMessage.value = r.message ?? "未知错误";
    showUpdateInfoModal.value = true;
  }
}

const unsubscribers: Array<() => void> = [];

onMounted(() => {
  unsubscribers.push(
    window.colorTxt.onUpdaterUpdateAvailable((payload) => {
      if (!pendingManualUpdateCheck.value) return;
      pendingManualUpdateCheck.value = false;
      showUpdateCheckingModal.value = false;
      updateAvailableVersion.value = payload.version;
      showUpdateAvailableModal.value = true;
    }),
  );
  unsubscribers.push(
    window.colorTxt.onUpdaterUpdateNotAvailable(() => {
      if (!pendingManualUpdateCheck.value) return;
      pendingManualUpdateCheck.value = false;
      showUpdateCheckingModal.value = false;
      updateInfoTitle.value = "检查更新";
      updateInfoMessage.value = "当前已是最新版本。";
      showUpdateInfoModal.value = true;
    }),
  );
  unsubscribers.push(
    window.colorTxt.onUpdaterDownloadProgress((payload) => {
      // macOS 当前采用手动安装更新，不会进入下载流程
      if (isMac.value) return;
      if (!awaitingUpdateDownload.value) return;
      updateDownloadPercent.value = Math.min(
        100,
        Math.max(0, Math.round(payload.percent)),
      );
      updateDownloadTransferred.value = payload.transferred;
      updateDownloadTotal.value = payload.total;
    }),
  );
  unsubscribers.push(
    window.colorTxt.onUpdaterError((payload) => {
      if (pendingManualUpdateCheck.value) {
        pendingManualUpdateCheck.value = false;
        showUpdateCheckingModal.value = false;
        updateInfoTitle.value = "检查更新失败";
        updateInfoMessage.value = payload.message;
        showUpdateInfoModal.value = true;
        return;
      }
      if (awaitingUpdateDownload.value) {
        awaitingUpdateDownload.value = false;
        showUpdateDownloadingModal.value = false;
        updateInfoTitle.value = "下载失败";
        updateInfoMessage.value = payload.message;
        showUpdateInfoModal.value = true;
      }
    }),
  );
  unsubscribers.push(
    window.colorTxt.onUpdaterUpdateDownloaded((payload) => {
      // macOS 当前采用手动安装更新，不展示“下载完成/退出安装”弹窗
      if (isMac.value) return;
      pendingManualUpdateCheck.value = false;
      awaitingUpdateDownload.value = false;
      showUpdateDownloadingModal.value = false;
      updateReadyVersion.value = payload.version;
      showUpdateReadyModal.value = true;
    }),
  );
});

onBeforeUnmount(() => {
  for (const u of unsubscribers) u();
});

defineExpose({ checkForUpdates });
</script>

<template>
  <AppModal
    v-model="showUpdateCheckingModal"
    title="检查更新"
    max-width="400px"
    :mask-closable="false"
    :esc-closable="false"
  >
    <p class="updateModalText">正在检查更新…</p>
  </AppModal>

  <AppModal
    v-model="showUpdateAvailableModal"
    title="发现新版本"
    max-width="400px"
  >
    <p class="updateModalText">
      检测到新版本 {{ updateAvailableVersion }}，
      <template v-if="isMac">可前往下载安装。</template>
      <template v-else>是否下载更新？</template>
    </p>
    <template #footer>
      <div class="updateModalActions">
        <button
          class="btn"
          type="button"
          size="large"
          @click="closeUpdateAvailableModal"
        >
          稍后
        </button>
        <button
          class="btn primary"
          type="button"
          size="large"
          @click="startDownloadUpdate"
        >
          <template v-if="isMac">打开下载页</template>
          <template v-else>下载</template>
        </button>
      </div>
    </template>
  </AppModal>

  <AppModal
    v-if="!isMac"
    v-model="showUpdateDownloadingModal"
    title="正在下载更新"
    max-width="400px"
    :mask-closable="false"
    :esc-closable="false"
  >
    <div class="updateDownloadProgressWrap">
      <progress
        class="updateDownloadProgressBar"
        :value="updateDownloadPercent"
        max="100"
      />
      <p class="updateModalText updateDownloadProgressMeta">
        <template v-if="updateDownloadTotal > 0">
          <span class="updateDownloadPercentText"
            >{{ updateDownloadPercent }}%</span
          >
          {{ formatFileSize(updateDownloadTransferred) }} /
          {{ formatFileSize(updateDownloadTotal) }}
        </template>
        <template v-else>
          <span class="updateDownloadPercentText"
            >{{ updateDownloadPercent }}%</span
          >
          <template v-if="updateDownloadTransferred > 0">
            已下载 {{ formatFileSize(updateDownloadTransferred) }}
          </template>
        </template>
      </p>
      <p class="updateDownloadHint">下载完成后将提示安装。</p>
    </div>
  </AppModal>

  <AppModal
    v-if="!isMac"
    v-model="showUpdateReadyModal"
    title="更新已就绪"
    max-width="400px"
  >
    <p class="updateModalText">
      新版本 {{ updateReadyVersion }} 已下载完成，是否退出并安装？
    </p>
    <template #footer>
      <div class="updateModalActions">
        <button
          class="btn"
          type="button"
          size="large"
          @click="closeUpdateReadyModal"
        >
          稍后
        </button>
        <button
          class="btn primary"
          type="button"
          size="large"
          @click="confirmQuitAndInstall"
        >
          退出并安装
        </button>
      </div>
    </template>
  </AppModal>

  <AppModal
    v-model="showUpdateInfoModal"
    :title="updateInfoTitle"
    max-width="400px"
  >
    <p class="updateModalText">{{ updateInfoMessage }}</p>
    <template #footer>
      <div class="updateModalActions">
        <button
          class="btn primary"
          type="button"
          size="large"
          @click="closeUpdateInfoModal"
        >
          确定
        </button>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.updateModalText {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--fg);
}

.updateModalActions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.updateDownloadProgressWrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.updateDownloadProgressBar {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--panel-elevated, var(--panel));
}

.updateDownloadProgressBar::-webkit-progress-bar {
  background: transparent;
}

.updateDownloadProgressBar::-webkit-progress-value {
  background: var(--accent);
  border-radius: 3px;
}

.updateDownloadProgressBar::-moz-progress-bar {
  background: var(--accent);
}

.updateDownloadProgressMeta {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.updateDownloadPercentText {
  color: var(--accent);
  margin-right: 0.35em;
}

.updateDownloadHint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--fg-muted, var(--fg));
  opacity: 0.85;
}
</style>

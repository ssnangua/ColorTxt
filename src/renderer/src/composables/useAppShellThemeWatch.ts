import { nextTick, watch, type Ref } from "vue";
import type ReaderMain from "../components/ReaderMain.vue";
import { APP_DISPLAY_NAME } from "../constants/appUi";

function syncAppTheme(theme: string) {
  const root = document.documentElement;
  const isDark = theme !== "vs";
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
}

export function useAppShellThemeWatch(deps: {
  currentTheme: Ref<string>;
  readerRef: Ref<InstanceType<typeof ReaderMain> | null>;
  skipNextThemeNativeIpc: Ref<boolean>;
  persistSettings: () => void;
  showChapterCounts: Ref<boolean>;
  currentFile: Ref<string | null>;
  isFullscreenView: Ref<boolean>;
  showFullscreenSidebar: Ref<boolean>;
  pulseChapterListCenter: (smooth: boolean) => void;
}) {
  watch(
    () => deps.currentTheme.value,
    (theme) => {
      syncAppTheme(theme);
      deps.readerRef.value?.setTheme(theme);
      if (deps.skipNextThemeNativeIpc.value) {
        deps.skipNextThemeNativeIpc.value = false;
      } else {
        window.colorTxt.setNativeTheme(theme);
      }
      deps.persistSettings();
    },
    { immediate: true },
  );

  watch(deps.showChapterCounts, () => {
    deps.persistSettings();
  });

  watch(
    () => deps.currentFile.value,
    (fp) => {
      if (!fp) {
        window.colorTxt.setWindowTitle(APP_DISPLAY_NAME);
        return;
      }
      const fileName = fp.split(/[\\/]/).pop() || fp;
      window.colorTxt.setWindowTitle(`${fileName} - ${APP_DISPLAY_NAME}`);
    },
    { immediate: true },
  );

  watch(
    () => deps.isFullscreenView.value && deps.showFullscreenSidebar.value,
    (visible) => {
      if (!visible) return;
      void nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            deps.pulseChapterListCenter(false);
          });
        });
      });
    },
  );
}

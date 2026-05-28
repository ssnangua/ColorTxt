import { appAlert } from "../services/appDialog";
import { icons } from "../icons";
import {
  computed,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";

export type ConnectionTestPhase = "idle" | "pending" | "ok" | "fail";

export type ConnectionTestResult =
  | { ok: true }
  | { ok: false; error?: string };

/**
 * 连接测试按钮状态：成功不弹框，失败可弹框；配置指纹变化时回到 idle。
 * @param fingerprint 用于检测「测试成功后用户是否改了地址/密钥等」
 */
export function useConnectionTest(fingerprint: MaybeRefOrGetter<string>) {
  const phase = ref<ConnectionTestPhase>("idle");
  const lastResolvedFingerprint = ref<string | null>(null);

  watch(
    () => toValue(fingerprint),
    (fp) => {
      if (phase.value === "pending") return;
      if (lastResolvedFingerprint.value === null) return;
      if (fp !== lastResolvedFingerprint.value) {
        phase.value = "idle";
        lastResolvedFingerprint.value = null;
      }
    },
  );

  const iconHtml = computed(() => {
    switch (phase.value) {
      case "pending":
        return icons.refresh;
      case "ok":
        return icons.success;
      case "fail":
        return icons.fail;
      default:
        return icons.unknow;
    }
  });

  async function runTest(
    testFn: () => Promise<ConnectionTestResult | null>,
    opts?: { alertOnError?: boolean },
  ): Promise<void> {
    if (phase.value === "pending") return;
    const alertOnError = opts?.alertOnError !== false;
    const fpWhenStarted = toValue(fingerprint);
    phase.value = "pending";
    try {
      const r = await testFn();
      if (toValue(fingerprint) !== fpWhenStarted) {
        phase.value = "idle";
        lastResolvedFingerprint.value = null;
        return;
      }
      if (r === null) {
        phase.value = "idle";
        lastResolvedFingerprint.value = null;
        return;
      }
      if (r.ok) {
        phase.value = "ok";
        lastResolvedFingerprint.value = fpWhenStarted;
        return;
      }
      if (alertOnError) {
        await appAlert(r.error?.trim() || "连接失败");
      }
      phase.value = "fail";
      lastResolvedFingerprint.value = fpWhenStarted;
    } catch (e) {
      if (toValue(fingerprint) !== fpWhenStarted) {
        phase.value = "idle";
        lastResolvedFingerprint.value = null;
        return;
      }
      if (alertOnError) {
        await appAlert(e instanceof Error ? e.message : String(e));
      }
      phase.value = "fail";
      lastResolvedFingerprint.value = fpWhenStarted;
    }
  }

  function reset() {
    phase.value = "idle";
    lastResolvedFingerprint.value = null;
  }

  return { phase, iconHtml, runTest, reset };
}

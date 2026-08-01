<script setup lang="ts">
import RangeSlider from "./RangeSlider.vue";
import SwitchToggle from "./SwitchToggle.vue";
import NumericInput from "./NumericInput.vue";
import RadioGroup from "./RadioGroup.vue";
import {
  lineHeightMultipleStep,
  maxFontSize,
  maxFullscreenReaderWidthPercent,
  maxLineHeightMultipleForFontSize,
  minFontSize,
  minFullscreenReaderWidthPercent,
  minLineHeightMultiple,
  minMouseWheelScrollSensitivity,
  maxMouseWheelScrollSensitivity,
  minFastScrollSensitivity,
  maxFastScrollSensitivity,
} from "../constants/appUi";
import {
  TIMED_SCROLL_RANGE_OPTIONS,
  maxTimedScrollIntervalMs,
  minTimedScrollIntervalMs,
  type TimedScrollRange,
} from "../constants/timedScroll";
import {
  maxPomodoroMinutes,
  minPomodoroMinutes,
  pomodoroLongBreakEvery,
} from "../constants/pomodoro";
import { computed } from "vue";

const props = defineProps<{
  draftFontSize: number;
  draftLineHeightMultiple: number;
  draftMonacoSmoothScrolling: boolean;
  draftMouseWheelScrollSensitivity: number;
  draftFastScrollSensitivity: number;
  draftStickyChapterTitleEnabled: boolean;
  draftChapterNavToolbarEnabled: boolean;
  draftCompressBlankKeepOneBlank: boolean;
  draftTxtrDelimitedMatchCrossLine: boolean;
  draftFullscreenReaderWidthPercent: number;
  draftFullscreenShowSystemTime: boolean;
  draftPomodoroEnabled: boolean;
  draftPomodoroFocusMinutes: number;
  draftPomodoroShortBreakMinutes: number;
  draftPomodoroLongBreakMinutes: number;
  draftTimedScrollRange: TimedScrollRange;
  draftTimedScrollIntervalMs: number;
  monacoCustomHighlight: boolean;
}>();

defineEmits<{
  "update:draftFontSize": [v: number];
  "update:draftLineHeightMultiple": [v: number];
  "update:draftMonacoSmoothScrolling": [v: boolean];
  "update:draftMouseWheelScrollSensitivity": [v: number];
  "update:draftFastScrollSensitivity": [v: number];
  "update:draftStickyChapterTitleEnabled": [v: boolean];
  "update:draftChapterNavToolbarEnabled": [v: boolean];
  "update:draftCompressBlankKeepOneBlank": [v: boolean];
  "update:draftTxtrDelimitedMatchCrossLine": [v: boolean];
  "update:draftFullscreenReaderWidthPercent": [v: number];
  "update:draftFullscreenShowSystemTime": [v: boolean];
  "update:draftPomodoroEnabled": [v: boolean];
  "update:draftPomodoroFocusMinutes": [v: number];
  "update:draftPomodoroShortBreakMinutes": [v: number];
  "update:draftPomodoroLongBreakMinutes": [v: number];
  "update:draftTimedScrollRange": [v: TimedScrollRange];
  "update:draftTimedScrollIntervalMs": [v: number];
}>();

const draftMaxLineHeightMultiple = computed(() =>
  maxLineHeightMultipleForFontSize(props.draftFontSize),
);
</script>

<template>
  <div class="settingsReadingRoot">
    <div class="settingsBody">
      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel short">字号（{{ draftFontSize }} px）</span>
          <RangeSlider
            :model-value="draftFontSize"
            :min="minFontSize"
            :max="maxFontSize"
            :step="1"
            :show-percent="false"
            aria-label="阅读字号"
            @update:model-value="$emit('update:draftFontSize', $event)"
          />
        </div>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel short"
            >行高（{{ draftLineHeightMultiple.toFixed(1) }}）</span
          >
          <RangeSlider
            :model-value="draftLineHeightMultiple"
            :min="minLineHeightMultiple"
            :max="draftMaxLineHeightMultiple"
            :step="lineHeightMultipleStep"
            :show-percent="false"
            aria-label="行高倍数"
            @update:model-value="$emit('update:draftLineHeightMultiple', $event)"
          />
        </div>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">压缩空行时保留一个空行</span>
          <SwitchToggle
            :model-value="draftCompressBlankKeepOneBlank"
            aria-label="压缩空行时保留一个空行"
            @update:model-value="
              $emit('update:draftCompressBlankKeepOneBlank', $event)
            "
          />
        </div>
        <p class="settingsHint">
          仅在开启「压缩空行」时生效，在每行下方保留一个空行。
        </p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">引号/括号匹配支持跨行</span>
          <SwitchToggle
            :model-value="draftTxtrDelimitedMatchCrossLine"
            :disabled="!monacoCustomHighlight"
            aria-label="引号/括号匹配支持跨行"
            @update:model-value="
              $emit('update:draftTxtrDelimitedMatchCrossLine', $event)
            "
          />
        </div>
        <p class="settingsHint">
          仅在开启「内容上色」时生效，开启后引号和括号会跨行匹配；未闭合的符号最多影响起始行后的 32 行，随后自动恢复正文色。
        </p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">启用粘性章节标题</span>
          <SwitchToggle
            :model-value="draftStickyChapterTitleEnabled"
            aria-label="启用粘性章节标题"
            @update:model-value="
              $emit('update:draftStickyChapterTitleEnabled', $event)
            "
          />
        </div>
        <p class="settingsHint">
          滚动时将章节标题粘在顶部；多层级标题会堆叠。
        </p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">启用章节导航工具栏</span>
          <SwitchToggle
            :model-value="draftChapterNavToolbarEnabled"
            aria-label="启用章节导航工具栏"
            @update:model-value="
              $emit('update:draftChapterNavToolbarEnabled', $event)
            "
          />
        </div>
        <p class="settingsHint">
          在阅读区底部显示「上一章 / 下一章」快捷跳转；仅一章或无章节时不显示。
        </p>
      </div>
    </div>

    <div class="settingsBody settingsBody--scroll">
      <h3 class="settingsSectionTitle settingsSectionTitle--scroll">滚动</h3>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">平滑滚动</span>
          <SwitchToggle
            :model-value="draftMonacoSmoothScrolling"
            aria-label="阅读区平滑滚动"
            @update:model-value="
              $emit('update:draftMonacoSmoothScrolling', $event)
            "
          />
        </div>
        <p class="settingsHint">关闭后，阅读区滚动不再使用平滑动画。</p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain settingsRowMain--baseline">
          <span class="settingsLabel">滚动倍率</span>
          <NumericInput
            :model-value="draftMouseWheelScrollSensitivity"
            :min="minMouseWheelScrollSensitivity"
            :max="maxMouseWheelScrollSensitivity"
            aria-label="滚动倍率"
            @update:model-value="
              $emit('update:draftMouseWheelScrollSensitivity', $event)
            "
          />
        </div>
        <p class="settingsHint">滚轮每次滚动的距离倍率（默认 1）。</p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain settingsRowMain--baseline">
          <span class="settingsLabel">滚动加速倍率</span>
          <NumericInput
            :model-value="draftFastScrollSensitivity"
            :min="minFastScrollSensitivity"
            :max="maxFastScrollSensitivity"
            aria-label="滚动加速倍率"
            @update:model-value="
              $emit('update:draftFastScrollSensitivity', $event)
            "
          />
        </div>
        <p class="settingsHint">按住 <code>Alt</code> 时的加速倍率（默认 5）。</p>
      </div>
    </div>

    <div class="settingsBody settingsBody--fullscreen">
      <h3 class="settingsSectionTitle settingsSectionTitle--fullscreen">全屏阅读</h3>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel short"
            >全屏阅读区域宽度（{{ draftFullscreenReaderWidthPercent }}%）</span
          >
          <RangeSlider
            :model-value="draftFullscreenReaderWidthPercent"
            :min="minFullscreenReaderWidthPercent"
            :max="maxFullscreenReaderWidthPercent"
            :step="1"
            :show-percent="false"
            aria-label="全屏阅读区域宽度百分比"
            @update:model-value="
              $emit('update:draftFullscreenReaderWidthPercent', $event)
            "
          />
        </div>
        <p class="settingsHint">仅在全屏模式生效，用于控制阅读区域宽度。</p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">全屏时在左下角显示系统时间</span>
          <SwitchToggle
            :model-value="draftFullscreenShowSystemTime"
            aria-label="全屏时在左下角显示系统时间"
            @update:model-value="
              $emit('update:draftFullscreenShowSystemTime', $event)
            "
          />
        </div>
        <p class="settingsHint">
          进入全屏后在屏幕左下角显示当前系统时间（时:分）。
        </p>
      </div>
    </div>

    <div class="settingsBody settingsBody--pomodoro">
      <h3 class="settingsSectionTitle settingsSectionTitle--pomodoro">番茄时钟</h3>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">启用番茄时钟</span>
          <SwitchToggle
            :model-value="draftPomodoroEnabled"
            aria-label="启用番茄时钟"
            @update:model-value="$emit('update:draftPomodoroEnabled', $event)"
          />
        </div>
        <p class="settingsHint">在底栏左侧显示番茄时钟</p>
      </div>

      <template v-if="draftPomodoroEnabled">
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel">阅读时长（分钟）</span>
            <NumericInput
              :model-value="draftPomodoroFocusMinutes"
              :min="minPomodoroMinutes"
              :max="maxPomodoroMinutes"
              integer
              aria-label="番茄时钟阅读时长分钟"
              @update:model-value="
                $emit('update:draftPomodoroFocusMinutes', $event)
              "
            />
          </div>
        </div>

        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel">短休息（分钟）</span>
            <NumericInput
              :model-value="draftPomodoroShortBreakMinutes"
              :min="minPomodoroMinutes"
              :max="maxPomodoroMinutes"
              integer
              aria-label="番茄时钟短休息分钟"
              @update:model-value="
                $emit('update:draftPomodoroShortBreakMinutes', $event)
              "
            />
          </div>
        </div>

        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel">长休息（分钟）</span>
            <NumericInput
              :model-value="draftPomodoroLongBreakMinutes"
              :min="minPomodoroMinutes"
              :max="maxPomodoroMinutes"
              integer
              aria-label="番茄时钟长休息分钟"
              @update:model-value="
                $emit('update:draftPomodoroLongBreakMinutes', $event)
              "
            />
          </div>
          <p class="settingsHint">
            每完成 {{ pomodoroLongBreakEvery }} 轮「阅读时长」会进入一次长休息
          </p>
        </div>
      </template>
    </div>

    <div class="settingsBody settingsBody--timedScroll">
      <h3 class="settingsSectionTitle settingsSectionTitle--timedScroll">定时滚动</h3>

      <div class="settingsRow">
        <div class="settingsRowMain settingsRowMain--baseline">
          <span class="settingsLabel">范围</span>
          <RadioGroup
            :model-value="draftTimedScrollRange"
            :options="TIMED_SCROLL_RANGE_OPTIONS"
            aria-label="定时滚动范围"
            @update:model-value="
              $emit('update:draftTimedScrollRange', $event as TimedScrollRange)
            "
          />
        </div>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain settingsRowMain--baseline">
          <span class="settingsLabel">间隔（毫秒）</span>
          <NumericInput
            :model-value="draftTimedScrollIntervalMs"
            :min="minTimedScrollIntervalMs"
            :max="maxTimedScrollIntervalMs"
            integer
            aria-label="定时滚动间隔毫秒"
            @update:model-value="$emit('update:draftTimedScrollIntervalMs', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settingsReadingRoot {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settingsBody {
  padding: 8px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
  background-color: var(--bg);
  border-radius: 8px;
}

.settingsSectionTitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}

.settingsRow {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settingsRowMain {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}

.settingsRowMain--baseline {
  align-items: baseline;
}

.settingsLabel {
  font-size: 14px;
  color: var(--fg);
  flex: 1 1 60%;
  min-width: 60%;
}
.settingsLabel.short {
  flex: 1 1 30%;
  min-width: 30%;
}

.settingsHint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}

.settingsBody--scroll,
.settingsBody--fullscreen,
.settingsBody--pomodoro,
.settingsBody--timedScroll {
  gap: 10px;
}

.settingsSectionTitle--scroll,
.settingsSectionTitle--fullscreen,
.settingsSectionTitle--pomodoro,
.settingsSectionTitle--timedScroll {
  margin-bottom: 10px;
}
</style>

<script setup lang="ts">
import pkg from "../../../../package.json";
import AppModal from "./AppModal.vue";
import { APP_DISPLAY_NAME } from "../constants/appUi";

const modelValue = defineModel<boolean>({ default: false });

const appName = APP_DISPLAY_NAME;
const appVersion = pkg.version;
const appDescription = pkg.description;

function close() {
  modelValue.value = false;
}
</script>

<template>
  <AppModal
    v-model="modelValue"
    :title="appName"
    max-width="360px"
  >
    <p class="aboutVersion">版本 {{ appVersion }}</p>
    <p class="aboutDesc">{{ appDescription }}</p>
    <template #footer>
      <div class="aboutActions">
        <button class="btn" type="button" size="large" @click="close">关闭</button>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.aboutVersion {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--muted);
}

.aboutDesc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--fg);
}

.aboutActions {
  display: flex;
  justify-content: flex-end;
}
</style>

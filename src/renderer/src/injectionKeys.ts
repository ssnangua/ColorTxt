import type { InjectionKey, Ref } from "vue";

export const bookmarkNoteInputRefKey: InjectionKey<
  Ref<HTMLTextAreaElement | null>
> = Symbol("bookmarkNoteInputRef");

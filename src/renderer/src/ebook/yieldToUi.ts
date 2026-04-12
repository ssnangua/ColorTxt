/**
 * 让出主线程到下一个宏任务，使 Vue 有机会提交 DOM 更新（如底栏「转换中…」）。
 */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const BASE_Z_INDEX = 6000
const Z_INDEX_STEP = 10

type StackEntry = {
  instanceId: number
  close: () => void
  getEscClosable: () => boolean
}

const stack: StackEntry[] = []
let nextInstanceId = 0
let escListenerAttached = false

/** 供全屏 ESC 等逻辑判断：有模态时由本模块 document 监听单独 resolve，避免与外层重复关闭多层 */
export function hasModalOnStack(): boolean {
  return stack.length > 0
}

export type ModalStackEscResult = "closed" | "swallow" | "none"

/** 栈顶无模态为 none；禁止 ESC 关闭为 swallow（应吞掉事件）；否则关闭并 closed */
export function resolveEscapeOnModalStack(): ModalStackEscResult {
  const top = stack[stack.length - 1]
  if (!top) return "none"
  if (!top.getEscClosable()) return "swallow"
  top.close()
  return "closed"
}

/** 若栈顶模态可用 ESC 关闭则关闭并返回 true（供全屏 ESC 链路与 document 监听共用） */
export function tryCloseTopModalFromEsc(): boolean {
  return resolveEscapeOnModalStack() === "closed"
}

function onDocumentKeydown(ev: KeyboardEvent) {
  if (ev.key !== "Escape") return
  const r = resolveEscapeOnModalStack()
  if (r === "none") return
  ev.preventDefault()
  // 仅在实际关闭顶层模态时阻断冒泡；swallow 时让事件继续到达内部控件（如先清空再关）
  if (r === "closed") {
    ev.stopPropagation()
  }
}

function ensureEscListener() {
  if (escListenerAttached) return
  document.addEventListener("keydown", onDocumentKeydown, true)
  escListenerAttached = true
}

function removeEscListenerIfIdle() {
  if (stack.length > 0 || !escListenerAttached) return
  document.removeEventListener("keydown", onDocumentKeydown, true)
  escListenerAttached = false
}

/**
 * 打开模态时注册：栈顶优先响应 ESC（仅关闭最顶层，不会跳过上层去关下层）；z-index 随栈深递增。
 * 关闭时必须调用返回的 unregister（通常在 v-model 变为 false 时）。
 */
export function registerModal(opts: {
  close: () => void
  getEscClosable: () => boolean
}): { zIndex: number; unregister: () => void } {
  const instanceId = ++nextInstanceId
  const zIndex = BASE_Z_INDEX + stack.length * Z_INDEX_STEP
  stack.push({
    instanceId,
    close: opts.close,
    getEscClosable: opts.getEscClosable,
  })
  ensureEscListener()

  return {
    zIndex,
    unregister: () => {
      const idx = stack.findIndex((e) => e.instanceId === instanceId)
      if (idx >= 0) stack.splice(idx, 1)
      removeEscListenerIfIdle()
    },
  }
}

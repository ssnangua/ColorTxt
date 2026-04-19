import {
  SHORTCUT_ACTIONS,
  type ShortcutActionId,
  type ShortcutBindingMap,
} from "./shortcutRegistry";

const MOD_ORDER = ["Control", "Command", "Alt", "Shift"] as const;
const NON_ACCELERATOR_KEYS = new Set(["Process", "Dead", "Unidentified"]);

/** 数字行与标点：按物理键位解析，避免 IME / 全角上屏污染 `ev.key` */
const SHIFT_NEUTRAL_BY_CODE: Record<string, string> = {
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
  Minus: "-",
  Equal: "=",
  /** 与 `Equal` 相同记号，匹配默认 `Ctrl+=` 加大字号，并避免 `key` 为 `+` 时拼出 `Control++` 破坏 `+` 分隔解析 */
  NumpadAdd: "=",
  NumpadSubtract: "-",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
};

const KEY_ALIAS: Record<string, string> = {
  ctrl: "Control",
  control: "Control",
  cmd: "Command",
  command: "Command",
  meta: "Command",
  option: "Alt",
  alt: "Alt",
  shift: "Shift",
  space: "Space",
  tab: "Tab",
  enter: "Enter",
  arrowleft: "Left",
  arrowright: "Right",
  arrowup: "Up",
  arrowdown: "Down",
  pageup: "PageUp",
  pagedown: "PageDown",
  esc: "Escape",
  escape: "Escape",
  return: "Enter",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
};

/** `ev.code` 为 Unidentified 等时的兜底（`keyCode` 已弃用，仅作兼容） */
function physicalKeyFromKeyCode(keyCode: number): string | null {
  if (keyCode >= 48 && keyCode <= 57) return String(keyCode - 48);
  if (keyCode >= 65 && keyCode <= 90) return String.fromCharCode(keyCode);
  if (keyCode >= 112 && keyCode <= 123) return `F${keyCode - 111}`;
  return null;
}

/**
 * 尽量用物理键位（`code`）决定快捷键主键，与布局/输入法无关；再退回 `keyCode`，最后才用 `key`。
 */
function physicalKeyFromCode(ev: KeyboardEvent): string | null {
  const { code } = ev;
  if (!code || code === "Unidentified") return null;

  if (code.startsWith("Digit")) {
    const d = code.slice(5);
    if (/^\d$/.test(d)) return d;
  }
  if (code.startsWith("Key")) {
    const letter = code.slice(3);
    if (/^[A-Z]$/.test(letter)) return letter;
  }
  const fm = /^F(\d{1,2})$/.exec(code);
  if (fm) return `F${fm[1]}`;

  const punct = SHIFT_NEUTRAL_BY_CODE[code];
  if (punct !== undefined) return punct;

  const alias = KEY_ALIAS[code.toLowerCase()];
  if (alias && !(MOD_ORDER as readonly string[]).includes(alias)) {
    return alias;
  }

  return null;
}

function normalizeToken(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const alias = KEY_ALIAS[t.toLowerCase()];
  if (alias) return alias;
  if (t.length === 1) return t.toUpperCase();
  if (/^f\d{1,2}$/i.test(t)) return t.toUpperCase();
  return t[0].toUpperCase() + t.slice(1);
}

function tokenizeAccelerator(raw: string): string[] {
  return String(raw ?? "")
    .split("+")
    .map(normalizeToken)
    .filter(Boolean);
}

export function normalizeAccelerator(raw: string): string {
  const parts = tokenizeAccelerator(raw);
  const mods = new Set<string>();
  let key = "";
  for (const p of parts) {
    if ((MOD_ORDER as readonly string[]).includes(p)) {
      mods.add(p);
    } else {
      key = p;
    }
  }
  const orderedMods = MOD_ORDER.filter((m) => mods.has(m));
  return key ? [...orderedMods, key].join("+") : "";
}

function keyFromKeyboardEvent(ev: KeyboardEvent): string {
  const fromCode = physicalKeyFromCode(ev);
  if (fromCode) {
    if (fromCode === " ") return "Space";
    return fromCode;
  }
  const fromLegacy = physicalKeyFromKeyCode(ev.keyCode);
  if (fromLegacy) {
    if (fromLegacy === " ") return "Space";
    return fromLegacy;
  }
  const k = normalizeToken(ev.key);
  if (k === " ") return "Space";
  return k;
}

export function keyboardEventToAccelerator(ev: KeyboardEvent): string {
  if (ev.isComposing || NON_ACCELERATOR_KEYS.has(String(ev.key || ""))) {
    return "";
  }
  const mods: string[] = [];
  if (ev.ctrlKey) mods.push("Control");
  if (ev.metaKey) mods.push("Command");
  if (ev.altKey) mods.push("Alt");
  if (ev.shiftKey) mods.push("Shift");
  const key = keyFromKeyboardEvent(ev);
  if (!key || (MOD_ORDER as readonly string[]).includes(key)) return "";
  return normalizeAccelerator([...mods, key].join("+"));
}

export function mergeShortcutBindings(
  defaults: ShortcutBindingMap,
  loaded?: Partial<Record<ShortcutActionId, string>>,
): ShortcutBindingMap {
  const next = { ...defaults };
  if (!loaded) return next;
  for (const action of SHORTCUT_ACTIONS) {
    const raw = loaded[action.id];
    if (typeof raw !== "string") continue;
    const normalized = normalizeAccelerator(raw);
    if (normalized) next[action.id] = normalized;
  }
  return next;
}

export function collectShortcutConflicts(
  bindings: ShortcutBindingMap,
): string[] {
  const firstByAccel = new Map<string, ShortcutActionId>();
  const errs: string[] = [];
  for (const action of SHORTCUT_ACTIONS) {
    const accel = normalizeAccelerator(bindings[action.id]);
    if (!accel) continue;
    const prev = firstByAccel.get(accel);
    if (!prev) {
      firstByAccel.set(accel, action.id);
      continue;
    }
    errs.push(`${prev} 与 ${action.id} 冲突：${accel}`);
  }
  return errs;
}

export function acceleratorToDisplayKeys(
  accel: string,
  isMac: boolean,
): string[] {
  const parts = tokenizeAccelerator(accel);
  if (parts.length === 0) return [];
  return parts.map((p) => {
    if (p === "Control") return isMac ? "Ctrl" : "Ctrl";
    if (p === "Command") return isMac ? "Cmd" : "Win";
    if (p === "Alt") return isMac ? "Option" : "Alt";
    if (p === "Shift") return "Shift";
    if (p === "Left") return "←";
    if (p === "Right") return "→";
    if (p === "Up") return "↑";
    if (p === "Down") return "↓";
    return p;
  });
}

export function acceleratorToDisplayText(
  accel: string,
  isMac: boolean,
): string {
  return acceleratorToDisplayKeys(accel, isMac).join("+");
}

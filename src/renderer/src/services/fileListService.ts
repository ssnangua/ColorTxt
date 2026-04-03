export type TxtFileItem = { name: string; path: string; size: number };

type OpenTxtDirectoryDialog = () => Promise<{
  dirPath: string;
  files: TxtFileItem[];
} | null>;

type ColorTxtShellApi = {
  openTxtDirectoryDialog?: OpenTxtDirectoryDialog;
};

export function basenameFromPath(filePath: string) {
  const p = filePath.replace(/\\/g, "/");
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}

export function normalizeTxtFileItem(item: TxtFileItem): TxtFileItem {
  // 统一只显示文件名，避免后端 name 字段偶发包含相对路径。
  return { ...item, name: basenameFromPath(item.path) };
}

/** 侧栏文件列表：按路径去重、统一显示名、按文件名排序（与是否「合并旧列表」无关） */
export function prepareTxtFileList(items: TxtFileItem[]): TxtFileItem[] {
  const byPath = new Map<string, TxtFileItem>();
  for (const item of items) {
    byPath.set(item.path, normalizeTxtFileItem(item));
  }
  return Array.from(byPath.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "zh-Hans-CN"),
  );
}

/** 侧栏文件列表：合并后按路径去重、统一显示名、按文件名排序 */
export function mergeTxtFileLists(
  existing: TxtFileItem[],
  incoming: TxtFileItem[],
): TxtFileItem[] {
  return prepareTxtFileList([...existing, ...incoming]);
}

export async function readTxtDirectoryFromDialog(
  colorTxt: ColorTxtShellApi | undefined,
): Promise<
  | { ok: true; dirPath: string; files: TxtFileItem[] }
  | { ok: false; reason: "missingApi" | "cancelled" }
> {
  const openDirectory = colorTxt?.openTxtDirectoryDialog;
  if (typeof openDirectory !== "function") {
    return { ok: false, reason: "missingApi" };
  }

  const result = await openDirectory();
  if (!result) return { ok: false, reason: "cancelled" };

  return {
    ok: true,
    dirPath: result.dirPath,
    files: result.files.map(normalizeTxtFileItem),
  };
}

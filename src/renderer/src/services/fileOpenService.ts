import { fileHistoryKey } from "../stores/recentHistoryStore";
import type { TxtFileItem } from "./fileListService";

type FileStat = {
  size: number;
  mtimeMs: number;
  isFile: boolean;
  isDirectory: boolean;
};

export async function prepareOpenFile(params: {
  filePath: string;
  txtFiles: TxtFileItem[];
  statFile: (filePath: string) => Promise<FileStat>;
}): Promise<
  | { ok: true; fileSize: number | null }
  | { ok: false; message: string }
> {
  const { filePath, txtFiles, statFile } = params;

  const fromList = txtFiles.find(
    (f) => fileHistoryKey(f.path) === fileHistoryKey(filePath),
  );
  let fallbackStat: FileStat | null = null;

  try {
    fallbackStat = fromList ? null : await statFile(filePath);
  } catch {
    return { ok: false, message: `文件不存在或不可访问：${filePath}` };
  }

  if (
    !fromList &&
    fallbackStat &&
    !fallbackStat.isFile &&
    !fallbackStat.isDirectory
  ) {
    return { ok: false, message: `文件不存在或不可访问：${filePath}` };
  }

  return {
    ok: true,
    fileSize: fromList?.size ?? fallbackStat?.size ?? null,
  };
}

/**
 * 与 Monaco / VS Code 常见换行语义一致：\r\n 计为一处换行；单独 \r 或 \n 也计为一处；
 * 分块读取时若 \r 与 \n 落在不同 chunk，不能对 \n 再计一行（否则行号会多于编辑器）。
 */
type PhysicalLineSplitter = {
  push(chunk: string): string[];
  /** 流结束：返回缓冲区中尚未以换行结尾的最后一段，若无则 null */
  flushEof(): string | null;
  /** 最近一次 push 后，尚未形成完整物理行的缓冲（与下一 chunk 拼接） */
  getPending(): string;
  reset(): void;
};

export function createPhysicalLineSplitter(): PhysicalLineSplitter {
  let buf = "";

  return {
    reset() {
      buf = "";
    },

    getPending() {
      return buf;
    },

    push(chunk: string): string[] {
      buf += chunk;
      const out: string[] = [];
      let lineStart = 0;
      let i = 0;

      while (i < buf.length) {
        const c = buf[i]!;
        if (c === "\r") {
          if (i + 1 < buf.length && buf[i + 1] === "\n") {
            out.push(buf.slice(lineStart, i));
            i += 2;
            lineStart = i;
          } else if (i + 1 >= buf.length) {
            buf = buf.slice(lineStart);
            return out;
          } else {
            out.push(buf.slice(lineStart, i));
            i += 1;
            lineStart = i;
          }
        } else if (c === "\n") {
          out.push(buf.slice(lineStart, i));
          i += 1;
          lineStart = i;
        } else {
          i += 1;
        }
      }

      buf = buf.slice(lineStart);
      return out;
    },

    flushEof() {
      if (!buf) return null;
      const last = buf;
      buf = "";
      return last;
    },
  };
}

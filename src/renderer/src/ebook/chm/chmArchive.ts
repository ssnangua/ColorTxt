/**
 * CHM (ITSF) archive reader: directory + section 0 / LZX section 1.
 * Ported from libmspack `chmd.c` (LGPL-2.1).
 */

import { LzxdDecoder } from "./lzxDecode";

const LZX_FRAME_SIZE = 32768;

const CHM_GUIDS = new Uint8Array([
  0x10, 0xfd, 0x01, 0x7c, 0xaa, 0x7b, 0xd0, 0x11, 0x9e, 0x0c, 0x00, 0xa0, 0xc9, 0x22, 0xe6, 0xec, 0x11, 0xfd, 0x01, 0x7c,
  0xaa, 0x7b, 0xd0, 0x11, 0x9e, 0x0c, 0x00, 0xa0, 0xc9, 0x22, 0xe6, 0xec,
]);

const CONTENT_NAME =
  "::DataSpace/Storage/MSCompressed/Content";
const CONTROL_NAME =
  "::DataSpace/Storage/MSCompressed/ControlData";
const SPANINFO_NAME =
  "::DataSpace/Storage/MSCompressed/SpanInfo";
const RTABLE_NAME =
  "::DataSpace/Storage/MSCompressed/Transform/" +
  "{7FC28940-9D31-11D0-9B27-00A0C91E9C7C}/InstanceData/ResetTable";

function readU32(dv: DataView, o: number): number {
  return dv.getUint32(o, true);
}

function readU64AsNumber(dv: DataView, o: number): number {
  const lo = dv.getUint32(o, true);
  const hi = dv.getUint32(o + 4, true);
  if (hi !== 0) {
    if (hi > 0x1fffff || (hi === 0x1fffff && lo > 0xfff00000)) {
      throw new Error("CHM：文件偏移超出可处理范围。");
    }
  }
  return hi * 0x1_0000_0000 + lo;
}

function readEncInt(u8: Uint8Array, start: number, end: number): { v: number; next: number; err: boolean } {
  let result = 0;
  let i = start;
  for (let n = 0; n < 9; n++) {
    if (i >= end) return { v: 0, next: i, err: true };
    const c = u8[i++]!;
    result = (result << 7) | (c & 0x7f);
    if (!(c & 0x80)) return { v: result, next: i, err: false };
  }
  return { v: 0, next: i, err: true };
}

export type ChmFileEntry = {
  name: string;
  section: 0 | 1;
  offset: number;
  length: number;
};

function normChmPathKey(name: string): string {
  return name.replace(/\\/g, "/").trim().toLowerCase();
}

export class ChmArchive {
  readonly files: ChmFileEntry[] = [];
  private readonly u8: Uint8Array;
  private readonly dv: DataView;
  private sec0Offset = 0;
  private chmLength = 0;
  private chunkSize = 4096;
  private numChunks = 0;
  private firstPmgl = 0;
  private lastPmgl = 0;
  /** File offset where PMGL chunk #0 starts */
  private pmglBase = 0;
  private readonly byKey = new Map<string, ChmFileEntry>();

  constructor(buffer: ArrayBuffer) {
    this.u8 = new Uint8Array(buffer);
    this.dv = new DataView(buffer);
    this.parse();
  }

  private parse(): void {
    if (this.u8.byteLength < 0x60) throw new Error("CHM：文件过小。");
    if (readU32(this.dv, 0) !== 0x46535449) throw new Error("CHM：不是有效的 ITSF 文件。");
    for (let i = 0; i < 32; i++) {
      if (this.u8[0x18 + i] !== CHM_GUIDS[i]) throw new Error("CHM：头 GUID 不匹配。");
    }
    const version = readU32(this.dv, 4);

    /* ITSF 0x38 起为 Header Section Table：HS0/HS1 偏移在 +0 / +0x10，CS0 仅在 v3+ 于 +0x20 */
    const hstOff = 0x38;
    const offsetHs0 = readU64AsNumber(this.dv, hstOff);
    const offsetHs1 = readU64AsNumber(this.dv, hstOff + 0x10);
    let sec0Off = readU64AsNumber(this.dv, hstOff + 0x20);

    if (offsetHs0 > this.u8.byteLength || offsetHs1 > this.u8.byteLength) {
      throw new Error("CHM：头段偏移无效。");
    }

    const hs0 = new DataView(this.u8.buffer, this.u8.byteOffset + offsetHs0, 0x18);
    this.chmLength = readU64AsNumber(hs0, 8);

    const hs1Abs = offsetHs1;
    if (hs1Abs + 0x54 > this.u8.byteLength) throw new Error("CHM：目录头截断。");
    const hs1 = new DataView(this.u8.buffer, this.u8.byteOffset + hs1Abs, 0x54);
    this.chunkSize = readU32(hs1, 0x10);
    this.firstPmgl = readU32(hs1, 0x20);
    this.lastPmgl = readU32(hs1, 0x24);
    this.numChunks = readU32(hs1, 0x2c);

    if (this.chunkSize < 0x16 || this.numChunks === 0) throw new Error("CHM：目录块无效。");
    if (this.chunkSize > 8192) throw new Error("CHM：不支持的块大小。");
    if (this.firstPmgl > this.lastPmgl) throw new Error("CHM：PMGL 范围无效。");

    this.pmglBase = hs1Abs + 0x54;

    if (version < 3) {
      sec0Off = this.pmglBase + this.chunkSize * this.numChunks;
    }
    this.sec0Offset = sec0Off;
    if (this.sec0Offset > this.chmLength) throw new Error("CHM：内容区偏移无效。");

    this.readDirectory();
  }

  private readDirectory(): void {
    const cs = this.chunkSize;
    const chunk = new Uint8Array(cs);
    let numChunks = this.numChunks;
    let chunkAbs = this.pmglBase;

    while (numChunks-- > 0) {
      if (chunkAbs + cs > this.u8.byteLength) throw new Error("CHM：目录块读取越界。");
      chunk.set(this.u8.subarray(chunkAbs, chunkAbs + cs));
      chunkAbs += cs;

      if (readU32(new DataView(chunk.buffer, chunk.byteOffset, 4), 0) !== 0x4c474d50) continue;

      let p = 0x14;
      const end = cs - 2;
      const numEntries = new DataView(chunk.buffer, chunk.byteOffset + end, 2).getUint16(0, true);

      for (let n = 0; n < numEntries; n++) {
        const r1 = readEncInt(chunk, p, end);
        if (r1.err) break;
        const nameLen = r1.v;
        p = r1.next;
        if (p + nameLen > end) break;
        const nameBytes = chunk.subarray(p, p + nameLen);
        p += nameLen;
        const name = new TextDecoder("utf-8", { fatal: false }).decode(nameBytes);

        const r2 = readEncInt(chunk, p, end);
        if (r2.err) break;
        const section = r2.v;
        p = r2.next;

        const r3 = readEncInt(chunk, p, end);
        if (r3.err) break;
        const offset = r3.v;
        p = r3.next;

        const r4 = readEncInt(chunk, p, end);
        if (r4.err) break;
        const length = r4.v;
        p = r4.next;

        if (nameLen === 0) continue;
        if (offset === 0 && length === 0 && nameBytes[nameLen - 1] === 0x2f) continue;
        if (section > 1) continue;

        const ent: ChmFileEntry = {
          name,
          section: section === 0 ? 0 : 1,
          offset,
          length,
        };
        const key = normChmPathKey(name);
        if (this.byKey.has(key)) continue;
        this.files.push(ent);
        this.byKey.set(key, ent);
      }
    }
  }

  getEntry(path: string): ChmFileEntry | undefined {
    return this.byKey.get(normChmPathKey(path));
  }

  readUncompressed(entry: ChmFileEntry): Uint8Array {
    if (entry.section !== 0) throw new Error("CHM：内部错误，非未压缩段。");
    const start = this.sec0Offset + entry.offset;
    const end = start + entry.length;
    if (start < 0 || end > this.u8.byteLength) throw new Error("CHM：未压缩文件越界。");
    return this.u8.slice(start, end);
  }

  /** 读取 MSCompressed 流中的区段（section 1） */
  readCompressedSlice(uncompOffset: number, uncompLength: number): Uint8Array {
    if (uncompLength === 0) return new Uint8Array(0);

    const content = this.getEntry(CONTENT_NAME);
    const control = this.getEntry(CONTROL_NAME);
    if (!content || !control || control.section !== 0) {
      throw new Error("CHM：缺少 LZX 控制流。");
    }
    const cdata = this.readUncompressed(control);
    if (cdata.byteLength < 0x1c) throw new Error("CHM：ControlData 过短。");
    const cdv = new DataView(cdata.buffer, cdata.byteOffset, cdata.byteLength);
    if (readU32(cdv, 4) !== 0x43585a4c) throw new Error("CHM：非 LZXC 压缩。");

    let resetInterval: number;
    let windowSize: number;
    const ver = readU32(cdv, 8);
    if (ver === 1) {
      resetInterval = readU32(cdv, 12);
      windowSize = readU32(cdv, 16);
    } else if (ver === 2) {
      resetInterval = readU32(cdv, 12) * LZX_FRAME_SIZE;
      windowSize = readU32(cdv, 16) * LZX_FRAME_SIZE;
    } else {
      throw new Error("CHM：不支持的 LZXC 版本。");
    }

    if (resetInterval === 0 || resetInterval % LZX_FRAME_SIZE !== 0) {
      throw new Error("CHM：LZX 重置间隔无效。");
    }

    let windowBits: number;
    switch (windowSize) {
      case 0x008000:
        windowBits = 15;
        break;
      case 0x010000:
        windowBits = 16;
        break;
      case 0x020000:
        windowBits = 17;
        break;
      case 0x040000:
        windowBits = 18;
        break;
      case 0x080000:
        windowBits = 19;
        break;
      case 0x100000:
        windowBits = 20;
        break;
      case 0x200000:
        windowBits = 21;
        break;
      default:
        throw new Error("CHM：不支持的 LZX 窗口大小。");
    }

    let streamTotal = 0;
    let compStartInFile = 0;
    let initialSkip = 0;
    let usedResetTable = false;

    const rtable = this.getEntry(RTABLE_NAME);
    if (rtable && rtable.section === 0) {
      const rt = this.readUncompressed(rtable);
      if (rt.byteLength >= 0x28 && readU32(new DataView(rt.buffer, rt.byteOffset, rt.byteLength), 0x20) === LZX_FRAME_SIZE) {
        const rtd = new DataView(rt.buffer, rt.byteOffset, rt.byteLength);
        let st = readU64AsNumber(rtd, 0x10);
        st += resetInterval - 1;
        st = Math.floor(st / resetInterval) * resetInterval;

        const entryIdx = Math.floor(uncompOffset / resetInterval) * (resetInterval / LZX_FRAME_SIZE);
        const numEntries = readU32(rtd, 4);
        const entrySize = readU32(rtd, 8);
        const tableOff = readU32(rtd, 12);
        const pos = tableOff + entryIdx * entrySize;
        if (
          entryIdx < numEntries &&
          pos + entrySize <= rt.byteLength &&
          (entrySize === 4 || entrySize === 8)
        ) {
          streamTotal = st;
          compStartInFile =
            entrySize === 8 ? readU64AsNumber(rtd, pos) : readU32(rtd, pos);
          initialSkip = entryIdx * LZX_FRAME_SIZE;
          usedResetTable = true;
        }
      }
    }

    if (!usedResetTable) {
      const span = this.getEntry(SPANINFO_NAME);
      if (!span || span.section !== 0 || span.length !== 8) {
        throw new Error("CHM：缺少 SpanInfo / ResetTable。");
      }
      const sd = this.readUncompressed(span);
      streamTotal = readU64AsNumber(new DataView(sd.buffer, sd.byteOffset, 8), 0);
      if (streamTotal <= 0) throw new Error("CHM：无效的解压长度。");
      compStartInFile = 0;
      initialSkip = 0;
    }

    const lzxInputStart = this.sec0Offset + content.offset + compStartInFile;
    const remainingStream = streamTotal - initialSkip;
    const resetFrames = resetInterval / LZX_FRAME_SIZE;

    const dec = new LzxdDecoder({
      data: this.u8,
      inputStart: lzxInputStart,
      windowBits,
      resetIntervalFrames: resetFrames,
      inputBufferSize: 4096,
      streamOutputLength: remainingStream,
    });

    const skip = uncompOffset - initialSkip;
    const out = new Uint8Array(uncompLength);
    let filled = 0;
    let discardLeft = skip;

    /* 必须单次 decompress(skip+len)：拆成「先 skip 再读」会破坏解码器与 Intel E8 路径的位流/缓冲状态（部分 CHM 会读出全 0）。 */
    const sink = (buf: Uint8Array, start: number, len: number): void => {
      let pos = start;
      const end = start + len;
      while (pos < end) {
        if (discardLeft > 0) {
          const use = Math.min(end - pos, discardLeft);
          discardLeft -= use;
          pos += use;
          continue;
        }
        if (filled < uncompLength) {
          const take = Math.min(end - pos, uncompLength - filled);
          out.set(buf.subarray(pos, pos + take), filled);
          filled += take;
          pos += take;
          continue;
        }
        pos = end;
      }
    };

    if (!dec.decompress(skip + uncompLength, sink)) throw new Error("CHM：LZX 解压失败。");
    if (discardLeft !== 0 || filled !== uncompLength) throw new Error("CHM：LZX 输出长度不足。");
    return out;
  }

  readFile(entry: ChmFileEntry): Uint8Array {
    if (entry.length === 0) return new Uint8Array(0);
    if (entry.section === 0) return this.readUncompressed(entry);
    return this.readCompressedSlice(entry.offset, entry.length);
  }
}
